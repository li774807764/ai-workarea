/* table.js —— 由 schema 驱动的通用表格 / 表单 / 删除（供各视图复用） */
(function (global) {
  'use strict';

  var ui = global.PLM.ui;
  var util = global.PLM.util;
  var schema = global.PLM.schema;
  var store = global.PLM.store;

  function labelOf(def, value) {
    if (value == null || value === '') return '—';
    if (def.type === 'select') {
      var o = (def.options || []).find(function (x) { return String(x.value) === String(value); });
      return o ? o.label : String(value);
    }
    if (def.type === 'ref') {
      var arr = store.state[def.ref + 's'] || [];
      var item = util.byId(arr, value);
      if (!item) return '（失效引用）';
      return item.name || item.title || item.id;
    }
    if (def.type === 'date') return util.fmtDate(value);
    if (def.type === 'number') return util.fmtNum(value, value % 1 ? 1 : 0);
    if (def.type === 'tags') return Array.isArray(value) ? value.join(' / ') : '';
    return String(value);
  }

  /* 单元格渲染（可被调用方覆盖） */
  function renderCell(entityKey, item, def) {
    if (!def) return document.createTextNode('—');
    var v = item[def.key];

    if (entityKey === 'project' && def.key === 'stageId') {
      var s = schema.stage[v] || schema.stages[0];
      return ui.el('span', { class: 'badge', style: 'color:' + s.color + ';border-color:' + s.color + '55' }, [
        ui.el('span', { style: 'width:6px;height:6px;border-radius:50%;background:' + s.color, class: '' }),
        document.createTextNode(s.name)
      ]);
    }
    if (entityKey === 'project' && def.key === 'status') {
      var m = { active: ['进行中', 'accent'], paused: ['已暂停', 'warn'], done: ['已交付', 'ok'], archived: ['已归档', 'neutral'] };
      var mm = m[v] || [v, 'neutral'];
      return ui.badge(mm[0], mm[1]);
    }
    if (entityKey === 'project' && def.key === 'priority') {
      var p = { P0: 'err', P1: 'warn', P2: 'accent', P3: 'neutral' };
      return ui.badge(v || '—', p[v] || 'neutral');
    }
    if (def.key === 'status') {
      var maps = {
        task: { todo: ['待开始', 'neutral'], doing: ['进行中', 'accent'], review: ['待验收', 'warn'], done: ['已完成', 'ok'] },
        risk: { open: ['未缓解', 'err'], mitigating: ['缓解中', 'warn'], closed: ['已关闭', 'ok'] },
        change: { proposed: ['待决策', 'warn'], approved: ['已批准', 'ok'], rejected: ['已驳回', 'neutral'] },
        milestone: { pending: ['未达成', 'neutral'], met: ['已达成', 'ok'], missed: ['已错过', 'err'] },
        deliverable: { draft: ['草稿', 'neutral'], in_review: ['评审中', 'warn'], accepted: ['已验收', 'ok'] },
        diagram: { manual: ['手工', 'neutral'], auto: ['自动生成', 'accent'] }
      };
      var mmap = (maps[entityKey] || {})[v];
      return ui.badge(mmap ? mmap[0] : (v || '—'), mmap ? mmap[1] : 'neutral');
    }
    if (entityKey === 'risk' && (def.key === 'probability' || def.key === 'impact')) {
      return ui.el('span', { class: 'num', text: String(v == null ? '—' : v) });
    }
    if (entityKey === 'project' && def.key === 'dueDate') {
      var dl = util.daysBetween(util.today(), v);
      var bad = dl != null && dl < 0;
      return ui.el('span', { class: bad ? 'nowrap overdue' : 'nowrap', style: bad ? 'color:var(--err)' : '' }, [
        document.createTextNode(util.fmtDate(v)),
        bad ? ui.el('small', { text: '（超期' + Math.abs(dl) + '天）' }) : null
      ]);
    }
    if (def.type === 'tags' && Array.isArray(v)) {
      return ui.el('span', { class: 'chips' }, v.map(function (t) { return ui.el('span', { class: 'chip', text: t }); }));
    }
    if (def.type === 'select' || def.type === 'ref' || def.type === 'date') {
      return document.createTextNode(labelOf(def, v));
    }
    var txt = labelOf(def, v);
    return ui.el('span', { class: 'nowrap', title: txt }, [document.createTextNode(util.truncate(txt, 46))]);
  }

  /* columns: [{ key, label, render?, width? }] */
  function table(opt) {
    opt = opt || {};
    var entityKey = opt.entityKey;
    var cols = opt.columns || schema.tableColumns(entityKey).map(function (f) {
      return { key: f.key, label: f.label, def: f, width: f.width };
    });

    if (!opt.rows || !opt.rows.length) {
      return ui.empty(opt.emptyText || '暂无数据', opt.emptyAction, opt.emptyActionFn);
    }

    var tbody = ui.el('tbody');
    opt.rows.forEach(function (item) {
      var tr = ui.el('tr', {
        on: { click: function () { if (opt.onRowClick) opt.onRowClick(item); } }
      });
      cols.forEach(function (c) {
        var def = c.def || schema.fieldOf(entityKey, c.key);
        var td = ui.el('td', { class: c.num ? 'num' : '' });
        if (c.render) {
          var r = c.render(item);
          td.appendChild(typeof r === 'string' ? document.createTextNode(r) : r);
        } else {
          td.appendChild(renderCell(entityKey, item, def));
        }
        if (c.width) td.style.maxWidth = c.width + 'px';
        tr.appendChild(td);
      });
      if (opt.rowActions !== false) {
        var actions = ui.el('td', { style: 'width:1%' }, [
          ui.el('div', { class: 'row-actions' }, [
            ui.el('button', {
              class: 'icon-btn', text: '✎', title: '编辑',
              on: { click: function (e) { e.stopPropagation(); openForm(entityKey, item, opt); } }
            }),
            ui.el('button', {
              class: 'icon-btn', text: '✕', title: '删除',
              on: { click: function (e) { e.stopPropagation(); removeEntity(entityKey, item.id, opt); } }
            })
          ])
        ]);
        tr.appendChild(actions);
      }
      tbody.appendChild(tr);
    });

    var thead = ui.el('thead', {}, [
      ui.el('tr', {}, cols.map(function (c) {
        return ui.el('th', { text: c.label, style: c.width ? 'max-width:' + c.width + 'px' : '' });
      }).concat(opt.rowActions !== false ? [ui.el('th', { text: '' })] : []))
    ]);

    return ui.el('div', { class: 'table-wrap' }, [ui.el('table', { class: 'tbl' }, [thead, tbody])]);
  }

  /* 新建 / 编辑表单 */
  function openForm(entityKey, obj, opt) {
    opt = opt || {};
    var e = schema.entities[entityKey];
    var isNew = !obj;
    var defaults = {};
    if (opt.preset) Object.assign(defaults, opt.preset);
    e.fields.forEach(function (f) {
      if (f.key === 'projectId' && !defaults.projectId && opt.projectId) defaults.projectId = opt.projectId;
    });
    var form = ui.form(entityKey, obj || defaults, opt);

    var modal = ui.modal({
      title: (isNew ? '新建' : '编辑') + e.label,
      wide: true,
      body: form.el,
      actions: [
        { label: '取消', kind: 'ghost' },
        {
          label: '保存', kind: 'primary',
          onClick: function () {
            var data = form.read();
            if (!data) { ui.toast('有必填项未填写', 'err'); return false; }
            var ok = store.commit(
              (isNew ? '新建' : '编辑') + e.label + '：' + (data[e.title] || data.title || data.name || ''),
              function (draft) {
                if (isNew) {
                  data.id = util.uid(entityKey.charAt(0));
                  data.createdAt = util.nowISO();
                  data.updatedAt = data.createdAt;
                  draft[entityKey + 's'].push(data);
                } else {
                  var target = util.byId(draft[entityKey + 's'], obj.id);
                  if (!target) return false;
                  Object.keys(data).forEach(function (k) { target[k] = data[k]; });
                  target.updatedAt = util.nowISO();
                }
              },
              { entity: e.label, entityId: isNew ? '' : obj.id }
            );
            if (ok) {
              ui.toast((isNew ? '已创建' : '已更新') + e.label, 'ok');
              if (opt.onSaved) opt.onSaved();
            }
            return ok;
          }
        }
      ]
    });
    return modal;
  }

  /* 删除（含级联说明） */
  var CASCADE = {
    project: ['tasks', 'risks', 'changes', 'milestones', 'deliverables'],
    member: [],
    task: [], risk: [], change: [], milestone: [], deliverable: [], diagram: []
  };

  function removeEntity(entityKey, id, opt) {
    var e = schema.entities[entityKey];
    var arr = store.state[entityKey + 's'] || [];
    var item = util.byId(arr, id);
    if (!item) return;
    var name = item[e.title] || item.name || item.id;
    var cascades = (CASCADE[entityKey] || []).map(function (k) {
      var n = (store.state[k] || []).filter(function (x) { return x.projectId === id; }).length;
      return n ? (schema.entities[k.replace(/s$/, '')] || {}).label + ' ' + n + ' 条' : null;
    }).filter(Boolean);

    ui.confirm(
      '将删除「' + name + '」' + (cascades.length ? '，同时删除关联的 ' + cascades.join('、') + '。' : '。') + '此操作可撤销。',
      { danger: true, okLabel: '删除' }
    ).then(function (yes) {
      if (!yes) return;
      var ok = store.commit('删除' + e.label + '：' + name, function (draft) {
        draft[entityKey + 's'] = draft[entityKey + 's'].filter(function (x) { return x.id !== id; });
        (CASCADE[entityKey] || []).forEach(function (k) {
          draft[k] = (draft[k] || []).filter(function (x) { return x.projectId !== id; });
        });
      }, { entity: e.label, entityId: id });
      if (ok) {
        ui.toast('已删除', 'ok');
        if (opt && opt.onSaved) opt.onSaved();
      }
    });
  }

  global.PLM.crud = {
    table: table,
    openForm: openForm,
    removeEntity: removeEntity,
    renderCell: renderCell,
    labelOf: labelOf,
    CASCADE: CASCADE
  };
})(typeof window !== 'undefined' ? window : globalThis);
