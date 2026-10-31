/* store.js —— 状态、持久化（可换适配器）、撤销重做、派生指标 */
(function (global) {
  'use strict';

  var util = global.PLM.util;
  var bus = global.PLM.bus;
  var schema = global.PLM.schema;

  var KEY = 'plm.panel.v1';
  var VERSION = 1;
  var state = null;
  var listeners = [];
  var undoStack = [];
  var redoStack = [];
  var MAX_UNDO = 40;
  var saveTimer = null;

  /* ---------- 存储适配器：默认 localStorage，可替换为 IndexedDB / 远端 ---------- */
  var localStorageAdapter = {
    name: 'localStorage',
    read: function () {
      try { return global.localStorage.getItem(KEY); } catch (e) { console.warn('[store] 读取失败', e); return null; }
    },
    write: function (text) {
      try { global.localStorage.setItem(KEY, text); return true; }
      catch (e) { console.error('[store] 写入失败（可能超出配额）', e); return false; }
    },
    clear: function () { try { global.localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  };
  var adapter = localStorageAdapter;

  function emptyState() {
    return {
      version: VERSION,
      meta: {
        name: '智能项目全生命周期管理面板',
        createdAt: util.nowISO(),
        updatedAt: util.nowISO(),
        theme: 'dark'
      },
      config: {
        stages: schema.stages.map(function (s) { return s.id; }),
        /* 与 js/engine/rules.js 的 DEFAULTS 保持一致（store 先于引擎加载，这里写常量） */
        workHoursPerDay: 6,
        warnDaysBeforeDue: 3,
        wipLimit: 6,
        stallDays: 14,
        changePendingDays: 7,
        milestoneSoonDays: 7,
        milestoneMinProgress: 80
      },
      projects: [], tasks: [], risks: [], changes: [], milestones: [],
      deliverables: [], members: [], diagrams: [], logs: []
    };
  }

  var ARRAYS = ['projects', 'tasks', 'risks', 'changes', 'milestones', 'deliverables', 'members', 'diagrams', 'logs'];

  /* 归一化：补默认值、保证数组存在、丢弃版本过旧的结构 —— 保证旧数据能开 */
  function normalize(raw) {
    var base = emptyState();
    if (!raw || typeof raw !== 'object') return base;
    var out = base;
    out.meta = Object.assign({}, base.meta, raw.meta || {});
    out.meta.theme = out.meta.theme === 'light' ? 'light' : 'dark';
    out.config = Object.assign({}, base.config, raw.config || {});
    ARRAYS.forEach(function (k) {
      out[k] = Array.isArray(raw[k]) ? raw[k] : [];
    });
    out.version = VERSION;
    // 实体补 id/时间戳，避免老数据缺字段导致渲染崩
    ARRAYS.forEach(function (k) {
      out[k].forEach(function (item) {
        if (!item || typeof item !== 'object') return;
        if (!item.id) item.id = util.uid(k.charAt(0));
        if (!item.createdAt) item.createdAt = util.nowISO();
        if (!item.updatedAt) item.updatedAt = item.createdAt;
      });
    });
    out.logs = out.logs.filter(function (l) { return l && l.at; }).slice(-400);
    return out;
  }

  /* ---------- 派生指标（预警引擎与视图共用同一套口径） ---------- */
  function derive(project) {
    if (!project) return null;
    var st = state;
    var today = util.today();
    var tasks = st.tasks.filter(function (t) { return t.projectId === project.id; });
    var stats = { todo: 0, doing: 0, review: 0, done: 0, total: tasks.length, overdue: 0 };
    var weightTotal = 0, weightDone = 0;
    tasks.forEach(function (t) {
      stats[t.status] = (stats[t.status] || 0) + 1;
      var w = +(t.estimate || 0) || 1;
      weightTotal += w;
      if (t.status === 'done') weightDone += w;
      if (t.status !== 'done' && t.dueDate && t.dueDate < today) stats.overdue++;
    });
    var progress = weightTotal ? Math.round((weightDone / weightTotal) * 100) : (project.status === 'done' || project.status === 'archived' ? 100 : 0);

    var risks = st.risks.filter(function (r) { return r.projectId === project.id; });
    var openRisks = risks.filter(function (r) { return r.status !== 'closed'; });
    var riskScore = 0;
    openRisks.forEach(function (r) {
      var s = (+r.probability || 1) * (+r.impact || 1);
      if (s > riskScore) riskScore = s;
    });
    var riskLevel = riskScore >= 15 ? 'high' : riskScore >= 8 ? 'mid' : 'low';

    var deliverables = st.deliverables.filter(function (d) { return d.projectId === project.id; });
    var accepted = deliverables.filter(function (d) { return d.status === 'accepted'; }).length;

    var milestones = st.milestones.filter(function (m) { return m.projectId === project.id; });
    var nextMilestone = milestones.filter(function (m) { return m.status === 'pending' && m.dueDate; })
      .sort(function (a, b) { return a.dueDate < b.dueDate ? -1 : 1; })[0] || null;

    var stage = schema.stage[project.stageId] || schema.stages[0];
    var daysLeft = project.dueDate ? util.daysBetween(today, project.dueDate) : null;
    var isOverdue = !!(project.dueDate && daysLeft < 0 && project.status === 'active');

    /* 阶段停滞：本阶段最早更新至今 */
    var stageTasks = tasks.filter(function (t) { return t.stageId === project.stageId; });
    var lastTouch = stageTasks.reduce(function (acc, t) {
      var d = util.daysBetween(String(t.updatedAt || '').slice(0, 10), today);
      return d != null && d > acc ? d : acc;
    }, 0);

    var reasons = [];
    var health = 100;
    if (stats.overdue) { var p1 = Math.min(30, stats.overdue * 6); health -= p1; reasons.push(stats.overdue + ' 个任务逾期（-' + p1 + '）'); }
    if (isOverdue) { health -= 20; reasons.push('项目已超期 ' + Math.abs(daysLeft) + ' 天（-20）'); }
    var highRisks = openRisks.filter(function (r) { return (+r.probability || 1) * (+r.impact || 1) >= 15; });
    if (highRisks.length) { var p2 = Math.min(25, highRisks.length * 10); health -= p2; reasons.push(highRisks.length + ' 个高风险未缓解（-' + p2 + '）'); }
    if (lastTouch > 14 && project.status === 'active') { health -= 10; reasons.push('阶段 ' + stage.name + ' 已停滞 ' + lastTouch + ' 天（-10）'); }
    var lateStage = schema.stageIndex(project.stageId) >= schema.stageIndex('release');
    if (lateStage && deliverables.length && accepted < deliverables.length) {
      var p3 = Math.min(20, (deliverables.length - accepted) * 8);
      health -= p3; reasons.push((deliverables.length - accepted) + ' 个交付物未验收（-' + p3 + '）');
    }
    if (!project.owner) { health -= 15; reasons.push('未指定负责人（-15）'); }
    if (!tasks.length && project.status === 'active') { health -= 10; reasons.push('未拆解任务（-10）'); }
    health = util.clamp(health, 0, 100);

    return {
      tasks: tasks,
      taskStats: stats,
      progress: progress,
      risks: risks,
      openRisks: openRisks,
      riskScore: riskScore,
      riskLevel: riskLevel,
      deliverables: deliverables,
      acceptedCount: accepted,
      milestones: milestones,
      nextMilestone: nextMilestone,
      stage: stage,
      stageIdx: schema.stageIndex(project.stageId),
      daysLeft: daysLeft,
      isOverdue: isOverdue,
      stageIdleDays: lastTouch,
      health: { score: health, level: health >= 80 ? 'ok' : health >= 60 ? 'watch' : 'risk', reasons: reasons }
    };
  }

  /* ---------- 变更与持久化 ---------- */
  function logChange(label, meta) {
    meta = meta || {};
    state.logs.push({
      id: util.uid('g'),
      at: util.nowISO(),
      action: label || '未知操作',
      entity: meta.entity || '—',
      entityId: meta.entityId || '—',
      detail: meta.detail || ''
    });
    if (state.logs.length > 400) state.logs = state.logs.slice(-400);
    state.meta.updatedAt = util.nowISO();
  }

  function saveNow() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    var text = JSON.stringify(state);
    var ok = adapter.write(text);
    bus.emit('state:saved', { ok: ok, bytes: text.length, at: util.nowISO() });
    return ok;
  }

  function save() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 350);
  }

  function notify(payload) {
    bus.emit('state:change', payload || {});
    listeners.slice().forEach(function (fn) {
      try { fn(state, payload); } catch (e) { console.error('[store] 订阅者异常', e); }
    });
  }

  /* commit(label, mutator, meta) —— 唯一合法的写入口 */
  function commit(label, mutator, meta) {
    var before = util.clone(state);
    var draft = util.clone(state);
    var result;
    try {
      result = mutator(draft);
    } catch (e) {
      console.error('[store] 变更失败：' + label, e);
      bus.emit('toast', { msg: '操作失败：' + (e && e.message ? e.message : e), kind: 'err' });
      return false;
    }
    if (result === false) return false; // mutator 可显式拒绝
    undoStack.push(before);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0;
    state = draft;
    logChange(label, meta);
    save();
    notify({ label: label, meta: meta || {} });
    return true;
  }

  function undo() {
    if (!undoStack.length) return false;
    redoStack.push(util.clone(state));
    state = undoStack.pop();
    saveNow();
    notify({ label: '撤销', undo: true });
    return true;
  }

  function redo() {
    if (!redoStack.length) return false;
    undoStack.push(util.clone(state));
    state = redoStack.pop();
    saveNow();
    notify({ label: '重做', redo: true });
    return true;
  }

  function canUndo() { return undoStack.length > 0; }
  function canRedo() { return redoStack.length > 0; }

  function load() {
    var raw = null;
    try { raw = adapter.read(); } catch (e) { raw = null; }
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        state = normalize(parsed);
        // 首次打开若为空库，填充示例数据
        if (!state.projects.length && global.PLM.seed) state = normalize(global.PLM.seed.build());
        return state;
      } catch (e) {
        console.error('[store] 数据损坏，已回退到示例数据', e);
        bus.emit('toast', { msg: '本地数据解析失败，已载入示例数据（旧数据仍保留在浏览器存储中）', kind: 'warn' });
      }
    }
    state = normalize(global.PLM.seed ? global.PLM.seed.build() : emptyState());
    saveNow();
    return state;
  }

  function dump() { return JSON.stringify(state, null, 2); }

  function restore(jsonText) {
    var parsed;
    try { parsed = JSON.parse(jsonText); }
    catch (e) { return { ok: false, error: 'JSON 解析失败：' + e.message }; }
    if (!parsed || typeof parsed !== 'object') return { ok: false, error: '文件内容不是合法对象' };
    if (!Array.isArray(parsed.projects)) return { ok: false, error: '缺少 projects 数组，可能不是本面板导出的数据' };
    var before = util.clone(state);
    undoStack.push(before);
    state = normalize(parsed);
    logChange('导入数据', { entity: 'system', detail: '项目 ' + state.projects.length + ' 个' });
    saveNow();
    notify({ label: '导入数据' });
    return { ok: true, state: state };
  }

  function reset() {
    var before = util.clone(state);
    undoStack.push(before);
    state = normalize(global.PLM.seed ? global.PLM.seed.build() : emptyState());
    logChange('重置为示例数据', { entity: 'system' });
    saveNow();
    notify({ label: '重置' });
    return true;
  }

  function setTheme(theme) {
    state.meta.theme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.meta.theme);
    save();
    notify({ label: '切换主题' });
  }

  function setAdapter(a) {
    if (!a || typeof a.read !== 'function' || typeof a.write !== 'function') return false;
    adapter = a;
    return true;
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i > -1) listeners.splice(i, 1);
    };
  }

  /* 便捷查询 */
  function projectsOf(pid) { return state.projects; }
  function nameOf(entityKey, id) {
    if (!id) return '—';
    var e = schema.entities[entityKey];
    var arr = state[entityKey + 's'] || [];
    var item = util.byId(arr, id);
    if (!item) return String(id);
    return item[e.title] || item.name || item.title || String(id);
  }

  global.PLM.store = {
    KEY: KEY,
    VERSION: VERSION,
    load: load,
    get state() { return state; },
    get: function () { return state; },
    commit: commit,
    save: save,
    saveNow: saveNow,
    dump: dump,
    restore: restore,
    reset: reset,
    undo: undo,
    redo: redo,
    canUndo: canUndo,
    canRedo: canRedo,
    subscribe: subscribe,
    derive: derive,
    setTheme: setTheme,
    setAdapter: setAdapter,
    nameOf: nameOf,
    emptyState: emptyState,
    normalize: normalize
  };
})(typeof window !== 'undefined' ? window : globalThis);
