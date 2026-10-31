/* app.js —— 应用外壳：布局、路由、全局动作、快捷键 */
(function (global) {
  'use strict';

  var PLM = global.PLM;
  var ui = PLM.ui, util = PLM.util, store = PLM.store, registry = PLM.registry;

  var VIEW_TITLES = {};
  var current = { view: '', params: {} };
  var cleanup = null;
  var alertCache = { ref: null, list: [], stamp: 0 };

  /* ---------------- 预警缓存 ---------------- */
  function alerts() {
    var st = store.state;
    if (alertCache.ref === st && Date.now() - alertCache.stamp < 1500) return alertCache.list;
    var list = [];
    if (global.PLM_ENGINE && global.PLM_ENGINE.evaluate) {
      try {
        list = global.PLM_ENGINE.evaluate(st, { derive: store.derive }) || [];
      } catch (err) {
        console.error('[PLM] 预警引擎异常：', err);
        list = [];
      }
    }
    alertCache = { ref: st, list: list, stamp: Date.now() };
    return list;
  }

  /* ---------------- 顶层 DOM 骨架 ---------------- */
  var navBox, titleEl, subEl, viewRoot, savedPill, dateEl, undoBtn, redoBtn, themeBtn, alertBtn;

  function build() {
    var app = document.getElementById('app');
    app.innerHTML = '';

    navBox = ui.el('nav', { class: 'nav' });
    var sidebar = ui.el('aside', { class: 'sidebar' }, [
      ui.el('div', { class: 'brand' }, [
        ui.el('div', { class: 'brand-mark', text: '◆' }),
        ui.el('div', {}, [
          ui.el('div', { class: 'brand-name', text: '项目全生命周期' }),
          ui.el('div', { class: 'brand-sub', text: '本地管理 · UML 建模' })
        ])
      ]),
      navBox,
      ui.el('div', { class: 'sidebar-foot' }, [
        ui.el('div', { class: 'foot-line', text: '数据存本机，不联网' }),
        ui.el('div', { class: 'foot-line muted', text: 'v1.0.0 · 零依赖' })
      ])
    ]);

    titleEl = ui.el('h1', { class: 'view-title' });
    subEl = ui.el('p', { class: 'view-sub' });
    savedPill = ui.el('span', { class: 'status-pill', text: '已保存' });
    dateEl = ui.el('span', { class: 'topbar-date' });
    undoBtn = ui.el('button', { class: 'icon-btn', text: '↶', title: '撤销 (Ctrl+Z)', on: { click: function () { doUndo(); } } });
    redoBtn = ui.el('button', { class: 'icon-btn', text: '↷', title: '重做 (Ctrl+Shift+Z)', on: { click: function () { doRedo(); } } });
    themeBtn = ui.el('button', { class: 'icon-btn', text: '◐', title: '切换主题', on: { click: function () { toggleTheme(); } } });
    alertBtn = ui.el('button', { class: 'btn btn-sm bell', text: '⚠ 预警', on: { click: function () { go('reports', { tab: 'alerts' }); } } });

    var topbar = ui.el('header', { class: 'topbar' }, [
      ui.el('div', { class: 'topbar-left' }, [
        ui.el('div', { class: 'crumb' }, [
          ui.el('span', { class: 'crumb-root', text: '工作台' }),
          ui.el('span', { class: 'crumb-sep', text: '/' }),
          ui.el('span', { class: 'crumb-cur', text: '总览' })
        ]),
        titleEl, subEl
      ]),
      ui.el('div', { class: 'topbar-right' }, [
        dateEl,
        savedPill,
        ui.el('div', { class: 'topbar-actions' }, [undoBtn, redoBtn, themeBtn]),
        alertBtn,
        ui.el('button', { class: 'btn btn-primary btn-sm', text: '＋ 新建项目', on: { click: function () { newProject(); } } })
      ])
    ]);

    viewRoot = ui.el('main', { class: 'view-root' });

    app.appendChild(sidebar);
    app.appendChild(ui.el('div', { class: 'main' }, [topbar, viewRoot]));

    paintNav();
    paintDate();
    setInterval(paintDate, 30000);
  }

  function paintNav() {
    navBox.innerHTML = '';
    var views = registry.views();
    views.forEach(function (v) {
      VIEW_TITLES[v.id] = v;
      var badge = '';
      if (v.id === 'projects') badge = String(store.state.projects.filter(function (p) { return p.status === 'active'; }).length);
      if (v.id === 'reports') {
        var n = alerts().filter(function (a) { return a.level === 'high'; }).length;
        badge = n ? String(n) : '';
      }
      if (v.id === 'risks') badge = String(store.state.risks.filter(function (r) { return r.status !== 'closed'; }).length);
      var item = ui.el('a', {
        class: 'nav-item' + (current.view === v.id ? ' active' : ''),
        href: '#/' + v.id,
        dataset: { view: v.id }
      }, [
        ui.el('span', { class: 'nav-icon', text: v.icon || '·' }),
        ui.el('span', { class: 'nav-text', text: v.title }),
        badge ? ui.el('span', { class: 'nav-badge', text: badge }) : null
      ]);
      navBox.appendChild(item);
    });
  }

  function paintDate() {
    if (!dateEl) return;
    var d = new Date();
    var wk = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    dateEl.textContent = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' 周' + wk;
  }
  function pad(n) { return n < 10 ? '0' + n : String(n); }

  /* ---------------- 路由 ---------------- */
  function parseHash() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    if (!h) return { view: 'dashboard', params: {} };
    var parts = h.split('?');
    var viewId = parts[0] || 'dashboard';
    var params = {};
    if (parts[1]) {
      parts[1].split('&').forEach(function (kv) {
        var p = kv.split('=');
        if (p[0]) params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
      });
    }
    return { view: viewId, params: params };
  }

  function go(viewId, params) {
    var q = Object.keys(params || {}).filter(function (k) { return params[k] != null && params[k] !== ''; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    var target = '#/' + viewId + (q ? '?' + q : '');
    if (location.hash === target) render();
    else location.hash = target;
  }

  function mount() {
    current = parseHash();
    var v = registry.view(current.view) || registry.views()[0];
    if (!v) {
      viewRoot.innerHTML = '';
      viewRoot.appendChild(ui.el('div', { class: 'uml-error' }, [ui.el('b', { text: '没有任何视图' })]));
      return;
    }
    current.view = v.id;

    /* 清理上一个视图 */
    if (typeof cleanup === 'function') {
      try { cleanup(); } catch (e) { console.error(e); }
      cleanup = null;
    }
    if (viewRoot.firstChild) {
      try { viewRoot.firstChild.dispatchEvent(new CustomEvent('plm:dispose')); } catch (e) { /* noop */ }
    }
    viewRoot.innerHTML = '';

    titleEl.textContent = v.title;
    subEl.textContent = v.desc || '';
    document.querySelectorAll('.nav-item').forEach(function (a) {
      a.classList.toggle('active', a.dataset.view === v.id);
    });
    var crumb = document.querySelector('.crumb-cur');
    if (crumb) crumb.textContent = v.title;
    document.title = v.title + ' · 项目全生命周期管理面板';

    var box = ui.el('div', { class: 'view' });
    viewRoot.appendChild(box);
    try {
      var ret = v.render(box, current.params || {});
      if (typeof ret === 'function') cleanup = ret;
    } catch (err) {
      console.error('[PLM] 视图 ' + v.id + ' 渲染失败：', err);
      box.innerHTML = '';
      box.appendChild(ui.el('div', { class: 'uml-error' }, [
        ui.el('b', { text: '「' + v.title + '」视图加载出错' }),
        ui.el('p', { text: (err && err.message) ? err.message : String(err) }),
        ui.el('button', { class: 'btn btn-sm btn-ghost', text: '重试', on: { click: function () { mount(); } } })
      ]));
    }
    paintNav();
    updateChrome();
  }

  function updateChrome() {
    if (undoBtn) undoBtn.disabled = !store.canUndo();
    if (redoBtn) redoBtn.disabled = !store.canRedo();
    var n = alerts().filter(function (a) { return a.level === 'high'; }).length;
    if (alertBtn) {
      alertBtn.textContent = n ? '⚠ 高优预警 ' + n : '⚠ 预警';
      alertBtn.classList.toggle('bell-hot', n > 0);
    }
    paintNavBadges();
  }

  function paintNavBadges() {
    /* 只更新数字徽标，避免频繁重建导航导致 hover 抖动 */
    var counts = {
      projects: store.state.projects.filter(function (p) { return p.status === 'active'; }).length,
      risks: store.state.risks.filter(function (r) { return r.status !== 'closed'; }).length,
      reports: alerts().filter(function (a) { return a.level === 'high'; }).length
    };
    document.querySelectorAll('.nav-item').forEach(function (a) {
      var id = a.dataset.view;
      var badge = a.querySelector('.nav-badge');
      var val = counts[id] ? String(counts[id]) : '';
      if (val && !badge) {
        a.appendChild(ui.el('span', { class: 'nav-badge', text: val }));
      } else if (badge) {
        if (val) badge.textContent = val;
        else badge.remove();
      }
    });
  }

  /* ---------------- 全局动作 ---------------- */
  function newProject() {
    PLM.crud.openForm('project', null, {
      preset: { stageId: 'init', status: 'active', priority: 'P2', startDate: util.today() }
    });
  }

  function doUndo() {
    if (!store.canUndo()) { ui.toast('没有可撤销的操作'); return; }
    store.undo();
    ui.toast('已撤销');
    mount();
  }

  function doRedo() {
    if (!store.canRedo()) { ui.toast('没有可重做的操作'); return; }
    store.redo();
    ui.toast('已重做');
    mount();
  }

  function toggleTheme() {
    var next = store.state.meta.theme === 'light' ? 'dark' : 'light';
    store.commit('切换主题', function (draft) { draft.meta.theme = next; }, { entity: '设置' });
    applyTheme();
  }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', store.state.meta.theme || 'dark');
  }

  function exportJSON() {
    var text = JSON.stringify(store.dump(), null, 2);
    util.download('plm-backup-' + util.today() + '.json', text, 'application/json;charset=utf-8');
    ui.toast('备份已导出', 'ok');
  }

  function importJSON() {
    util.pickFile('.json,application/json').then(function (file) {
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var res = store.restore(String(reader.result));
        if (!res.ok) { ui.toast('导入失败：' + res.error, 'err'); return; }
        alertCache = { ref: null, list: [], stamp: 0 };
        applyTheme();
        mount();
        ui.toast('导入成功', 'ok');
      };
      reader.readAsText(file);
    });
  }

  function resetSeed() {
    var seed = global.PLM.seed.build();
    var ok = store.commit('恢复示例数据', function (draft) {
      Object.keys(seed).forEach(function (k) { draft[k] = seed[k]; });
    }, { entity: '设置' });
    if (ok) { alertCache = { ref: null, list: [], stamp: 0 }; mount(); ui.toast('已恢复示例数据', 'ok'); }
  }

  function clearData() {
    var empty = store.emptyState();
    empty.meta = store.state.meta;
    empty.config = store.state.config;
    var ok = store.commit('清空项目数据', function (draft) {
      Object.keys(empty).forEach(function (k) { draft[k] = empty[k]; });
    }, { entity: '设置' });
    if (ok) { alertCache = { ref: null, list: [], stamp: 0 }; mount(); ui.toast('已清空', 'ok'); }
  }

  function openProject(id) {
    if (global.PLM.projectDetail) global.PLM.projectDetail.open(id);
  }

  function refresh() {
    alertCache = { ref: null, list: [], stamp: 0 };
    updateChrome();
  }

  /* ---------------- 快捷键 ---------------- */
  function bindKeys() {
    document.addEventListener('keydown', function (e) {
      var meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      var k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); doRedo(); }
      else if (k === 's') { e.preventDefault(); store.saveNow(); ui.toast('已保存到本机', 'ok'); }
      else if (k === 'n') { e.preventDefault(); newProject(); }
      else if (k === 'k') {
        e.preventDefault();
        quickSearch();
      }
    });
  }

  function quickSearch() {
    var input = ui.el('input', { class: 'input', placeholder: '输入项目名 / 任务标题…', style: 'width:100%' });
    var list = ui.el('div', { class: 'quick-list' });
    var modal = ui.modal({ title: '快速跳转', body: ui.el('div', {}, [input, list]), actions: [{ label: '关闭', kind: 'ghost' }] });

    function paintResults() {
      var q = input.value.trim().toLowerCase();
      list.innerHTML = '';
      if (!q) {
        list.appendChild(ui.el('p', { class: 'muted', text: '输入关键词，回车定位到项目详情' }));
        return;
      }
      var hits = store.state.projects.filter(function (p) {
        return (p.name + ' ' + p.code).toLowerCase().indexOf(q) >= 0;
      }).slice(0, 8);
      if (!hits.length) { list.appendChild(ui.el('p', { class: 'muted', text: '没有匹配的项目' })); return; }
      hits.forEach(function (p) {
        list.appendChild(ui.el('div', {
          class: 'quick-item',
          on: { click: function () { modal.close(); openProject(p.id); } }
        }, [
          ui.el('b', { text: p.code }),
          document.createTextNode(' · ' + p.name)
        ]));
      });
    }
    input.addEventListener('input', paintResults);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var q = input.value.trim().toLowerCase();
        var hit = store.state.projects.filter(function (p) {
          return (p.name + ' ' + p.code).toLowerCase().indexOf(q) >= 0;
        })[0];
        if (hit) { modal.close(); openProject(hit.id); }
      }
    });
    paintResults();
    setTimeout(function () { input.focus(); }, 30);
  }

  /* ---------------- 保存状态提示 ---------------- */
  function bindSavePill() {
    var hideTimer = null;
    PLM.bus.on('state:save', function (payload) {
      if (payload && payload.saving) {
        savedPill.textContent = '保存中…';
        savedPill.className = 'status-pill saving';
      } else {
        savedPill.textContent = '已保存 ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        savedPill.className = 'status-pill';
      }
    });
    store.subscribe(function () {
      if (savedPill) { savedPill.textContent = '保存中…'; savedPill.className = 'status-pill saving'; }
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function () {
        if (savedPill) { savedPill.textContent = '已保存'; savedPill.className = 'status-pill'; }
      }, 900);
      updateChrome();
    });
  }

  /* ---------------- 启动 ---------------- */
  function bootstrap() {
    try {
      store.load();
    } catch (err) {
      console.error('[PLM] 数据加载失败，使用示例数据：', err);
      var seed = global.PLM.seed.build();
      store.load(seed);
    }
    applyTheme();
    build();
    bindKeys();
    bindSavePill();
    window.addEventListener('hashchange', mount);
    mount();
    if (global.PLM_ENGINE && global.PLM_ENGINE.evaluate) {
      var n = alerts().length;
      if (n) console.info('[PLM] 启动预警 ' + n + ' 条');
    }
    console.info('[PLM] 面板已启动 · 视图 ' + registry.views().length + ' 个 · 数据版本 ' + store.state.version);
  }

  global.PLM.app = {
    go: go,
    openProject: openProject,
    alerts: alerts,
    refresh: refresh,
    exportJSON: exportJSON,
    importJSON: importJSON,
    resetSeed: resetSeed,
    clearData: clearData,
    toggleTheme: toggleTheme,
    mount: mount
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})(typeof window !== 'undefined' ? window : globalThis);
