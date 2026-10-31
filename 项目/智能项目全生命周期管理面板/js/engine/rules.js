/* rules.js —— 预警规则引擎（纯函数，零依赖）
 *
 * 契约见 docs/CONTRACT.md §6：
 *   PLM_ENGINE.registerRule(rule) / rules() / evaluate(state, opts) / defaultRules
 *
 * 设计要点：
 *   - 不读 localStorage、不读 DOM、不发请求、不改传入的 state；
 *   - evaluate 对每条规则独立 try/catch，单条规则炸掉不影响其它规则；
 *   - 内置 11 条规则，阈值全部来自 state.config（缺省有兜底）；
 *   - 阈值口径集中在本文件顶部，方便面板设置页对照。
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';
  var MAX_FINDINGS = 200;

  var LEVELS = { high: 0, mid: 1, low: 2 };
  var ENTITIES = ['project', 'task', 'risk', 'milestone', 'deliverable', 'change'];

  // 缺省阈值（可被 state.config / opts.config 覆盖）
  var DEFAULTS = {
    overdueHighDays: 7,        // 任务逾期 ≥7 天升 high
    stallDays: 14,             // 阶段停滞判定天数
    changePendingDays: 7,      // 变更悬置天数
    milestoneSoonDays: 7,      // 里程碑逼近窗口（天）
    milestoneMinProgress: 80,  // 里程碑逼近时要求的最低完成率（%）
    wipLimit: 6,               // 单人同时在制（doing）任务上限
    warnDaysBeforeDue: 3
  };

  var DAY_MS = 86400000;

  var builtin = [];     // 内置规则
  var registered = [];  // 外部注册规则（同 id 覆盖内置）

  // ---------------------------------------------------------------- 基础工具

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function dateStr(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function num(v, dflt) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : dflt;
  }

  function each(arr, fn) {
    if (!Array.isArray(arr)) return;
    for (var i = 0; i < arr.length; i++) fn(arr[i], i);
  }

  // 严格解析 'YYYY-MM-DD'（允许后面跟时间），非法返回 null
  function parseDay(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
    if (typeof v !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
    if (!m) return null;
    var y = +m[1], mo = +m[2], dd = +m[3];
    if (mo < 1 || mo > 12 || dd < 1 || dd > 31) return null;
    var d = new Date(y, mo - 1, dd);
    if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== dd) return null;
    return d;
  }

  function validDay(v) { return !!parseDay(v); }

  function parseTime(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? 0 : v.getTime();
    if (typeof v === 'number') return v;
    if (typeof v !== 'string' || !v.trim()) return 0;
    var t = new Date(v).getTime();
    return isNaN(t) ? 0 : t;
  }

  // b - a，单位天；任一侧非法返回 NaN
  function dayDiff(a, b) {
    var da = parseDay(a), db = parseDay(b);
    if (!da || !db) return NaN;
    return Math.round((db.getTime() - da.getTime()) / DAY_MS);
  }

  function addDays(day, n) {
    var d = parseDay(day);
    if (!d) return '';
    d.setDate(d.getDate() + (num(n, 0) | 0));
    return dateStr(d);
  }

  // 从 ISO 时间串取到日期部分
  function dayOf(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? '' : dateStr(v);
    if (typeof v !== 'string') return '';
    var s = v.trim().slice(0, 10);
    return validDay(s) ? s : '';
  }

  function byProject(arr, projectId) {
    var out = [];
    if (!Array.isArray(arr)) return out;
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      if (it && (!projectId || it.projectId === projectId)) out.push(it);
    }
    return out;
  }

  function findById(arr, id) {
    if (!Array.isArray(arr) || !id) return null;
    for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i].id === id) return arr[i];
    return null;
  }

  function stageOf(ctx, stageId) {
    var stages = ctx.config.stages;
    var s = findById(stages, stageId);
    return s ? String(s.name || s.id || '') : String(stageId || '未分阶段');
  }

  function stageIndex(ctx, stageId) {
    var stages = ctx.config.stages;
    if (!Array.isArray(stages)) return -1;
    for (var i = 0; i < stages.length; i++) if (stages[i] && stages[i].id === stageId) return i;
    return -1;
  }

  var LATE_RE = /上线|运维|发布|归档|交付验收|release|deploy|deliver|ops|maintain|archive/i;
  var ARCHIVE_RE = /归档|archive/i;

  function isLateStage(ctx, stageId) {
    var stages = ctx.config.stages;
    if (!Array.isArray(stages) || !stages.length) return false;
    var idx = stageIndex(ctx, stageId);
    var s = idx > -1 ? stages[idx] : null;
    var text = (String(stageId || '') + ' ' + (s ? (s.name || '') + ' ' + (s.id || '') : ''));
    if (LATE_RE.test(text)) return true;
    // 兜底：末两个阶段视为上线/归档
    return idx > -1 && idx >= stages.length - 2;
  }

  function isArchiveStage(ctx, stageId) {
    var idx = stageIndex(ctx, stageId);
    var s = idx > -1 ? ctx.config.stages[idx] : null;
    return ARCHIVE_RE.test(String(stageId || '') + ' ' + (s ? String(s.name || '') : ''));
  }

  function memberName(state, id) {
    var m = findById(state.members, id);
    return m ? String(m.name || m.id) : (id ? String(id) : '未指派');
  }

  // ---------------------------------------------------------------- 派生计算

  function emptyState() {
    return {
      version: 1, meta: {}, config: {},
      projects: [], tasks: [], risks: [], changes: [],
      milestones: [], deliverables: [], members: [], diagrams: [], logs: []
    };
  }

  function normalizeState(state) {
    var base = emptyState();
    if (!state || typeof state !== 'object') return base;
    var out = base, keys, i;
    keys = ['projects', 'tasks', 'risks', 'changes', 'milestones', 'deliverables', 'members', 'diagrams', 'logs'];
    for (i = 0; i < keys.length; i++) {
      if (Array.isArray(state[keys[i]])) out[keys[i]] = state[keys[i]];
    }
    out.config = (state.config && typeof state.config === 'object') ? state.config : {};
    out.meta = (state.meta && typeof state.meta === 'object') ? state.meta : {};
    out.version = state.version || 1;
    return out;
  }

  function computeDerive(state, project, today) {
    var tasks = byProject(state.tasks, project.id);
    var ts = { todo: 0, doing: 0, review: 0, done: 0, total: tasks.length, overdue: 0 };
    each(tasks, function (t) {
      if (!t) return;
      var s = (t.status === 'doing' || t.status === 'review' || t.status === 'done') ? t.status : 'todo';
      ts[s]++;
      if (s !== 'done' && validDay(t.dueDate) && dayDiff(t.dueDate, today) > 0) ts.overdue++;
    });
    var riskScore = 0;
    each(byProject(state.risks, project.id), function (r) {
      if (!r || r.status === 'closed') return;
      riskScore += num(r.probability, 0) * num(r.impact, 0);
    });
    var progress = ts.total ? Math.round(ts.done / ts.total * 100) : 0;
    var health = (ts.overdue >= 3 || riskScore >= 30) ? 'bad'
      : (ts.overdue > 0 || riskScore >= 15) ? 'warn' : 'ok';
    var overdue = validDay(project.dueDate) && project.status !== 'archived' && dayDiff(project.dueDate, today) > 0;
    return { progress: progress, health: health, taskStats: ts, riskScore: riskScore, overdue: overdue };
  }

  function makeCtx(state, opts) {
    opts = (opts && typeof opts === 'object') ? opts : {};
    var st = normalizeState(state);
    var nowTime = parseTime(opts.now) || Date.now();
    var today = dayOf(opts.today);
    if (!today) today = dateStr(new Date(nowTime));
    var config = (opts.config && typeof opts.config === 'object') ? opts.config : st.config;
    var cache = Object.create(null);

    function derive(project) {
      if (!project || !project.id) return { progress: 0, health: 'ok', taskStats: { todo: 0, doing: 0, review: 0, done: 0, total: 0, overdue: 0 }, riskScore: 0, overdue: false };
      var hit = cache[project.id];
      if (hit) return hit;
      var d = computeDerive(st, project, today);
      cache[project.id] = d;
      return d;
    }

    return {
      state: st,
      now: new Date(nowTime).toISOString(),
      today: today,
      config: config,
      derive: derive,
      // 内部用，规则可用可不用
      nowTime: nowTime
    };
  }

  // ---------------------------------------------------------------- Finding

  function makeFinding(ruleId, f) {
    var entity = ENTITIES.indexOf(f.entity) > -1 ? f.entity : 'project';
    var entityId = f.entityId != null ? String(f.entityId) : (f.projectId != null ? String(f.projectId) : '');
    return {
      id: ruleId + ':' + entity + ':' + entityId,
      ruleId: ruleId,
      level: LEVELS[f.level] === undefined ? 'mid' : f.level,
      projectId: f.projectId != null ? String(f.projectId) : null,
      entity: entity,
      entityId: entityId,
      title: String(f.title == null ? '' : f.title),
      detail: String(f.detail == null ? '' : f.detail),
      suggestion: String(f.suggestion == null ? '' : f.suggestion)
    };
  }

  // ---------------------------------------------------------------- 内置规则

  // 1. 任务逾期
  builtin.push({
    id: 'task.overdue',
    name: '任务逾期',
    scope: 'task',
    level: 'mid',
    description: '任务截止日早于今天且状态不是 done；逾期超过 config.overdueHighDays（默认 7）天升为 high。',
    test: function (ctx) {
      var out = [];
      var highDays = num(ctx.config.overdueHighDays, DEFAULTS.overdueHighDays);
      var projects = ctx.state.projects;
      each(ctx.state.tasks, function (t) {
        if (!t || t.status === 'done') return;
        if (!validDay(t.dueDate)) return;
        var overdue = dayDiff(t.dueDate, ctx.today);
        if (!(overdue > 0)) return;
        var p = findById(projects, t.projectId);
        var lvl = overdue >= highDays ? 'high' : 'mid';
        out.push(makeFinding('task.overdue', {
          level: lvl,
          projectId: t.projectId || null,
          entity: 'task',
          entityId: t.id,
          title: '任务已逾期 ' + overdue + ' 天：' + (t.title || t.id),
          detail: (p ? '项目「' + (p.name || p.id) + '」下，' : '') +
            '任务「' + (t.title || t.id) + '」截止 ' + dayOf(t.dueDate) +
            '，当前状态 ' + (t.status || 'todo') + '，负责人 ' + memberName(ctx.state, t.assignee) + '。',
          suggestion: overdue >= highDays
            ? '今天就把「' + (t.title || t.id) + '」的截止日改到 ' + addDays(ctx.today, 3) +
              ' 并拆出不超过 1 人天的第一个子任务；若确实做不完，改期要写清卡在哪。'
            : '把「' + (t.title || t.id) + '」的截止日顺延到 ' + addDays(ctx.today, 2) +
              '，或在今天之内把它移回 todo 并说明原因。'
        }));
      });
      return out;
    }
  });

  // 2. 阶段停滞
  builtin.push({
    id: 'stage.stall',
    name: '阶段停滞',
    scope: 'project',
    level: 'mid',
    description: '项目当前阶段内「最久没被更新」的任务超过 config.stallDays（默认 14）天没动。',
    test: function (ctx) {
      var out = [];
      var limitDays = num(ctx.config.stallDays, DEFAULTS.stallDays);
      each(ctx.state.projects, function (p) {
        if (!p || p.status === 'done' || p.status === 'archived') return;
        var stageKey = p.stageId || '';
        var tasks = byProject(ctx.state.tasks, p.id);
        var oldest = null, oldestMs = 0;
        each(tasks, function (t) {
          if (!t || (t.stageId || '') !== stageKey) return;
          var ms = parseTime(t.updatedAt) || parseTime(t.createdAt);
          if (!ms) return;
          if (!oldest || ms < oldestMs) { oldest = t; oldestMs = ms; }
        });
        if (!oldest) return;
        var days = Math.floor((ctx.nowTime - oldestMs) / DAY_MS);
        if (!(days > limitDays)) return;
        var stageName = stageOf(ctx, stageKey);
        out.push(makeFinding('stage.stall', {
          level: days > limitDays * 2 ? 'high' : 'mid',
          projectId: p.id,
          entity: 'project',
          entityId: p.id + ':' + stageKey,
          title: '阶段停滞 ' + days + ' 天：' + (p.name || p.id) + ' / ' + stageName,
          detail: '项目「' + (p.name || p.id) + '」停在「' + stageName + '」阶段，' +
            '其中「' + (oldest.title || oldest.id) + '」最后更新于 ' + dayOf(oldest.updatedAt || oldest.createdAt) +
            '，已 ' + days + ' 天没有推进。',
          suggestion: '本周给「' + stageName + '」排一个 ≤1 人天的下一步（例如把「' +
            (oldest.title || oldest.id) + '」推进到 review），或把项目状态改成 paused 并写清阻塞原因。'
        }));
      });
      return out;
    }
  });

  // 3. 高风险未缓解
  builtin.push({
    id: 'risk.highUnmitigated',
    name: '高风险未缓解',
    scope: 'risk',
    level: 'high',
    description: '风险 P×I ≥ 15 且 status 仍为 open（没有进入 mitigating）。',
    test: function (ctx) {
      var out = [];
      each(ctx.state.risks, function (r) {
        if (!r || r.status !== 'open') return;
        var score = num(r.probability, 0) * num(r.impact, 0);
        if (!(score >= 15)) return;
        var p = findById(ctx.state.projects, r.projectId);
        out.push(makeFinding('risk.highUnmitigated', {
          level: 'high',
          projectId: r.projectId || null,
          entity: 'risk',
          entityId: r.id,
          title: '高风险未缓解（P×I=' + score + '）：' + (r.title || r.id),
          detail: (p ? '项目「' + (p.name || p.id) + '」，' : '') +
            '概率 ' + num(r.probability, 0) + ' × 影响 ' + num(r.impact, 0) + ' = ' + score +
            '，状态 open，缓解措施：' + (r.mitigation ? String(r.mitigation) : '（未填写）') + '。',
          suggestion: '今天就给「' + (r.title || r.id) + '」指定负责人和一条可验收的缓解动作，' +
            '并在 ' + addDays(ctx.today, 3) + ' 前把状态改成 mitigating；' +
            (score >= 20 ? 'P×I≥20，需要项目发起人过目。' : '缓解后重新评估 P/I 再降级。')
        }));
      });
      return out;
    }
  });

  // 4. 变更悬而未决
  builtin.push({
    id: 'change.pending',
    name: '变更悬而未决',
    scope: 'change',
    level: 'mid',
    description: '变更单 status 仍为 proposed，且提出时间超过 config.changePendingDays（默认 7）天。',
    test: function (ctx) {
      var out = [];
      var limitDays = num(ctx.config.changePendingDays, DEFAULTS.changePendingDays);
      each(ctx.state.changes, function (c) {
        if (!c || c.status !== 'proposed') return;
        var since = dayOf(c.createdAt);
        if (!since) return;
        var days = dayDiff(since, ctx.today);
        if (!(days > limitDays)) return;
        var p = findById(ctx.state.projects, c.projectId);
        out.push(makeFinding('change.pending', {
          level: days > limitDays * 3 ? 'high' : 'mid',
          projectId: c.projectId || null,
          entity: 'change',
          entityId: c.id,
          title: '变更悬置 ' + days + ' 天：' + (c.title || c.id),
          detail: (p ? '项目「' + (p.name || p.id) + '」，' : '') +
            '变更「' + (c.title || c.id) + '」自 ' + since + ' 起一直是 proposed，' +
            '影响：' + (c.impact ? String(c.impact) : '（未填写）') + '。',
          suggestion: '下次评审会上给它一个结论：批准就写定排期（' + addDays(ctx.today, 7) +
            ' 前落到任务里），驳回就在 reason 里补一句依据，然后把状态改掉。'
        }));
      });
      return out;
    }
  });

  // 5. 里程碑逼近
  builtin.push({
    id: 'milestone.approaching',
    name: '里程碑逼近',
    scope: 'milestone',
    level: 'mid',
    description: '里程碑在 config.milestoneSoonDays（默认 7）天内到期、仍是 pending，且关联任务完成率低于 config.milestoneMinProgress（默认 80%）。',
    test: function (ctx) {
      var out = [];
      var soon = num(ctx.config.milestoneSoonDays, num(ctx.config.warnDaysBeforeDue, DEFAULTS.milestoneSoonDays));
      var need = num(ctx.config.milestoneMinProgress, DEFAULTS.milestoneMinProgress);
      each(ctx.state.milestones, function (m) {
        if (!m || m.status !== 'pending') return;
        if (!validDay(m.dueDate)) return;
        var left = dayDiff(ctx.today, m.dueDate);
        if (!(left >= 0 && left <= soon)) return;
        var p = findById(ctx.state.projects, m.projectId);
        if (!p) return;
        var progress;
        if (Array.isArray(m.taskIds) && m.taskIds.length) {
          var done = 0, total = 0;
          each(m.taskIds, function (tid) {
            var t = findById(ctx.state.tasks, tid);
            if (!t) return;
            total++;
            if (t.status === 'done') done++;
          });
          progress = total ? Math.round(done / total * 100) : 0;
        } else {
          // Milestone 在 §2 里没有 taskIds，退化为项目整体完成率
          progress = ctx.derive(p).progress;
        }
        if (!(progress < need)) return;
        out.push(makeFinding('milestone.approaching', {
          level: left <= 2 ? 'high' : 'mid',
          projectId: m.projectId || null,
          entity: 'milestone',
          entityId: m.id,
          title: '里程碑 ' + left + ' 天后到期，完成率仅 ' + progress + '%：' + (m.title || m.id),
          detail: '项目「' + (p.name || p.id) + '」的里程碑「' + (m.title || m.id) +
            '」将于 ' + dayOf(m.dueDate) + ' 到期，当前完成率 ' + progress + '%，低于要求的 ' + need + '%。',
          suggestion: '把「' + (m.title || m.id) + '」未完成任务里最关键的 2 条拉进本周，' +
            '或把日期顺延到 ' + addDays(m.dueDate, 7) + ' 并同步发起人。'
        }));
      });
      return out;
    }
  });

  // 6. 里程碑错过
  builtin.push({
    id: 'milestone.missed',
    name: '里程碑错过',
    scope: 'milestone',
    level: 'high',
    description: '里程碑截止日早于今天且状态仍是 pending。',
    test: function (ctx) {
      var out = [];
      each(ctx.state.milestones, function (m) {
        if (!m || m.status !== 'pending') return;
        if (!validDay(m.dueDate)) return;
        var late = dayDiff(m.dueDate, ctx.today);
        if (!(late > 0)) return;
        var p = findById(ctx.state.projects, m.projectId);
        out.push(makeFinding('milestone.missed', {
          level: 'high',
          projectId: m.projectId || null,
          entity: 'milestone',
          entityId: m.id,
          title: '里程碑已错过 ' + late + ' 天：' + (m.title || m.id),
          detail: (p ? '项目「' + (p.name || p.id) + '」，' : '') +
            '里程碑「' + (m.title || m.id) + '」原定 ' + dayOf(m.dueDate) + '，至今仍是 pending。',
          suggestion: '把「' + (m.title || m.id) + '」状态改成 missed 并补一句原因，' +
            '同时把它后面的里程碑重排到 ' + addDays(ctx.today, 14) + ' 之后，别让日期虚着。'
        }));
      });
      return out;
    }
  });

  // 7. 交付物未验收
  builtin.push({
    id: 'deliverable.unaccepted',
    name: '交付物未验收',
    scope: 'deliverable',
    level: 'mid',
    description: '项目已进入上线/运维/归档阶段，但还有交付物不是 accepted。',
    test: function (ctx) {
      var out = [];
      each(ctx.state.deliverables, function (d) {
        if (!d || d.status === 'accepted') return;
        var p = findById(ctx.state.projects, d.projectId);
        if (!p) return;
        if (!isLateStage(ctx, p.stageId)) return;
        var st = String(d.status || 'draft');
        out.push(makeFinding('deliverable.unaccepted', {
          level: st === 'draft' ? 'high' : 'mid',
          projectId: d.projectId || null,
          entity: 'deliverable',
          entityId: d.id,
          title: '交付物未验收（' + st + '）：' + (d.name || d.id),
          detail: '项目「' + (p.name || p.id) + '」已在「' + stageOf(ctx, p.stageId) +
            '」阶段，交付物「' + (d.name || d.id) + '」' + (d.version ? ' v' + d.version : '') +
            '仍是 ' + st + '，验收人：' + (d.reviewer || '未指定') + '。',
          suggestion: '在 ' + addDays(ctx.today, 3) + ' 前约验收人过一遍「' + (d.name || d.id) +
            '」；过不了就把它退回 draft 并列出待修项，别带着未验收的东西进运维。'
        }));
      });
      return out;
    }
  });

  // 8. WIP 超限
  builtin.push({
    id: 'wip.overLimit',
    name: 'WIP 超限',
    scope: 'member',
    level: 'mid',
    description: '某成员手上 doing 状态任务数超过 config.wipLimit（默认 6）。',
    test: function (ctx) {
      var out = [];
      var limit = num(ctx.config.wipLimit, DEFAULTS.wipLimit);
      var buckets = Object.create(null);
      each(ctx.state.tasks, function (t) {
        if (!t || t.status !== 'doing' || !t.assignee) return;
        var key = String(t.assignee);
        (buckets[key] || (buckets[key] = [])).push(t);
      });
      Object.keys(buckets).forEach(function (mid) {
        var list = buckets[mid];
        if (list.length <= limit) return;
        list.sort(function (a, b) {
          var da = validDay(a.dueDate) ? a.dueDate : '9999-12-31';
          var db = validDay(b.dueDate) ? b.dueDate : '9999-12-31';
          return da < db ? -1 : da > db ? 1 : 0;
        });
        var first = list[0];
        out.push(makeFinding('wip.overLimit', {
          level: list.length > limit * 1.5 ? 'high' : 'mid',
          projectId: first.projectId || null,
          entity: 'task',
          entityId: first.id,
          title: memberName(ctx.state, mid) + ' 同时在制 ' + list.length + ' 条（上限 ' + limit + '）',
          detail: '成员「' + memberName(ctx.state, mid) + '」手上有 ' + list.length +
            ' 条 doing 任务，最早到期的是「' + (first.title || first.id) + '」（' + dayOf(first.dueDate) + '）。',
          suggestion: '把「' + (first.title || first.id) + '」之外最不紧急的 ' +
            (list.length - limit) + ' 条移回 todo 或转给别人，先让在制数回到 ' + limit + ' 以内。'
        }));
      });
      return out;
    }
  });

  // 9. 项目无负责人
  builtin.push({
    id: 'project.noOwner',
    name: '项目无负责人',
    scope: 'project',
    level: 'high',
    description: 'active 项目没有指定 owner（memberId）。',
    test: function (ctx) {
      var out = [];
      each(ctx.state.projects, function (p) {
        if (!p || p.status === 'archived') return;
        if (p.owner && String(p.owner).trim()) return;
        out.push(makeFinding('project.noOwner', {
          level: 'high',
          projectId: p.id,
          entity: 'project',
          entityId: p.id,
          title: '项目无负责人：' + (p.name || p.id),
          detail: '项目「' + (p.name || p.id) + '」（' + (p.code || p.id) + '）状态 ' +
            (p.status || 'active') + '，owner 为空，出了问题没人兜底。',
          suggestion: '在项目设置里指定负责人；如果暂时没人接，把状态改成 paused 并在描述里写清等谁、等什么。'
        }));
      });
      return out;
    }
  });

  // 10. 项目超期未归档
  builtin.push({
    id: 'project.overdue',
    name: '项目超期未归档',
    scope: 'project',
    level: 'high',
    description: '项目 dueDate 已过、状态不是 archived、阶段也没到归档。',
    test: function (ctx) {
      var out = [];
      each(ctx.state.projects, function (p) {
        if (!p || p.status === 'archived') return;
        if (!validDay(p.dueDate)) return;
        if (isArchiveStage(ctx, p.stageId)) return;
        var late = dayDiff(p.dueDate, ctx.today);
        if (!(late > 0)) return;
        out.push(makeFinding('project.overdue', {
          level: late >= 7 ? 'high' : 'mid',
          projectId: p.id,
          entity: 'project',
          entityId: p.id,
          title: '项目超期 ' + late + ' 天仍在「' + stageOf(ctx, p.stageId) + '」阶段',
          detail: '项目「' + (p.name || p.id) + '」原定 ' + dayOf(p.dueDate) + ' 结束，' +
            '现在超期 ' + late + ' 天，状态 ' + (p.status || 'active') + '，阶段「' + stageOf(ctx, p.stageId) + '」。',
          suggestion: '二选一并在今天定下来：收口就列出剩余 3 条以内任务、给一个 ' + addDays(ctx.today, 7) +
            ' 的新截止日；不收就改状态为 paused/archived 并写明原因。'
        }));
      });
      return out;
    }
  });

  // 11. 项目零任务（空转）
  builtin.push({
    id: 'project.noTasks',
    name: '项目空转（零任务）',
    scope: 'project',
    level: 'mid',
    description: 'active 项目下一条任务都没有。',
    test: function (ctx) {
      var out = [];
      each(ctx.state.projects, function (p) {
        if (!p || p.status !== 'active') return;
        if (byProject(ctx.state.tasks, p.id).length) return;
        out.push(makeFinding('project.noTasks', {
          level: 'mid',
          projectId: p.id,
          entity: 'project',
          entityId: p.id,
          title: '项目空转：' + (p.name || p.id) + ' 下没有任何任务',
          detail: '项目「' + (p.name || p.id) + '」状态 active，但任务数为 0，看板上看不出它到底在做什么。',
          suggestion: '给「' + (p.name || p.id) + '」补 3 条最小任务（需求确认 / 方案 / 验收），' +
            '每条写明负责人和截止日；补不出来就先归档。'
        }));
      });
      return out;
    }
  });

  // ---------------------------------------------------------------- 注册与评估

  function registerRule(rule) {
    if (!rule || typeof rule !== 'object') {
      console.warn('[engine] registerRule 需要规则对象');
      return false;
    }
    if (!rule.id || typeof rule.id !== 'string') {
      console.warn('[engine] registerRule 缺少字符串 id');
      return false;
    }
    if (typeof rule.test !== 'function') {
      console.warn('[engine] registerRule 缺少 test()：' + rule.id);
      return false;
    }
    var item = {
      id: rule.id,
      name: String(rule.name || rule.id),
      scope: String(rule.scope || 'project'),
      level: rule.level || 'mid',
      description: String(rule.description || ''),
      test: rule.test
    };
    for (var i = 0; i < registered.length; i++) {
      if (registered[i].id === item.id) { registered[i] = item; return true; }
    }
    registered.push(item);
    return true;
  }

  function rules() {
    var list = builtin.slice();
    for (var i = 0; i < registered.length; i++) {
      var r = registered[i], hit = -1;
      for (var j = 0; j < list.length; j++) if (list[j].id === r.id) { hit = j; break; }
      if (hit > -1) list[hit] = r; else list.push(r);
    }
    return list;
  }

  function evaluate(state, opts) {
    var ctx = makeCtx(state, opts);
    var list = rules();
    var found = [];
    var seenIds = Object.create(null);

    for (var i = 0; i < list.length; i++) {
      var rule = list[i];
      if (!rule || typeof rule.test !== 'function') continue;
      var raw;
      // 每条规则独立 try/catch：单条规则异常不影响其它规则
      try {
        raw = rule.test(ctx);
      } catch (e) {
        console.error('[engine] 规则执行失败 ' + (rule.id || '?'), e);
        continue;
      }
      if (!raw) continue;
      var items = Array.isArray(raw) ? raw : [raw];
      for (var k = 0; k < items.length; k++) {
        var f = items[k];
        if (!f || typeof f !== 'object') continue;
        if (!f.title) continue;
        var item = makeFinding(f.ruleId || rule.id, {
          level: f.level || rule.level || 'mid',
          projectId: f.projectId,
          entity: f.entity,
          entityId: f.entityId,
          title: f.title,
          detail: f.detail,
          suggestion: f.suggestion
        });
        if (!item.suggestion) item.suggestion = '核对「' + item.title + '」并给出下一步动作与截止日。';
        if (seenIds[item.id]) {
          var n = 2;
          while (seenIds[item.id + '#' + n]) n++;
          item.id = item.id + '#' + n;
        }
        seenIds[item.id] = true;
        found.push(item);
      }
      if (found.length >= MAX_FINDINGS * 4) break; // 粗剪，避免极端数据量拖慢
    }

    // 稳定排序：high → mid → low，同级保持规则产出顺序
    var indexed = found.map(function (f, idx) { return { f: f, idx: idx }; });
    indexed.sort(function (a, b) {
      var la = LEVELS[a.f.level] === undefined ? 1 : LEVELS[a.f.level];
      var lb = LEVELS[b.f.level] === undefined ? 1 : LEVELS[b.f.level];
      if (la !== lb) return la - lb;
      return a.idx - b.idx;
    });

    return indexed.slice(0, MAX_FINDINGS).map(function (x) { return x.f; });
  }

  var api = {
    VERSION: VERSION,
    MAX_FINDINGS: MAX_FINDINGS,
    DEFAULTS: DEFAULTS,
    defaultRules: builtin,
    registerRule: registerRule,
    rules: rules,
    evaluate: evaluate
  };

  global.PLM_ENGINE = api;
})(typeof window !== 'undefined' ? window : globalThis);
