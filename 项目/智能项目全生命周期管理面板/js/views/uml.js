/* uml.js —— UML 建模工作台：图列表 / 画布 / spec 编辑 / 导出 */
(function (global) {
  'use strict';

  var PLM = global.PLM;
  var ui = PLM.ui, util = PLM.util, schema = PLM.schema, store = PLM.store;

  var TYPE_LABEL = { usecase: '用例图', class: '类图', state: '状态机图', sequence: '时序图' };

  /* ================= 自动生成 spec ================= */
  function autoClassSpec() {
    return schema.toClassSpec({ methods: false, maxAttrs: 8, relationLabels: 'key' });
  }

  function autoLifecycleSpec() {
    var stages = store.state.config.stages && store.state.config.stages.length ? store.state.config.stages : schema.stages;
    var states = [{ id: 'start', name: '', kind: 'initial' }];
    stages.forEach(function (s) {
      states.push({ id: s.id, name: s.name + '\n/' + s.gate, kind: 'state', entry: s.desc });
    });
    states.push({ id: 'end', name: '', kind: 'final' });
    var transitions = [];
    for (var i = 0; i < stages.length; i++) {
      var from = i === 0 ? 'start' : stages[i - 1].id;
      transitions.push({ from: from, to: stages[i].id, event: '准入通过' });
      if (i > 0) transitions.push({ from: stages[i].id, to: stages[i - 1].id, event: '返工', guard: '评审不通过' });
    }
    transitions.push({ from: stages[stages.length - 1].id, to: 'end', event: '结项' });
    return { states: states, transitions: transitions };
  }

  function autoTaskSpec() {
    return {
      states: [
        { id: 's_todo', name: '待开始', kind: 'initial' },
        { id: 's_doing', name: '进行中', kind: 'state', entry: 'WIP 校验' },
        { id: 's_review', name: '待验收', kind: 'state', entry: '提交自测报告' },
        { id: 's_done', name: '已完成', kind: 'final' }
      ],
      transitions: [
        { from: 's_todo', to: 's_doing', event: '认领任务', guard: 'WIP 未超限' },
        { from: 's_doing', to: 's_review', event: '提交验收' },
        { from: 's_review', to: 's_done', event: '验收通过' },
        { from: 's_review', to: 's_doing', event: '打回修改', guard: '存在缺陷' },
        { from: 's_doing', to: 's_todo', event: '挂起' }
      ]
    };
  }

  function sampleSpec(type) {
    if (type === 'class') return autoClassSpec();
    if (type === 'state') return autoTaskSpec();
    if (type === 'usecase') {
      return {
        boundary: '智能项目全生命周期管理面板',
        actors: [{ id: 'pm', name: '项目经理' }, { id: 'dev', name: '研发' }, { id: 'boss', name: '管理层' }],
        usecases: [
          { id: 'u1', name: '维护项目台账', group: '基础' },
          { id: 'u2', name: '推进生命周期阶段', group: '基础' },
          { id: 'u3', name: '登记任务与看板流转', group: '执行' },
          { id: 'u4', name: '登记与缓解风险', group: '执行' },
          { id: 'u5', name: '提交变更评审', group: '执行' },
          { id: 'u6', name: '查看健康度与预警', group: '分析' },
          { id: 'u7', name: '导出周报与 CSV', group: '分析' },
          { id: 'u8', name: '绘制 UML 模型', group: '分析' }
        ],
        links: [
          { from: 'pm', to: 'u1' }, { from: 'pm', to: 'u2' }, { from: 'pm', to: 'u6' }, { from: 'pm', to: 'u7' },
          { from: 'dev', to: 'u3' }, { from: 'dev', to: 'u4' }, { from: 'dev', to: 'u5' },
          { from: 'boss', to: 'u6' }, { from: 'boss', to: 'u7' },
          { from: 'u5', to: 'u2', kind: 'extend' },
          { from: 'u6', to: 'u4', kind: 'include' }
        ]
      };
    }
    return {
      participants: [{ id: 'a1', name: '用户' }, { id: 'a2', name: '面板' }, { id: 'a3', name: '规则引擎' }, { id: 'a4', name: '存储' }],
      messages: [
        { from: 'a1', to: 'a2', text: '拖拽任务到「已完成」' },
        { from: 'a2', to: 'a3', text: 'evaluate(state)' },
        { from: 'a3', to: 'a2', kind: 'return', text: 'Finding[]' },
        { from: 'a2', to: 'a4', text: 'commit()' },
        { from: 'a4', to: 'a2', kind: 'return', text: 'ok' },
        { from: 'a2', to: 'a1', kind: 'return', text: '刷新看板与预警' }
      ]
    };
  }

  /* ================= 视图 ================= */

  /* 按自动图种类找 id（供深链 #/uml?kind=class 用；这里不能调 kindOf，它在视图作用域内） */
  function byKind(kind) {
    if (!kind) return '';
    var ds = (store.state.diagrams || []).filter(function (x) { return x.source === 'auto'; });
    for (var i = 0; i < ds.length; i++) {
      var d = ds[i];
      var k = d.autoKind || (d.type === 'class' ? 'class'
        : d.type === 'state' ? (/任务/.test(d.name || '') ? 'task' : 'lifecycle') : null);
      if (k === kind) return d.id;
    }
    return '';
  }

  function view(root, params) {
    params = params || {};
    var state = store.state;
    var currentId = params.diagram || byKind(params.kind) || (state.diagrams[0] && state.diagrams[0].id);
    var zoom = 1;
    var editing = false;
    var renderResult = null;

    var listBox = ui.el('div', { class: 'diagram-list' });
    var canvasBox = ui.el('div', { class: 'canvas-stage' });
    var canvasScroll = ui.el('div', { class: 'canvas-scroll' }, [canvasBox]);
    var editorWrap = ui.el('div', { class: 'spec-editor-wrap' });
    var zoomLabel = ui.el('span', { class: 'zoom-label', text: '100%' });
    var pendingFit = true; /* 首次绘制与换图后自动适应一次 */

    function current() { return util.byId(store.state.diagrams, currentId); }

    /* 适应窗口：按画布可视区与图的实际尺寸算缩放比（只缩小不放大，0.4–2） */
    function fitToBox() {
      var w = (renderResult && renderResult.width) || 0;
      var h = (renderResult && renderResult.height) || 0;
      if (!w || !h) { zoom = 1; }
      else {
        /* getBoundingClientRect 才是「肉眼可见」的框（受 max-height 约束） */
        var rect = canvasScroll ? canvasScroll.getBoundingClientRect() : null;
        var boxW = (rect && rect.width ? rect.width : 0) - 24;
        var boxH = (rect && rect.height ? rect.height : 0) - 24;
        if (boxW < 120 || boxH < 120) { zoomLabel.textContent = Math.round(zoom * 100) + '%'; return; }
        zoom = Math.min(1, boxW / w, boxH / h);
        zoom = util.clamp(Math.round(zoom * 20) / 20, 0.4, 2);
      }
      zoomLabel.textContent = Math.round(zoom * 100) + '%';
      paintCanvas();
    }

    function paintList() {
      listBox.innerHTML = '';
      var groups = { auto: '自动生成', manual: '手工建模' };
      ['auto', 'manual'].forEach(function (g) {
        var items = store.state.diagrams.filter(function (d) { return (d.source || 'manual') === g; });
        listBox.appendChild(ui.el('div', { class: 'diagram-group' }, [
          ui.el('div', { class: 'diagram-group-title' }, [
            document.createTextNode(groups[g]),
            g === 'auto' ? ui.el('button', {
              class: 'icon-btn', text: '↻', title: '按当前数据重新生成全部自动图',
              on: { click: regenerateAll }
            }) : ui.el('button', {
              class: 'icon-btn', text: '+', title: '新建手工图',
              on: { click: createManual }
            })
          ])
        ].concat(items.length ? items.map(function (d) {
          return ui.el('div', {
            class: 'diagram-item' + (d.id === currentId ? ' active' : ''),
            on: { click: function () { currentId = d.id; editing = false; pendingFit = true; paintAll(); } }
          }, [
            ui.el('span', { class: 'diagram-type', text: TYPE_LABEL[d.type] || d.type }),
            ui.el('span', { class: 'diagram-name', text: d.name || '未命名' })
          ]);
        }) : [ui.el('div', { class: 'muted', style: 'padding:8px 10px;font-size:12px', text: g === 'auto' ? '点击 ↻ 生成' : '点击 + 新建' })])));
      });
    }

    function paintCanvas() {
      var d = current();
      canvasBox.innerHTML = '';
      editorWrap.innerHTML = '';
      if (!d) {
        canvasBox.appendChild(ui.empty('还没有 UML 图', '生成类图（元模型）', function () { addAuto('class'); }));
        return;
      }
      var spec = specOf(d);
      var res = null;
      if (!global.PLM_UML) {
        res = { error: 'UML 引擎未加载（js/uml/uml.js）' };
      } else if (!spec) {
        res = { error: '这张图还没有 spec，点「编辑 spec」写一个，或用「按当前数据重新生成」' };
      } else {
        try {
          /* 宽度跟随画布容器，避免小窗口里图被横向裁掉；夹在 520–1100 之间 */
          var avail = (canvasScroll && canvasScroll.clientWidth ? canvasScroll.clientWidth : 860) - 32;
          var drawW = Math.max(520, Math.min(1100, avail));
          res = global.PLM_UML.render(d.type, spec, { width: drawW, title: d.name });
        } catch (err) {
          res = { error: '渲染失败：' + (err && err.message ? err.message : String(err)) };
        }
      }
      renderResult = res;
      if (!res || res.error) {
        /* 空图（例如用户把 spec 清成 {classes:[]}）不当错误，给占位提示 */
        var isEmpty = !!(res && res.error && res.error.indexOf('为空') >= 0);
        if (isEmpty) {
          canvasBox.appendChild(ui.el('div', { class: 'canvas-empty' }, [
            ui.el('b', { text: '这张图还没有内容' }),
            ui.el('p', { text: res.error }),
            ui.el('button', {
              class: 'btn btn-sm btn-ghost', text: '编辑 spec 加节点',
              on: { click: function () { editing = true; paintCanvas(); } }
            })
          ]));
        } else {
          canvasBox.appendChild(ui.el('div', { class: 'uml-error' }, [
            ui.el('b', { text: '无法渲染这张图' }),
            ui.el('p', { text: (res && res.error) || '未知错误' }),
            d.source === 'auto' ? ui.el('button', { class: 'btn btn-sm btn-ghost', text: '按当前数据重新生成', on: { click: function () { regenerate(d); } } }) : null
          ]));
        }
      } else {
        var holder = ui.el('div', { class: 'svg-holder' });
        holder.innerHTML = res.svg;
        var svg = holder.querySelector('svg');
        if (svg) {
          svg.style.maxWidth = 'none';
          svg.style.width = Math.round((res.width || 900) * zoom - 2) + 'px';
          svg.style.height = 'auto';
        }
        canvasBox.appendChild(holder);
      }
      if (editing) paintEditor(d);
      if (pendingFit && res && !res.error) { pendingFit = false; fitToBox(); }
    }

    function paintEditor(d) {
      var ta = ui.el('textarea', {
        class: 'spec-editor', spellcheck: 'false',
        style: 'min-height:240px'
      });
      ta.value = JSON.stringify(specOf(d), null, 2);
      var hint = ui.el('div', { class: 'spec-hint muted', text: '编辑 JSON 后点「应用」，会先校验再保存。' });

      editorWrap.appendChild(ui.el('div', { class: 'panel mt' }, [
        ui.el('div', { class: 'panel-head' }, [
          ui.el('b', { text: '图形描述（' + (TYPE_LABEL[d.type] || d.type) + ' spec）' }),
          ui.el('span', { class: 'spacer' }),
          ui.el('button', {
            class: 'btn btn-sm btn-ghost', text: '取消',
            on: { click: function () { editing = false; paintCanvas(); } }
          }),
          ui.el('button', {
            class: 'btn btn-sm btn-primary', text: '应用',
            on: {
              click: function () {
                var obj;
                try {
                  obj = JSON.parse(ta.value);
                } catch (err) {
                  hint.textContent = 'JSON 语法错误：' + (err && err.message);
                  hint.className = 'spec-hint err';
                  ta.classList.add('invalid');
                  return;
                }
                var check = global.PLM_UML
                  ? global.PLM_UML.render(d.type, obj, { width: 860 })
                  : { error: 'UML 引擎未加载' };
                if (check && check.error) {
                  hint.textContent = '校验不通过：' + check.error;
                  hint.className = 'spec-hint err';
                  ta.classList.add('invalid');
                  return;
                }
                store.commit('编辑 UML 图：' + d.name, function (draft) {
                  var t = util.byId(draft.diagrams, d.id);
                  t.spec = obj;
                  t.source = 'manual';
                  t.updatedAt = util.nowISO();
                }, { entity: 'UML 图', entityId: d.id });
                editing = false;
                ui.toast('已保存图形描述', 'ok');
                paintAll();
              }
            }
          })
        ]),
        ui.el('div', { class: 'panel-body' }, [ta, hint])
      ]));
    }

    function paintToolbar() {
      var panel = root.querySelector('.canvas-panel');
      if (!panel) return;
      var d = current();
      var bar = ui.el('div', { class: 'canvas-toolbar' + (d ? '' : ' hidden') }, [
        ui.el('b', { class: 'canvas-title', text: d ? (d.name + '  ·  ' + (TYPE_LABEL[d.type] || d.type)) : 'UML 画布' }),
        ui.el('span', { class: 'spacer' }),
        ui.el('button', { class: 'icon-btn', text: '−', title: '缩小', on: { click: function () { zoom = Math.max(0.4, zoom - 0.1); zoomLabel.textContent = Math.round(zoom * 100) + '%'; paintCanvas(); } } }),
        zoomLabel,
        ui.el('button', { class: 'icon-btn', text: '+', title: '放大', on: { click: function () { zoom = Math.min(2, zoom + 0.1); zoomLabel.textContent = Math.round(zoom * 100) + '%'; paintCanvas(); } } }),
        ui.el('button', { class: 'btn btn-xs btn-ghost', text: '适应', title: '缩放到刚好放下整张图', on: { click: fitToBox } }),
        d ? ui.el('button', {
          class: 'btn btn-xs btn-ghost', text: editing ? '关闭编辑' : '编辑 spec',
          on: { click: function () { editing = !editing; paintCanvas(); } }
        }) : null,
        d ? ui.el('button', { class: 'btn btn-xs btn-ghost', text: '导出 SVG', on: { click: function () { exportSvg(d); } } }) : null,
        d ? ui.el('button', { class: 'btn btn-xs btn-ghost', text: '导出 PNG', on: { click: function () { exportPng(d); } } }) : null,
        d ? ui.el('button', { class: 'btn btn-xs btn-ghost', text: '重命名', on: { click: function () { rename(d); } } }) : null,
        d ? ui.el('button', { class: 'btn btn-xs btn-danger', text: '删除', on: { click: function () { remove(d); } } }) : null
      ]);
      var oldBar = panel.querySelector('.canvas-toolbar');
      if (oldBar) panel.replaceChild(bar, oldBar);
      else panel.insertBefore(bar, canvasScroll);
    }

    function paintAll() {
      paintList();
      paintCanvas();
      paintToolbar();
    }

    /* ---------- 动作 ---------- */
    function exportSvg(d) {
      if (!renderResult || renderResult.error) { ui.toast('当前图还渲染不出来', 'err'); return; }
      util.download((d.name || 'diagram') + '.svg', renderResult.svg, 'image/svg+xml');
    }

    function exportPng(d) {
      if (!renderResult || renderResult.error) { ui.toast('当前图还渲染不出来', 'err'); return; }
      ui.toast('正在生成 PNG…');
      util.svgToPng(renderResult.svg, 2, function (err, blob) {
        if (err) { ui.toast('PNG 导出失败：' + err.message, 'err'); return; }
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = (d.name || 'diagram') + '.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        ui.toast('PNG 已导出', 'ok');
      });
    }

    function rename(d) {
      var input = ui.el('input', { class: 'input', value: d.name || '' });
      ui.modal({
        title: '重命名图形',
        body: input,
        actions: [
          { label: '取消', kind: 'ghost' },
          {
            label: '保存', kind: 'primary',
            onClick: function () {
              var v = input.value.trim();
              if (!v) { ui.toast('名字不能为空', 'err'); return false; }
              store.commit('重命名 UML 图：' + v, function (draft) {
                var t = util.byId(draft.diagrams, d.id);
                t.name = v;
              }, { entity: 'UML 图', entityId: d.id });
              paintAll();
              return true;
            }
          }
        ]
      });
    }

    function remove(d) {
      ui.confirm('删除图形「' + d.name + '」？此操作可撤销。', { danger: true, okLabel: '删除' }).then(function (yes) {
        if (!yes) return;
        store.commit('删除 UML 图：' + d.name, function (draft) {
          draft.diagrams = draft.diagrams.filter(function (x) { return x.id !== d.id; });
        }, { entity: 'UML 图', entityId: d.id });
        if (currentId === d.id) currentId = (store.state.diagrams[0] || {}).id || '';
        paintAll();
        ui.toast('已删除', 'ok');
      });
    }

    /* 这张图当前该渲染的 spec：自动图没有 spec 时按当前数据现算一份（不落盘） */
    function specOf(d) {
      if (!d) return null;
      if (d.spec) return d.spec;
      if (d.source !== 'auto') return null;
      var k = kindOf(d);
      return k === 'class' ? autoClassSpec()
        : k === 'lifecycle' ? autoLifecycleSpec()
          : k === 'task' ? autoTaskSpec() : null;
    }

    /* 自动图的「种类」：优先读 autoKind，老数据没这个字段就按 type/名字推断 */
    function kindOf(d) {
      if (!d || d.source !== 'auto') return null;
      if (d.autoKind) return d.autoKind;
      if (d.type === 'class') return 'class';
      if (d.type === 'state') return /任务/.test(d.name || '') ? 'task' : 'lifecycle';
      return null;
    }

    function addAuto(kind) {
      var meta = {
        class: { name: '领域模型类图（自动）', type: 'class', spec: autoClassSpec() },
        lifecycle: { name: '项目生命周期状态机（自动）', type: 'state', spec: autoLifecycleSpec() },
        task: { name: '任务状态机（自动）', type: 'state', spec: autoTaskSpec() }
      }[kind];
      var id = util.uid('d');
      /* 同 kind 的自动图已经存在就原地刷新，不要每次都堆一张新图 */
      var existing = store.state.diagrams.filter(function (x) { return kindOf(x) === kind; })[0];
      if (existing) {
        store.commit('重新生成 UML 图：' + existing.name, function (draft) {
          var t = util.byId(draft.diagrams, existing.id);
          if (!t) return false;
          t.spec = util.clone(meta.spec);
          t.updatedAt = util.nowISO();
        }, { entity: 'UML 图' });
        currentId = existing.id;
        paintAll();
        ui.toast('已按当前数据重建「' + existing.name + '」', 'ok');
        return;
      }
      store.commit('生成 UML 图：' + meta.name, function (draft) {
        draft.diagrams.push({
          id: id, name: meta.name, type: meta.type, spec: meta.spec,
          source: 'auto', autoKind: kind, projectId: null,
          createdAt: util.nowISO(), updatedAt: util.nowISO()
        });
      }, { entity: 'UML 图' });
      currentId = id;
      paintAll();
      ui.toast('已生成', 'ok');
    }

    function regenerate(d) {
      var k = kindOf(d);
      var spec = k === 'class' ? autoClassSpec()
        : k === 'lifecycle' ? autoLifecycleSpec()
          : k === 'task' ? autoTaskSpec() : null;
      if (!spec) return;
      store.commit('重新生成 UML 图：' + d.name, function (draft) {
        var t = util.byId(draft.diagrams, d.id);
        t.spec = spec;
        t.updatedAt = util.nowISO();
      }, { entity: 'UML 图', entityId: d.id });
      paintCanvas();
      ui.toast('已按当前数据重新生成', 'ok');
    }

    function regenerateAll() {
      var autos = store.state.diagrams.filter(function (d) { return d.source === 'auto'; });
      if (!autos.length) { ui.toast('还没有自动生成的图'); return; }
      store.commit('重新生成全部自动 UML 图', function (draft) {
        draft.diagrams.forEach(function (t) {
          if (t.source !== 'auto') return;
          var kk = kindOf(t);
          t.spec = kk === 'class' ? autoClassSpec()
            : kk === 'lifecycle' ? autoLifecycleSpec()
              : kk === 'task' ? autoTaskSpec() : t.spec;
          t.updatedAt = util.nowISO();
        });
      }, { entity: 'UML 图' });
      paintAll();
      ui.toast('已重新生成 ' + autos.length + ' 张图', 'ok');
    }

    var typeSel = ui.el('select', { class: 'input', style: 'width:140px' },
      Object.keys(TYPE_LABEL).map(function (k) { return ui.el('option', { value: k, text: TYPE_LABEL[k] }); }));
    var nameInput = ui.el('input', { class: 'input', placeholder: '图形名称，如「对账系统类图」' });

    function createManual() {
      typeSel.value = 'class';
      nameInput.value = '';
      ui.modal({
        title: '新建 UML 图',
        body: ui.el('div', { class: 'form-grid' }, [
          ui.el('div', { class: 'form-item' }, [ui.el('label', { text: '图形类型' }), typeSel]),
          ui.el('div', { class: 'form-item' }, [ui.el('label', { text: '名称' }), nameInput])
        ]),
        actions: [
          { label: '取消', kind: 'ghost' },
          {
            label: '创建', kind: 'primary',
            onClick: function () {
              var nm = nameInput.value.trim() || (TYPE_LABEL[typeSel.value] + '（未命名）');
              var id = util.uid('d');
              store.commit('新建 UML 图：' + nm, function (draft) {
                draft.diagrams.push({
                  id: id, name: nm, type: typeSel.value, spec: sampleSpec(typeSel.value),
                  source: 'manual', projectId: null,
                  createdAt: util.nowISO(), updatedAt: util.nowISO()
                });
              }, { entity: 'UML 图' });
              currentId = id;
              editing = true;
              paintAll();
              return true;
            }
          }
        ]
      });
    }

    /* ---------- 装配 ---------- */
    var autoBar = ui.el('div', { class: 'toolbar auto-bar' }, [
      ui.el('span', { class: 'muted', style: 'font-size:12px', text: '从当前数据生成：' }),
      ui.el('button', { class: 'btn btn-xs', text: '类图（元模型）', on: { click: function () { addAuto('class'); } } }),
      ui.el('button', { class: 'btn btn-xs', text: '生命周期状态机', on: { click: function () { addAuto('lifecycle'); } } }),
      ui.el('button', { class: 'btn btn-xs', text: '任务状态机', on: { click: function () { addAuto('task'); } } }),
      ui.el('span', { class: 'spacer' }),
      ui.el('span', { class: 'muted', style: 'font-size:12px', text: '类图随 schema 扩展自动生长' })
    ]);

    root.appendChild(ui.el('div', { class: 'uml-layout' }, [
      ui.el('div', { class: 'uml-side' }, [
        ui.el('div', { class: 'panel' }, [
          ui.el('div', { class: 'panel-head' }, [ui.el('b', { text: 'UML 图集' }), ui.el('span', { class: 'spacer' }),
            ui.el('span', { class: 'muted', style: 'font-size:11.5px', text: store.state.diagrams.length + ' 张' })]),
          ui.el('div', { class: 'panel-body flush' }, [listBox])
        ])
      ]),
      ui.el('div', { class: 'uml-main' }, [
        autoBar,
        ui.el('div', { class: 'panel canvas-panel' }, [
          ui.el('div', { class: 'canvas-toolbar' + (current() ? '' : ' hidden') }),
          canvasScroll
        ]),
        editorWrap
      ])
    ]));

    paintAll();

    var unsub = store.subscribe(function () {
      if (currentId && !current()) currentId = (store.state.diagrams[0] || {}).id || '';
      paintAll();
    });
    root.addEventListener('plm:dispose', unsub);
  }

  PLM.registry.addView({
    id: 'uml', title: 'UML 建模', icon: '◇', order: 40,
    desc: '用例 / 类 / 状态 / 时序四类图，支持自动生成与手工编辑',
    render: view
  });
})(typeof window !== 'undefined' ? window : globalThis);
