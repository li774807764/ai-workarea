/* registry.js —— 扩展点：视图、阶段、规则、图表类型 */
(function (global) {
  'use strict';

  var bus = global.PLM.bus;
  var schema = global.PLM.schema;
  var ui = global.PLM.ui;

  var views = [];
  var pendingRules = [];

  function addView(v) {
    if (!v || !v.id || typeof v.render !== 'function') {
      console.error('[registry] addView 需要 { id, title, render }', v);
      return false;
    }
    var exist = views.find(function (x) { return x.id === v.id; });
    if (exist) Object.assign(exist, v);
    else views.push({
      id: v.id,
      title: v.title || v.id,
      icon: v.icon || '•',
      order: v.order == null ? 100 : v.order,
      desc: v.desc || '',
      render: v.render
    });
    views.sort(function (a, b) { return a.order - b.order; });
    bus.emit('registry:views', views);
    return true;
  }

  function viewList() { return views.slice(); }
  function view(id) { return views.find(function (x) { return x.id === id; }) || null; }

  /* 追加生命周期阶段（示例：把「试运行」插到上线之前） */
  function addStage(stage) {
    if (!stage || !stage.id || !stage.name) return false;
    if (schema.stage[stage.id]) return false;
    var order = stage.order == null ? schema.stages.length : stage.order;
    schema.stages.push({
      id: stage.id, name: stage.name, order: order,
      gate: stage.gate || stage.name + '评审',
      desc: stage.desc || '', color: stage.color || '#94a3b8'
    });
    schema.stages.sort(function (a, b) { return a.order - b.order; });
    schema.stages.forEach(function (s, i) { s.order = i; });
    schema.stage[stage.id] = schema.stages.find(function (s) { return s.id === stage.id; });
    bus.emit('registry:stages', schema.stages);
    return true;
  }

  /* 注册预警规则（引擎未加载时排队，加载后自动注入） */
  function addRule(rule) {
    if (!rule || !rule.id || typeof rule.test !== 'function') return false;
    if (global.PLM_ENGINE && global.PLM_ENGINE.registerRule) {
      return global.PLM_ENGINE.registerRule(rule);
    }
    pendingRules.push(rule);
    return true;
  }

  function flushRules() {
    if (!global.PLM_ENGINE || !global.PLM_ENGINE.registerRule) return;
    while (pendingRules.length) {
      try { global.PLM_ENGINE.registerRule(pendingRules.shift()); }
      catch (e) { console.error('[registry] 规则注入失败', e); }
    }
  }

  /* 图表类型（来自 UML 引擎，加载后才有） */
  function diagramTypes() {
    var labels = { usecase: '用例图', class: '类图', state: '状态机图', sequence: '时序图' };
    var types = (global.PLM_UML && global.PLM_UML.types) || ['usecase', 'state'];
    return types.map(function (t) { return { value: t, label: labels[t] || t }; });
  }

  global.PLM.registry = {
    addView: addView,
    views: viewList,
    view: view,
    addStage: addStage,
    addRule: addRule,
    flushRules: flushRules,
    diagramTypes: diagramTypes,
    ui: ui
  };
})(typeof window !== 'undefined' ? window : globalThis);
