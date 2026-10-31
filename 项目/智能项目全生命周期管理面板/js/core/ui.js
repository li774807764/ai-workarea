/* ui.js —— DOM 构件、表单控件、弹层、提示 */
(function (global) {
  'use strict';

  var util = global.PLM.util;
  var bus = global.PLM.bus;
  var schema = global.PLM.schema;

  /* ---------- DOM 助手 ---------- */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null) return;
      if (k === 'class' || k === 'className') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'style') node.setAttribute('style', v);
      else if (k === 'dataset') Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
      else if (k === 'on') Object.keys(v).forEach(function (ev) { node.addEventListener(ev, v[ev]); });
      else if (k === 'value') node.value = v;
      else if (k === 'attrs') Object.keys(v).forEach(function (a) { node.setAttribute(a, v[a]); });
      else node.setAttribute(k, v);
    });
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function icon(name) {
    var map = {
      dashboard: '◱', project: '◧', kanban: '▤', uml: '◇', risk: '⚠', report: '▦', settings: '⚙',
      plus: '＋', edit: '✎', trash: '✕', save: '⤓', upload: '⤒', download: '↓', search: '⌕',
      close: '✕', chevron: '›', undo: '↶', redo: '↷', theme: '◐', export: '⬈', code: '‹›'
    };
    return el('span', { class: 'ico', text: map[name] || '·' });
  }

  /* ---------- Toast ---------- */
  var toastBox = null;
  function toast(msg, kind) {
    if (!toastBox) {
      toastBox = el('div', { class: 'toast-box', id: 'toast-box' });
      document.body.appendChild(toastBox);
    }
    var t = el('div', { class: 'toast toast-' + (kind || 'ok') }, [
      el('span', { class: 'toast-dot' }),
      el('span', { text: String(msg) })
    ]);
    toastBox.appendChild(t);
    setTimeout(function () { t.classList.add('toast-out'); }, 3200);
    setTimeout(function () { t.remove(); }, 3700);
  }
  bus.on('toast', function (p) { if (p && p.msg) toast(p.msg, p.kind); });

  /* ---------- 弹窗 ---------- */
  var modalRoot = null;
  function root(name) {
    if (!modalRoot) {
      modalRoot = el('div', { class: 'layer-root', id: 'layer-root' });
      document.body.appendChild(modalRoot);
    }
    return modalRoot;
  }

  var openLayers = [];

  function closeTop() {
    var top = openLayers.pop();
    if (!top) return;
    top.classList.add('closing');
    setTimeout(function () { top.remove(); }, 160);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && openLayers.length) { e.stopPropagation(); closeTop(); }
  });

  function modal(opt) {
    opt = opt || {};
    var wrap = el('div', { class: 'layer-mask' });
    var body = el('div', { class: 'modal-body' });
    if (typeof opt.body === 'string') body.innerHTML = opt.body;
    else if (opt.body) body.appendChild(opt.body);

    var footer = el('div', { class: 'modal-foot' });
    (opt.actions || [{ label: '关闭', kind: 'ghost' }]).forEach(function (a) {
      footer.appendChild(el('button', {
        class: 'btn btn-' + (a.kind || 'ghost'),
        text: a.label,
        on: {
          click: function () {
            if (a.onClick) {
              var r = a.onClick();
              if (r === false) return; // 校验不通过，不关
            }
            close();
          }
        }
      }));
    });

    var card = el('div', { class: 'modal-card ' + (opt.wide ? 'modal-wide' : '') }, [
      el('div', { class: 'modal-head' }, [
        el('h3', { text: opt.title || '' }),
        el('button', { class: 'icon-btn', text: '✕', on: { click: function () { close(); } } })
      ]),
      body,
      footer
    ]);
    wrap.appendChild(card);
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap && opt.dismissible !== false) close(); });
    root().appendChild(wrap);
    openLayers.push(wrap);
    function close() {
      var i = openLayers.indexOf(wrap);
      if (i > -1) openLayers.splice(i, 1);
      wrap.classList.add('closing');
      setTimeout(function () { wrap.remove(); }, 160);
    }
    setTimeout(function () {
      var first = card.querySelector('input,textarea,select,button');
      if (first && opt.autofocus !== false) first.focus();
    }, 30);
    return { close: close, card: card, body: body };
  }

  function confirm(text, opt) {
    opt = opt || {};
    return new Promise(function (resolve) {
      var done = false;
      modal({
        title: opt.title || '请确认',
        body: el('p', { class: 'confirm-text', text: text }),
        actions: [
          { label: opt.cancelLabel || '取消', kind: 'ghost', onClick: function () { done = true; resolve(false); } },
          {
            label: opt.okLabel || '确定', kind: opt.danger ? 'danger' : 'primary',
            onClick: function () { done = true; resolve(true); }
          }
        ]
      });
      // 关窗即视为取消
      var watch = setInterval(function () {
        if (!openLayers.length) { clearInterval(watch); if (!done) resolve(false); }
      }, 200);
    });
  }

  /* 右侧抽屉 */
  function drawer(opt) {
    opt = opt || {};
    var wrap = el('div', { class: 'layer-mask drawer-mask' });
    var body = el('div', { class: 'drawer-body' });
    if (typeof opt.body === 'string') body.innerHTML = opt.body;
    else if (opt.body) body.appendChild(opt.body);
    var card = el('div', { class: 'drawer-card' + (opt.wide ? ' wide' : '') }, [
      el('div', { class: 'drawer-head' }, [
        el('h3', { text: opt.title || '' }),
        el('button', { class: 'icon-btn', text: '✕', on: { click: function () { close(); } } })
      ]),
      body
    ]);
    wrap.appendChild(card);
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) close(); });
    root().appendChild(wrap);
    openLayers.push(wrap);
    requestAnimationFrame(function () { wrap.classList.add('in'); });
    function close() {
      var i = openLayers.indexOf(wrap);
      if (i > -1) openLayers.splice(i, 1);
      wrap.classList.remove('in');
      setTimeout(function () { wrap.remove(); }, 200);
      if (opt.onClose) opt.onClose();
    }
    return { close: close, body: body, card: card };
  }

  /* ---------- 表单控件（由 schema 字段定义驱动） ---------- */
  function refOptions(entityKey, filterFn) {
    var arr = global.PLM.store.state[entityKey + 's'] || [];
    var e = schema.entities[entityKey];
    return arr.filter(filterFn || function () { return true; }).map(function (item) {
      var label = item[e.title] || item.name || item.id;
      if (entityKey === 'project' && item.code) label = item.code + ' · ' + label;
      return { value: item.id, label: label };
    });
  }

  function field(def, value, ctx) {
    ctx = ctx || {};
    var wrap = el('div', { class: 'form-item ' + (def.full || def.type === 'textarea' ? 'span-2' : '') });
    wrap.appendChild(el('label', { class: 'form-label' }, [
      document.createTextNode(def.label || def.key),
      def.required ? el('span', { class: 'req', text: ' *' }) : null
    ]));

    var input;
    if (def.type === 'textarea') {
      input = el('textarea', { class: 'input', rows: def.rows || 3, placeholder: def.placeholder || '' });
      input.value = value == null ? '' : value;
    } else if (def.type === 'select') {
      input = el('select', { class: 'input' });
      var opts = def.options || [];
      if (!def.required) opts = [{ value: '', label: '— 未设置 —' }].concat(opts);
      opts.forEach(function (o) {
        var op = el('option', { value: o.value, text: o.label });
        input.appendChild(op);
      });
      var v = value == null ? (def.defaultValue != null ? def.defaultValue : '') : value;
      input.value = String(v);
    } else if (def.type === 'ref') {
      input = el('select', { class: 'input' });
      if (!def.required) input.appendChild(el('option', { value: '', text: '— 未指定 —' }));
      refOptions(def.ref, ctx.refFilter).forEach(function (o) {
        input.appendChild(el('option', { value: o.value, text: o.label }));
      });
      var cur = value == null ? '' : value;
      input.value = String(cur);
      // 值不存在于候选（如被删的引用）时补一个占位项，避免静默丢失
      if (cur && input.value !== String(cur)) {
        input.appendChild(el('option', { value: String(cur), text: '（已失效：' + cur + '）' }));
        input.value = String(cur);
      }
    } else if (def.type === 'number') {
      input = el('input', { class: 'input', type: 'number', min: def.min != null ? def.min : '', step: def.step || 1, placeholder: def.placeholder || '' });
      input.value = value == null ? '' : value;
    } else if (def.type === 'date') {
      input = el('input', { class: 'input', type: 'date' });
      input.value = value ? util.fmtDate(value) : '';
    } else if (def.type === 'tags') {
      input = el('input', { class: 'input', type: 'text', placeholder: def.placeholder || '用逗号分隔' });
      input.value = Array.isArray(value) ? value.join(', ') : (value || '');
    } else {
      input = el('input', { class: 'input', type: 'text', placeholder: def.placeholder || '' });
      input.value = value == null ? '' : value;
    }

    input.dataset.field = def.key;
    wrap.appendChild(input);
    if (def.help) wrap.appendChild(el('div', { class: 'form-help', text: def.help }));

    function read() {
      var raw = input.value;
      if (def.type === 'number') return raw === '' ? null : +raw;
      if (def.type === 'tags') {
        return String(raw).split(/[,，;；\s]+/).map(function (s) { return s.trim(); }).filter(Boolean);
      }
      if (def.type === 'date') return raw || null;
      return raw === '' ? null : raw;
    }
    function markInvalid(msg) {
      wrap.classList.add('invalid');
      var tip = wrap.querySelector('.form-err');
      if (!tip) { tip = el('div', { class: 'form-err' }); wrap.appendChild(tip); }
      tip.textContent = msg;
    }
    return { el: wrap, input: input, read: read, markInvalid: markInvalid, def: def };
  }

  /* 依据实体 schema 生成整张表单 */
  function form(entityKey, obj, ctx) {
    var e = schema.entities[entityKey];
    var grid = el('div', { class: 'form-grid' });
    var fields = e.fields.filter(function (f) { return !f.hidden; }).map(function (f) {
      var ctl = field(f, obj ? obj[f.key] : (f.defaultValue != null ? f.defaultValue : null), ctx);
      grid.appendChild(ctl.el);
      return ctl;
    });
    return {
      el: grid,
      read: function () {
        var out = {};
        var ok = true;
        fields.forEach(function (ctl) {
          var v = ctl.read();
          ctl.el.classList.remove('invalid');
          if (ctl.def.required && (v == null || v === '' || (Array.isArray(v) && !v.length))) {
            ctl.markInvalid('必填');
            ok = false;
          }
          out[ctl.def.key] = v;
        });
        return ok ? out : null;
      }
    };
  }

  /* ---------- 小构件 ---------- */
  function badge(text, kind) {
    return el('span', { class: 'badge badge-' + (kind || 'neutral'), text: text });
  }

  /* showText: 是否在条上方浮出百分比（表格里关掉，避免和行重叠） */
  function progressBar(value, kind, showText) {
    var v = util.clamp(+value || 0, 0, 100);
    return el('div', { class: 'pbar pbar-' + (kind || 'accent') }, [
      el('div', { class: 'pbar-in', style: 'width:' + v + '%' }),
      showText === false ? null : el('span', { class: 'pbar-txt', text: v + '%' })
    ]);
  }

  function empty(text, actionLabel, onAction) {
    return el('div', { class: 'empty-state' }, [
      el('div', { class: 'empty-mark', text: '⌗' }),
      el('p', { text: text || '这里还没有数据' }),
      actionLabel ? el('button', { class: 'btn btn-primary btn-sm', text: actionLabel, on: { click: onAction } }) : null
    ]);
  }

  function section(title, children, extra) {
    return el('section', { class: 'panel' }, [
      el('div', { class: 'panel-head' }, [
        el('h2', { text: title }),
        extra || null
      ]),
      el('div', { class: 'panel-body' }, children)
    ]);
  }

  function roleLabel(role) {
    var m = { pm: '项目经理', po: '产品', arch: '架构师', dev: '开发', qa: '测试', ops: '运维', sponsor: '发起人' };
    return m[role] || role || '—';
  }

  function riskLevelText(lv) {
    return { high: '高', mid: '中', low: '低' }[lv] || '—';
  }

  global.PLM.ui = {
    el: el, icon: icon, toast: toast, modal: modal, confirm: confirm, drawer: drawer,
    field: field, form: form, badge: badge, progressBar: progressBar, empty: empty,
    section: section, roleLabel: roleLabel, riskLevelText: riskLevelText, refOptions: refOptions
  };
})(typeof window !== 'undefined' ? window : globalThis);
