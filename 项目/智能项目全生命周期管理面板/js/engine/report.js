/* report.js —— 报告与导出（纯函数，零依赖，禁止 DOM / 网络）
 *
 * 契约见 docs/CONTRACT.md §7：
 *   PLM_REPORT.weekly(state, opts) / projectSummary(state, projectId)
 *   toCSV(rows, columns) / toMarkdownTable(rows, columns)
 *
 * 说明：
 *   - 所有数字都从传入的 state 现算，不缓存、不猜；
 *   - 数据缺失/为空的段落写「无」，任何入参都不抛异常；
 *   - 预警小节复用 PLM_ENGINE（未加载时降级为文案，不崩）。
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';
  var NO = '无';

  // ---------------------------------------------------------------- 基础工具

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function dateStr(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

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

  function dayOf(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? '' : dateStr(v);
    if (typeof v !== 'string') return '';
    var s = v.trim().slice(0, 10);
    return validDay(s) ? s : '';
  }

  function addDays(day, n) {
    var d = parseDay(day);
    if (!d) return '';
    d.setDate(d.getDate() + (n | 0));
    return dateStr(d);
  }

  function dayDiff(a, b) {
    var da = parseDay(a), db = parseDay(b);
    if (!da || !db) return NaN;
    return Math.round((db.getTime() - da.getTime()) / 86400000);
  }

  function num(v, dflt) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : dflt;
  }

  function txt(v) { return v == null ? '' : String(v); }

  // Markdown 单元内容转义：竖线与换行会破坏表格
  function cell(v) {
    return txt(v).replace(/\|/g, '\\|').replace(/\r\n?/g, '\n').replace(/\n/g, '<br>');
  }

  function safeState(state) {
    var keys = ['projects', 'tasks', 'risks', 'changes', 'milestones', 'deliverables', 'members'];
    var out = {
      version: 1, config: {}, meta: {},
      projects: [], tasks: [], risks: [], changes: [], milestones: [], deliverables: [], members: []
    };
    if (state && typeof state === 'object') {
      for (var i = 0; i < keys.length; i++) if (Array.isArray(state[keys[i]])) out[keys[i]] = state[keys[i]];
      out.config = (state.config && typeof state.config === 'object') ? state.config : {};
      out.meta = (state.meta && typeof state.meta === 'object') ? state.meta : {};
    }
    return out;
  }

  function list(arr) { return Array.isArray(arr) ? arr.filter(function (x) { return x && typeof x === 'object'; }) : []; }

  function byId(arr, id) {
    if (!Array.isArray(arr) || !id) return null;
    for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i].id === id) return arr[i];
    return null;
  }

  function memberName(state, id) {
    var m = byId(state.members, id);
    return m ? txt(m.name || m.id) : (id ? txt(id) : '未指派');
  }

  function stageName(cfg, stageId) {
    var s = byId(Array.isArray(cfg.stages) ? cfg.stages : [], stageId);
    return s ? txt(s.name || s.id) : (stageId ? txt(stageId) : '未分阶段');
  }

  function riskLevel(p, i) {
    var score = num(p, 0) * num(i, 0);
    return score >= 15 ? '高' : score >= 8 ? '中' : '低';
  }

  function pct(a, b) { return b > 0 ? Math.round(a / b * 100) : 0; }

  function todayStr() { return dateStr(new Date()); }

  // ---------------------------------------------------------------- 表格与导出

  function normColumns(rows, columns) {
    var out = [];
    if (Array.isArray(columns)) {
      for (var i = 0; i < columns.length; i++) {
        var c = columns[i];
        if (!c) continue;
        if (typeof c === 'string') out.push({ key: c, label: c });
        else if (c.key != null) out.push({ key: String(c.key), label: txt(c.label != null ? c.label : c.key) });
      }
    }
    if (out.length) return out;
    // 没给列定义：取首行对象的键
    var first = list(rows)[0];
    if (!first) return out;
    var used = Object.create(null);
    Object.keys(first).forEach(function (k) { if (!used[k]) { used[k] = 1; out.push({ key: k, label: k }); } });
    return out;
  }

  function pick(row, key) {
    if (!row || typeof row !== 'object') return '';
    return row[key] == null ? '' : row[key];
  }

  function csvCell(v) {
    var s = txt(v);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  // UTF-8 带 BOM 的 CSV；逗号/引号/换行按 RFC 4180 转义
  function toCSV(rows, columns) {
    var cols = normColumns(rows, columns);
    var lines = [];
    if (cols.length) {
      lines.push(cols.map(function (c) { return csvCell(c.label); }).join(','));
      list(rows).forEach(function (r) {
        lines.push(cols.map(function (c) { return csvCell(pick(r, c.key)); }).join(','));
      });
    }
    return '\uFEFF' + (lines.length ? lines.join('\r\n') + '\r\n' : '');
  }

  function looksNumeric(v) {
    if (typeof v === 'number') return isFinite(v);
    var s = txt(v).trim();
    if (!s) return false;
    return /^-?\d+(\.\d+)?%?$/.test(s);
  }

  function toMarkdownTable(rows, columns) {
    var cols = normColumns(rows, columns);
    if (!cols.length) return '';
    var data = list(rows);
    var aligns = cols.map(function (c) {
      var seen = 0, allNum = true;
      data.forEach(function (r) {
        var v = pick(r, c.key);
        if (v === '' || v == null) return;
        seen++;
        if (!looksNumeric(v)) allNum = false;
      });
      return seen && allNum ? '---:' : ':---';
    });
    var head = '| ' + cols.map(function (c) { return cell(c.label); }).join(' | ') + ' |';
    var sep = '| ' + aligns.join(' | ') + ' |';
    var body = data.map(function (r) {
      return '| ' + cols.map(function (c) { return cell(pick(r, c.key)); }).join(' | ') + ' |';
    });
    return [head, sep].concat(body).join('\n');
  }

  // 空数据统一写「无」，避免调用方到处判空
  function tableOrNone(rows, columns) {
    var data = list(rows);
    if (!data.length) return NO;
    return toMarkdownTable(data, columns);
  }

  // ---------------------------------------------------------------- 周报

  function scopeProjects(state, opts) {
    var all = list(state.projects);
    var sel = opts && opts.projects;
    if (!sel || !sel.length) return all;
    var ids = Object.create(null);
    sel.forEach(function (x) {
      if (x == null) return;
      ids[String(typeof x === 'object' ? (x.id || '') : x)] = 1;
    });
    var out = all.filter(function (p) { return ids[String(p.id)]; });
    return out.length ? out : all;
  }

  function findingsOf(state) {
    var eng = global.PLM_ENGINE;
    if (!eng || typeof eng.evaluate !== 'function') return null;
    try {
      var f = eng.evaluate(state);
      return Array.isArray(f) ? f : [];
    } catch (e) {
      console.error('[report] 预警引擎调用失败', e);
      return null;
    }
  }

  var LEVEL_CN = { high: '高', mid: '中', low: '低' };

  function weekly(state, opts) {
    opts = (opts && typeof opts === 'object') ? opts : {};
    var st = safeState(state);
    var cfg = st.config;
    var until = validDay(opts.until) ? dayOf(opts.until) : todayStr();
    var since = validDay(opts.since) ? dayOf(opts.since) : addDays(until, -6);
    if (!since) since = until;

    var projects = scopeProjects(st, opts);
    var pids = Object.create(null);
    projects.forEach(function (p) { pids[String(p.id)] = 1; });
    function inScope(x) { return x && pids[String(x.projectId)]; }

    var tasks = list(st.tasks).filter(inScope);
    var risks = list(st.risks).filter(inScope);
    var changes = list(st.changes).filter(inScope);
    var milestones = list(st.milestones).filter(inScope);
    var deals = list(st.deliverables).filter(inScope);

    var taskDone = 0, taskDoing = 0, taskOverdue = 0;
    tasks.forEach(function (t) {
      if (t.status === 'done') taskDone++;
      else {
        if (t.status === 'doing') taskDoing++;
        if (validDay(t.dueDate) && dayDiff(t.dueDate, until) > 0) taskOverdue++;
      }
    });

    var openRisks = risks.filter(function (r) { return r.status !== 'closed'; });
    var highRisks = openRisks.filter(function (r) { return num(r.probability, 0) * num(r.impact, 0) >= 15; });
    var pendingChanges = changes.filter(function (c) { return c.status === 'proposed'; });
    var unaccepted = deals.filter(function (d) { return d.status !== 'accepted'; });
    var pendingMs = milestones.filter(function (m) { return m.status === 'pending'; });
    var msThisWeek = pendingMs.filter(function (m) {
      return validDay(m.dueDate) && m.dueDate >= since && m.dueDate <= until;
    });
    var msMissed = pendingMs.filter(function (m) { return validDay(m.dueDate) && dayDiff(m.dueDate, until) > 0; });

    var statusCount = { active: 0, paused: 0, done: 0, archived: 0 };
    projects.forEach(function (p) { if (statusCount[p.status] != null) statusCount[p.status]++; });

    var findings = findingsOf(st);
    var scopedFindings = findings ? findings.filter(function (f) {
      return !f.projectId || pids[String(f.projectId)];
    }) : [];

    var md = [];
    md.push('# 项目周报（' + since + ' ~ ' + until + '）');
    md.push('');
    md.push('> 生成时间：' + todayStr() + '　·　项目 ' + projects.length + ' 个　·　任务 ' + tasks.length + ' 条');
    md.push('');

    // 一、本周概览
    md.push('## 一、本周概览');
    md.push('');
    md.push(toMarkdownTable([
      { k: '项目', v: '共 ' + projects.length + ' 个（进行 ' + statusCount.active + ' / 暂停 ' + statusCount.paused + ' / 完成 ' + statusCount.done + ' / 归档 ' + statusCount.archived + '）' },
      { k: '任务', v: tasks.length + ' 条，完成 ' + taskDone + '（完成率 ' + pct(taskDone, tasks.length) + '%），进行中 ' + taskDoing + '，逾期 ' + taskOverdue },
      { k: '风险', v: '未关闭 ' + openRisks.length + ' 条，其中高风险 ' + highRisks.length + ' 条' },
      { k: '变更', v: '待决策 ' + pendingChanges.length + ' 条' },
      { k: '交付物', v: '共 ' + deals.length + ' 项，未验收 ' + unaccepted.length + ' 项' },
      { k: '里程碑', v: '待达成 ' + pendingMs.length + ' 个，本周到期 ' + msThisWeek.length + ' 个，已错过 ' + msMissed.length + ' 个' },
      { k: '预警', v: findings ? ('共 ' + scopedFindings.length + ' 条（高 ' + scopedFindings.filter(function (f) { return f.level === 'high'; }).length + ' / 中 ' + scopedFindings.filter(function (f) { return f.level === 'mid'; }).length + ' / 低 ' + scopedFindings.filter(function (f) { return f.level === 'low'; }).length + '）') : '评分引擎未加载' }
    ], [{ key: 'k', label: '指标' }, { key: 'v', label: '数值' }]));
    md.push('');

    // 二、阶段分布
    md.push('## 二、阶段分布');
    md.push('');
    var stages = Array.isArray(cfg.stages) ? cfg.stages : [];
    var stageRows = [];
    var known = Object.create(null);
    stages.forEach(function (s) {
      if (!s || !s.id) return;
      known[String(s.id)] = 1;
      var n = projects.filter(function (p) { return String(p.stageId) === String(s.id); }).length;
      stageRows.push({ name: txt(s.name || s.id), n: n, share: projects.length ? Math.round(n / projects.length * 100) + '%' : '0%' });
    });
    var loose = projects.filter(function (p) { return !known[String(p.stageId)]; }).length;
    if (loose) stageRows.push({ name: '未分阶段', n: loose, share: Math.round(loose / projects.length * 100) + '%' });
    md.push(tableOrNone(stageRows, [{ key: 'name', label: '阶段' }, { key: 'n', label: '项目数' }, { key: 'share', label: '占比' }]));
    md.push('');

    // 三、预警 Top5
    md.push('## 三、预警 Top5');
    md.push('');
    if (!findings) {
      md.push('（规则引擎未加载：PLM_ENGINE 缺失，本小节与「下周建议」已降级。）');
    } else if (!scopedFindings.length) {
      md.push(NO + '（当前没有触发任何预警规则）');
    } else {
      scopedFindings.slice(0, 5).forEach(function (f, i) {
        var p = byId(st.projects, f.projectId);
        md.push((i + 1) + '. **[' + (LEVEL_CN[f.level] || f.level) + '] ' + cell(f.title) + '**' +
          (p ? '（' + cell(p.name || p.id) + '）' : ''));
        md.push('   - 建议：' + cell(f.suggestion));
      });
    }
    md.push('');

    // 四、风险登记
    md.push('## 四、风险登记');
    md.push('');
    var riskRows = openRisks.slice().sort(function (a, b) {
      return num(b.probability, 0) * num(b.impact, 0) - num(a.probability, 0) * num(a.impact, 0);
    }).slice(0, 10).map(function (r) {
      var p = byId(st.projects, r.projectId);
      return {
        p: p ? txt(p.name || p.id) : '—',
        t: txt(r.title || r.id),
        score: num(r.probability, 0) * num(r.impact, 0),
        lv: riskLevel(r.probability, r.impact),
        st: txt(r.status || 'open'),
        own: memberName(st, r.owner),
        mit: txt(r.mitigation || '—')
      };
    });
    md.push(tableOrNone(riskRows, [
      { key: 'p', label: '项目' }, { key: 't', label: '风险' }, { key: 'score', label: 'P×I' },
      { key: 'lv', label: '等级' }, { key: 'st', label: '状态' }, { key: 'own', label: '负责人' }, { key: 'mit', label: '缓解措施' }
    ]));
    md.push('');

    // 五、里程碑
    md.push('## 五、里程碑');
    md.push('');
    var msRows = pendingMs.filter(function (m) {
      if (!validDay(m.dueDate)) return false;
      return dayDiff(m.dueDate, until) > 0 || (m.dueDate <= addDays(until, 30));
    }).sort(function (a, b) { return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0; })
      .slice(0, 10).map(function (m) {
        var p = byId(st.projects, m.projectId);
        var d = dayDiff(until, m.dueDate);
        return {
          p: p ? txt(p.name || p.id) : '—',
          t: txt(m.title || m.id),
          due: dayOf(m.dueDate),
          left: d >= 0 ? ('剩 ' + d + ' 天') : ('逾期 ' + (-d) + ' 天'),
          st: txt(m.status)
        };
      });
    md.push(tableOrNone(msRows, [
      { key: 'p', label: '项目' }, { key: 't', label: '里程碑' }, { key: 'due', label: '截止' },
      { key: 'left', label: '距截止' }, { key: 'st', label: '状态' }
    ]));
    md.push('');

    // 六、下周建议
    md.push('## 六、下周建议');
    md.push('');
    var tips = [];
    var seenTip = Object.create(null);
    scopedFindings.forEach(function (f) {
      if (tips.length >= 5) return;
      var s = txt(f.suggestion).trim();
      if (!s || seenTip[s]) return;
      seenTip[s] = 1;
      tips.push(s);
    });
    if (tips.length < 3) {
      if (taskOverdue) tips.push('先清掉 ' + taskOverdue + ' 条逾期任务：逐条改截止日或拆小，不要在逾期状态里加新活。');
      if (highRisks.length) tips.push('把 ' + highRisks.length + ' 条高风险逐条落到本周的缓解动作上，每条指定一个人。');
      if (pendingChanges.length) tips.push('给 ' + pendingChanges.length + ' 条待决策变更安排一次 30 分钟评审，当场定去留。');
      if (unaccepted.length && tips.length < 5) tips.push('约验收人过一遍 ' + unaccepted.length + ' 项未验收交付物，别让它们带进运维。');
    }
    if (!tips.length) tips.push('各项指标正常，维持当前节奏，把在制任务压在上限以内。');
    tips.slice(0, 5).forEach(function (s, i) { md.push((i + 1) + '. ' + cell(s)); });
    md.push('');

    return md.join('\n');
  }

  // ---------------------------------------------------------------- 单项目摘要

  function projectSummary(state, projectId) {
    var st = safeState(state);
    var p = byId(st.projects, projectId);
    if (!p) return '> 未找到项目：`' + txt(projectId) + '`\n';
    var cfg = st.config;
    var today = todayStr();

    var tasks = list(st.tasks).filter(function (t) { return t.projectId === p.id; });
    var risks = list(st.risks).filter(function (r) { return r.projectId === p.id; });
    var changes = list(st.changes).filter(function (c) { return c.projectId === p.id; });
    var deals = list(st.deliverables).filter(function (d) { return d.projectId === p.id; });
    var ms = list(st.milestones).filter(function (m) { return m.projectId === p.id; });

    var stat = { todo: 0, doing: 0, review: 0, done: 0, overdue: 0, estimate: 0 };
    tasks.forEach(function (t) {
      var s = (t.status === 'doing' || t.status === 'review' || t.status === 'done') ? t.status : 'todo';
      stat[s]++;
      stat.estimate += num(t.estimate, 0);
      if (s !== 'done' && validDay(t.dueDate) && dayDiff(t.dueDate, today) > 0) stat.overdue++;
    });
    var progress = pct(stat.done, tasks.length);
    var riskScore = 0;
    risks.forEach(function (r) { if (r.status !== 'closed') riskScore += num(r.probability, 0) * num(r.impact, 0); });

    var md = [];
    md.push('# 项目摘要：' + txt(p.name || p.id) + (p.code ? '（' + txt(p.code) + '）' : ''));
    md.push('');
    md.push('> 生成时间：' + today + '　·　完成率 ' + progress + '%　·　风险分 ' + riskScore);
    md.push('');

    md.push('## 基本信息');
    md.push('');
    md.push(toMarkdownTable([
      { k: '编号', v: txt(p.code || '—') },
      { k: '负责人', v: memberName(st, p.owner) },
      { k: '发起人', v: memberName(st, p.sponsor) },
      { k: '优先级', v: txt(p.priority || '—') },
      { k: '状态', v: txt(p.status || 'active') },
      { k: '当前阶段', v: stageName(cfg, p.stageId) },
      { k: '起止', v: (dayOf(p.startDate) || '—') + ' ~ ' + (dayOf(p.dueDate) || '—') },
      { k: '截止情况', v: !validDay(p.dueDate) ? '未设' : (dayDiff(p.dueDate, today) > 0 ? ('已逾期 ' + dayDiff(p.dueDate, today) + ' 天') : ('剩 ' + dayDiff(today, p.dueDate) + ' 天')) },
      { k: '预算', v: p.budget == null || p.budget === '' ? '—' : String(p.budget) },
      { k: '标签', v: Array.isArray(p.tags) && p.tags.length ? p.tags.join('、') : '—' }
    ], [{ key: 'k', label: '项' }, { key: 'v', label: '值' }]));
    md.push('');
    if (p.description) { md.push('**描述**：' + cell(p.description)); md.push(''); }

    md.push('## 阶段进度');
    md.push('');
    var stages = Array.isArray(cfg.stages) ? cfg.stages : [];
    var sRows = stages.filter(function (s) { return s && s.id; }).map(function (s) {
      var sub = tasks.filter(function (t) { return String(t.stageId) === String(s.id); });
      var done = sub.filter(function (t) { return t.status === 'done'; }).length;
      var doing = sub.filter(function (t) { return t.status === 'doing' || t.status === 'review'; }).length;
      return {
        name: txt(s.name || s.id) + (String(p.stageId) === String(s.id) ? '　←当前' : ''),
        total: sub.length, done: done, doing: doing,
        rate: pct(done, sub.length) + '%'
      };
    });
    md.push(tableOrNone(sRows, [
      { key: 'name', label: '阶段' }, { key: 'total', label: '任务' }, { key: 'done', label: '完成' },
      { key: 'doing', label: '进行中' }, { key: 'rate', label: '完成率' }
    ]));
    md.push('');

    md.push('## 任务统计');
    md.push('');
    md.push(toMarkdownTable([
      { k: '总数', v: tasks.length }, { k: '待办', v: stat.todo }, { k: '进行中', v: stat.doing },
      { k: '评审中', v: stat.review }, { k: '已完成', v: stat.done }, { k: '逾期', v: stat.overdue },
      { k: '完成率', v: progress + '%' }, { k: '预估人天', v: stat.estimate }
    ], [{ key: 'k', label: '指标' }, { key: 'v', label: '数值' }]));
    md.push('');

    md.push('## 任务清单');
    md.push('');
    var open = tasks.filter(function (t) { return t.status !== 'done'; });
    var closed = tasks.filter(function (t) { return t.status === 'done'; });
    open.sort(function (a, b) {
      var da = validDay(a.dueDate) ? a.dueDate : '9999-12-31';
      var db = validDay(b.dueDate) ? b.dueDate : '9999-12-31';
      return da < db ? -1 : da > db ? 1 : 0;
    });
    var shown = open.concat(closed).slice(0, 20);
    md.push(tableOrNone(shown.map(function (t) {
      var d = validDay(t.dueDate) ? dayDiff(t.dueDate, today) : NaN;
      return {
        t: txt(t.title || t.id), st: txt(t.status || 'todo'),
        own: memberName(st, t.assignee), due: dayOf(t.dueDate) || '—',
        flag: isNaN(d) ? '—' : (t.status === 'done' ? '已完成' : d > 0 ? ('逾期 ' + d + ' 天') : ('剩 ' + (-d) + ' 天'))
      };
    }), [
      { key: 't', label: '任务' }, { key: 'st', label: '状态' }, { key: 'own', label: '负责人' },
      { key: 'due', label: '截止' }, { key: 'flag', label: '情况' }
    ]));
    if (tasks.length > shown.length) {
      md.push('');
      md.push('（另有 ' + (tasks.length - shown.length) + ' 条任务未列出）');
    }
    md.push('');

    md.push('## 风险');
    md.push('');
    md.push(tableOrNone(risks.slice().sort(function (a, b) {
      return num(b.probability, 0) * num(b.impact, 0) - num(a.probability, 0) * num(a.impact, 0);
    }).map(function (r) {
      return {
        t: txt(r.title || r.id), score: num(r.probability, 0) * num(r.impact, 0),
        lv: riskLevel(r.probability, r.impact), st: txt(r.status || 'open'),
        own: memberName(st, r.owner), mit: txt(r.mitigation || '—')
      };
    }), [
      { key: 't', label: '风险' }, { key: 'score', label: 'P×I' }, { key: 'lv', label: '等级' },
      { key: 'st', label: '状态' }, { key: 'own', label: '负责人' }, { key: 'mit', label: '缓解措施' }
    ]));
    md.push('');

    md.push('## 变更');
    md.push('');
    md.push(tableOrNone(changes.map(function (c) {
      return {
        t: txt(c.title || c.id), st: txt(c.status || 'proposed'),
        at: dayOf(c.createdAt) || '—', impact: txt(c.impact || '—')
      };
    }), [
      { key: 't', label: '变更' }, { key: 'st', label: '状态' },
      { key: 'at', label: '提出日' }, { key: 'impact', label: '影响' }
    ]));
    md.push('');

    md.push('## 交付物');
    md.push('');
    md.push(tableOrNone(deals.map(function (d) {
      return {
        n: txt(d.name || d.id), kind: txt(d.kind || '—'), ver: txt(d.version || '—'),
        st: txt(d.status || 'draft'), rev: txt(d.reviewer || '未指定')
      };
    }), [
      { key: 'n', label: '名称' }, { key: 'kind', label: '类型' }, { key: 'ver', label: '版本' },
      { key: 'st', label: '状态' }, { key: 'rev', label: '验收人' }
    ]));
    md.push('');

    md.push('## 里程碑');
    md.push('');
    md.push(tableOrNone(ms.map(function (m) {
      var d = validDay(m.dueDate) ? dayDiff(today, m.dueDate) : NaN;
      return {
        t: txt(m.title || m.id), due: dayOf(m.dueDate) || '—', st: txt(m.status || 'pending'),
        left: isNaN(d) ? '—' : (d >= 0 ? ('剩 ' + d + ' 天') : ('逾期 ' + (-d) + ' 天'))
      };
    }), [
      { key: 't', label: '里程碑' }, { key: 'due', label: '截止' },
      { key: 'st', label: '状态' }, { key: 'left', label: '距截止' }
    ]));
    md.push('');

    return md.join('\n');
  }

  var api = {
    VERSION: VERSION,
    weekly: weekly,
    projectSummary: projectSummary,
    toCSV: toCSV,
    toMarkdownTable: toMarkdownTable
  };

  global.PLM_REPORT = api;
})(typeof window !== 'undefined' ? window : globalThis);
