/* kanban.js —— 任务看板：四列拖拽流转，提交即落盘 */
(function (global) {
  'use strict';

  var PLM = global.PLM;
  var ui = PLM.ui, util = PLM.util, schema = PLM.schema, store = PLM.store;

  var COLS = [
    { key: 'todo', label: '待开始', tone: 'neutral' },
    { key: 'doing', label: '进行中', tone: 'accent' },
    { key: 'review', label: '待验收', tone: 'warn' },
    { key: 'done', label: '已完成', tone: 'ok' }
  ];

  function cardEl(task, ctx) {
    var proj = util.byId(store.state.projects, task.projectId);
    var owner = util.byId(store.state.members, task.assignee);
    var overdue = task.status !== 'done' && task.dueDate && task.dueDate < util.today();
    var prioMap = { P0: 'err', P1: 'warn', P2: 'accent', P3: 'neutral' };

    var card = ui.el('div', {
      class: 'kcard' + (overdue ? ' kcard-overdue' : ''),
      draggable: 'true',
      dataset: { id: task.id },
      on: {
        dragstart: function (e) {
          e.dataTransfer.setData('text/plain', task.id);
          e.dataTransfer.effectAllowed = 'move';
          card.classList.add('dragging');
          ctx.root.classList.add('dragging-active');
        },
        dragend: function () {
          card.classList.remove('dragging');
          ctx.root.classList.remove('dragging-active');
        },
        click: function () { PLM.crud.openForm('task', task, { onSaved: ctx.repaint }); }
      }
    }, [
      ui.el('div', { class: 'kcard-top' }, [
        ui.badge(task.priority || 'P2', prioMap[task.priority] || 'neutral'),
        proj ? ui.el('span', { class: 'kcard-proj', text: proj.name, title: proj.name }) : null
      ]),
      ui.el('div', { class: 'kcard-title', text: task.title }),
      ui.el('div', { class: 'kcard-meta' }, [
        owner ? ui.el('span', { class: 'avatar sm', text: owner.name.slice(0, 1), title: owner.name + ' · ' + owner.role }) : ui.el('span', { class: 'muted', text: '未指派' }),
        task.dueDate ? ui.el('span', { class: overdue ? 'kcard-due overdue' : 'kcard-due', text: util.fmtDateShort(task.dueDate) }) : null,
        task.estimate ? ui.el('span', { class: 'muted', text: task.estimate + 'h' }) : null
      ])
    ]);
    return card;
  }

  function view(root, params) {
    params = params || {};
    var state = store.state;
    var filterProject = params.project || '';
    var q = '';

    var wrap = ui.el('div', { class: 'kanban-wrap' });

    function repaint() {
      wrap.innerHTML = '';
      var ctx = { root: wrap, repaint: repaint };
      var tasks = store.state.tasks.filter(function (t) {
        if (filterProject && t.projectId !== filterProject) return false;
        if (q) {
          var hay = (t.title + ' ' + (t.desc || '') + ' ' + (t.tags || []).join(' ')).toLowerCase();
          if (hay.indexOf(q.toLowerCase()) < 0) return false;
        }
        return true;
      });

      var board = ui.el('div', { class: 'kanban' });
      COLS.forEach(function (col) {
        var list = tasks.filter(function (t) { return (t.status || 'todo') === col.key; })
          .sort(function (a, b) {
            var pa = { P0: 0, P1: 1, P2: 2, P3: 3 }[a.priority] || 2;
            var pb = { P0: 0, P1: 1, P2: 2, P3: 3 }[b.priority] || 2;
            if (pa !== pb) return pa - pb;
            return String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'));
          });
        var wipLimit = (+store.state.config.wipLimit) || 3;
        var over = col.key === 'doing' && list.length > wipLimit;

        var body = ui.el('div', { class: 'kcol-body' });
        list.forEach(function (t) { body.appendChild(cardEl(t, ctx)); });
        if (!list.length) {
          body.appendChild(ui.el('div', { class: 'kcol-empty', text: '拖到这里' }));
        }

        ['dragenter', 'dragover'].forEach(function (evt) {
          body.addEventListener(evt, function (e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            body.classList.add('drag-over');
          });
        });
        body.addEventListener('dragleave', function (e) {
          if (!body.contains(e.relatedTarget)) body.classList.remove('drag-over');
        });
        body.addEventListener('drop', function (e) {
          e.preventDefault();
          body.classList.remove('drag-over');
          var id = e.dataTransfer.getData('text/plain');
          if (!id) return;
          var task = util.byId(store.state.tasks, id);
          if (!task || task.status === col.key) return;
          var ok = store.commit('移动任务：' + task.title + ' → ' + col.label, function (draft) {
            var t = util.byId(draft.tasks, id);
            t.status = col.key;
            t.updatedAt = util.nowISO();
            if (col.key === 'done' && !t.doneAt) t.doneAt = util.nowISO();
            if (col.key !== 'done') delete t.doneAt;
          }, { entity: 'task', entityId: id });
          if (ok) {
            ui.toast('已流转到「' + col.label + '」', 'ok');
            repaint();
          }
        });

        var head = ui.el('div', { class: 'kcol-head ' + col.tone }, [
          ui.el('span', { class: 'kcol-title', text: col.label }),
          ui.el('span', { class: 'kcol-count' + (over ? ' over' : ''), text: String(list.length) + (col.key === 'doing' ? ' / ' + wipLimit : '') }),
          ui.el('button', {
            class: 'icon-btn', text: '+', title: '在此列新建任务',
            on: {
              click: function () {
                PLM.crud.openForm('task', null, {
                  projectId: filterProject || undefined,
                  preset: { status: col.key, priority: 'P2' },
                  onSaved: repaint
                });
              }
            }
          })
        ]);
        if (over) head.appendChild(ui.el('div', { class: 'kcol-warn', text: '并行 WIP 超限，先收口再开新' }));

        board.appendChild(ui.el('div', { class: 'kcol' }, [head, body]));
      });
      wrap.appendChild(board);
    }

    /* 顶部工具条 */
    var projSel = ui.el('select', {
      class: 'input', style: 'width:260px',
      on: { change: function () { filterProject = projSel.value; repaint(); } }
    }, [ui.el('option', { value: '', text: '全部项目' })].concat(
      store.state.projects.filter(function (p) { return p.status !== 'archived'; }).map(function (p) {
        return ui.el('option', { value: p.id, text: p.code + ' · ' + p.name, selected: p.id === filterProject ? 'selected' : null });
      })
    ));

    var search = ui.el('input', {
      class: 'input search', type: 'search', placeholder: '搜索任务标题 / 标签…',
      on: {
        input: util.debounce(function (e) { q = e.target.value.trim(); repaint(); }, 160)
      }
    });

    var toolbar = ui.el('div', { class: 'toolbar' }, [
      projSel, search, ui.el('span', { class: 'spacer' }),
      ui.el('button', {
        class: 'btn btn-primary', text: '＋ 新建任务',
        on: { click: function () { PLM.crud.openForm('task', null, { projectId: filterProject || undefined, onSaved: repaint }); } }
      })
    ]);

    root.appendChild(toolbar);
    root.appendChild(wrap);
    repaint();
  }

  PLM.registry.addView({
    id: 'kanban', title: '任务看板', icon: '▤', order: 30,
    desc: '拖拽流转任务状态，WIP 超限提示',
    render: view
  });
})(typeof window !== 'undefined' ? window : globalThis);
