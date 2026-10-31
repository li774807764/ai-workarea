/* projects.js —— 项目列表：阶段/状态筛选、检索、详情抽屉、阶段推进 */
(function (global) {
  'use strict';

  var PLM = global.PLM;
  var ui = PLM.ui, util = PLM.util, schema = PLM.schema, store = PLM.store;

  function stageStepBar(p) {
    var idx = schema.stageIndex(p.stageId);
    var nodes = schema.stages.map(function (s, i) {
      var cls = i < idx ? 'done' : i === idx ? 'cur' : '';
      return ui.el('div', { class: 'stage-node ' + cls, title: s.name + ' · ' + s.gate }, [
        ui.el('i', { style: 'background:' + (i <= idx ? s.color : 'var(--line)') }),
        ui.el('b', { text: s.name })
      ]);
    });
    return ui.el('div', { class: 'stage-bar' }, nodes);
  }

  function healthBadge(h) {
    var m = { ok: ['健康 ' + h.score, 'ok'], watch: ['关注 ' + h.score, 'warn'], risk: ['风险 ' + h.score, 'err'] };
    var mm = m[h.level] || m.watch;
    return ui.badge(mm[0], mm[1]);
  }

  /* ---------- 详情抽屉 ---------- */
  function openDetail(id) {
    var p = util.byId(store.state.projects, id);
    if (!p) return;
    var d = store.derive(p);
    var owner = util.byId(store.state.members, p.owner);
    /* derive() 不含变更，单独取（变更按项目归属） */
    var chg = store.state.changes.filter(function (c) { return c.projectId === id; })
      .sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });

    var head = ui.el('div', { class: 'detail-head' }, [
      ui.el('div', {}, [
        ui.el('div', { class: 'detail-code', text: p.code }),
        ui.el('h2', { text: p.name }),
        ui.el('div', { class: 'chips mt-s' }, [
          ui.badge(d.stage.name, 'accent'),
          ui.badge(p.status === 'active' ? '进行中' : p.status === 'paused' ? '已暂停' : p.status === 'done' ? '已交付' : '已归档', 'neutral'),
          ui.badge(p.priority || 'P2', 'warn'),
          healthBadge(d.health)
        ])
      ]),
      ui.el('div', { class: 'detail-actions' }, [
        ui.el('button', {
          class: 'btn btn-ghost btn-sm', text: '编辑',
          on: { click: function () { PLM.crud.openForm('project', p, { onSaved: function () { openDetail(id); } }); } }
        }),
        schema.nextStage(p.stageId) ? ui.el('button', {
          class: 'btn btn-primary btn-sm',
          text: '推进到「' + schema.nextStage(p.stageId).name + '」',
          on: {
            click: function () {
              var next = schema.nextStage(p.stageId);
              ui.confirm('确认将「' + p.name + '」推进到「' + next.name + '」？准入条件：' + next.gate, { okLabel: '推进' }).then(function (yes) {
                if (!yes) return;
                store.commit('阶段推进：' + p.name + ' → ' + next.name, function (draft) {
                  var t = util.byId(draft.projects, id);
                  t.stageId = next.id;
                  t.stageEnteredAt = util.today();
                  t.updatedAt = util.nowISO();
                }, { entity: '项目', entityId: id });
                ui.toast('已推进到「' + next.name + '」', 'ok');
                openDetail(id);
                PLM.app.refresh();
              });
            }
          }
        }) : null
      ])
    ]);

    var info = ui.el('div', { class: 'kv' }, [
      ['负责人', owner ? owner.name + '（' + owner.role + '）' : '未指派'],
      ['起止', (p.startDate ? util.fmtDate(p.startDate) : '—') + ' → ' + (p.dueDate ? util.fmtDate(p.dueDate) : '—')],
      ['剩余', (function () {
        var dl = util.daysBetween(util.today(), p.dueDate);
        if (dl == null) return '—';
        return dl < 0 ? '已超期 ' + Math.abs(dl) + ' 天' : dl + ' 天';
      })()],
      ['任务', d.taskStats.done + ' / ' + d.taskStats.total + ' 已完成，逾期 ' + d.taskStats.overdue],
      ['进度', d.progress + '%（按工时加权）'],
      ['未关闭风险', d.openRisks.length + '（最高 ' + (d.riskScore || 0) + ' 分 · ' + PLM.crud.labelOf({ type: 'select', options: [{ value: 'high', label: '高' }, { value: 'mid', label: '中' }, { value: 'low', label: '低' }] }, d.riskLevel) + '）'],
      ['交付物', d.acceptedCount + ' / ' + d.deliverables.length + ' 已验收'],
      ['阶段停留', d.stageIdleDays + ' 天']
    ].map(function (pair) {
      return ui.el('div', { class: 'kv-row' }, [ui.el('span', { class: 'kv-k', text: pair[0] }), ui.el('span', { class: 'kv-v', text: pair[1] })]);
    }));

    var healthBox = ui.el('div', { class: 'health-box' }, [
      ui.el('div', { class: 'health-top' }, [
        ui.el('span', { text: '综合健康度' }),
        ui.el('b', { text: d.health.score + ' / 100' })
      ]),
      ui.progressBar(d.health.score, d.health.level === 'ok' ? 'ok' : d.health.level === 'watch' ? 'warn' : 'err', false),
      d.health.reasons.length
        ? ui.el('ul', { class: 'reason-list' }, d.health.reasons.map(function (r) { return ui.el('li', { text: r }); }))
        : ui.el('p', { class: 'muted', text: '各项指标正常' })
    ]);

    function miniTable(title, entityKey, rows, cols) {
      var panel = ui.el('div', { class: 'mini-panel' }, [
        ui.el('div', { class: 'mini-head' }, [
          ui.el('b', { text: title + '（' + rows.length + '）' }),
          ui.el('button', {
            class: 'btn btn-ghost btn-xs', text: '＋',
            on: { click: function () { PLM.crud.openForm(entityKey, null, { projectId: id, onSaved: function () { openDetail(id); } }); } }
          })
        ])
      ]);
      if (!rows.length) {
        panel.appendChild(ui.el('p', { class: 'muted', style: 'font-size:12px;margin:6px 0', text: '暂无' }));
      } else {
        rows.forEach(function (r) {
          panel.appendChild(ui.el('div', { class: 'mini-row' }, cols.map(function (c) {
            return c(r);
          })));
        });
      }
      return panel;
    }

    var body = ui.el('div', { class: 'detail-body' }, [
      head,
      stageStepBar(p),
      ui.el('div', { class: 'grid grid-2 mt' }, [ui.el('div', {}, [ui.section('基本信息', [info])]), ui.section('健康度诊断', [healthBox])]),
      ui.el('div', { class: 'grid grid-2 mt' }, [
        miniTable('任务', 'task', d.tasks.slice(0, 8), [
          function (r) { return ui.el('span', { class: 'nowrap', text: r.title }); },
          function (r) { return PLM.crud.renderCell('task', r, schema.fieldOf('task', 'status')); }
        ]),
        miniTable('风险', 'risk', d.openRisks.slice(0, 6), [
          function (r) { return ui.el('span', { class: 'nowrap', text: r.title }); },
          function (r) { return ui.badge((+r.probability * +r.impact) >= 15 ? '高' : (+r.probability * +r.impact) >= 8 ? '中' : '低', (+r.probability * +r.impact) >= 15 ? 'err' : (+r.probability * +r.impact) >= 8 ? 'warn' : 'neutral'); }
        ])
      ]),
      ui.el('div', { class: 'grid grid-2 mt' }, [
        miniTable('变更', 'change', chg.slice(0, 6), [
          function (r) { return ui.el('span', { class: 'nowrap', text: r.title }); },
          function (r) { return PLM.crud.renderCell('change', r, schema.fieldOf('change', 'status')); }
        ]),
        miniTable('里程碑', 'milestone', d.milestones.slice(0, 6), [
          function (r) { return ui.el('span', { class: 'nowrap', text: util.fmtDate(r.dueDate) }); },
          function (r) { return ui.el('span', { class: 'nowrap', text: r.title }); },
          function (r) { return PLM.crud.renderCell('milestone', r, schema.fieldOf('milestone', 'status')); }
        ])
      ]),
      ui.el('div', { class: 'mt' }, [
        miniTable('交付物', 'deliverable', d.deliverables, [
          function (r) { return ui.el('span', { class: 'nowrap', text: r.title }); },
          function (r) { return PLM.crud.renderCell('deliverable', r, schema.fieldOf('deliverable', 'status')); },
          function (r) { return ui.el('span', { class: 'muted', text: r.version || '' }); }
        ])
      ])
    ]);

    ui.drawer({ title: p.code + ' · ' + p.name, body: body, wide: true });
  }

  /* ---------- 列表 ---------- */
  function view(root, params) {
    params = params || {};
    var filter = { stage: params.stage || '', status: params.status || '', q: '' };

    var toolbar, listWrap;
    function repaint() {
      var rows = store.state.projects.filter(function (p) {
        if (filter.stage && p.stageId !== filter.stage) return false;
        if (filter.status && p.status !== filter.status) return false;
        if (filter.q) {
          var hay = (p.name + ' ' + p.code + ' ' + (p.desc || '') + ' ' + (p.tags || []).join(' ')).toLowerCase();
          if (hay.indexOf(filter.q.toLowerCase()) < 0) return false;
        }
        return true;
      });
      listWrap.innerHTML = '';
      listWrap.appendChild(PLM.crud.table({
        entityKey: 'project',
        rows: rows,
        onRowClick: function (p) { openDetail(p.id); },
        columns: [
          { key: 'code', label: '编号', width: 96 },
          { key: 'name', label: '项目', width: 220 },
          {
            key: 'stageId', label: '阶段', render: function (p) {
              var s = schema.stage[p.stageId] || schema.stages[0];
              return ui.badge(s.name, 'accent');
            }
          },
          { key: 'status', label: '状态' },
          { key: 'priority', label: '优先级' },
          {
            key: 'owner', label: '负责人', render: function (p) {
              var m = util.byId(store.state.members, p.owner);
              return m ? ui.el('span', { class: 'nowrap' }, [ui.el('span', { class: 'avatar sm', text: m.name.slice(0, 1) }), document.createTextNode(' ' + m.name)]) : ui.el('span', { class: 'muted', text: '未指派' });
            }
          },
          {
            key: 'progress', label: '进度', render: function (p) {
              var d = store.derive(p);
              return ui.el('div', { class: 'cell-progress' }, [ui.progressBar(d.progress, d.progress >= 100 ? 'ok' : 'accent', false), ui.el('small', { text: d.progress + '%' })]);
            }
          },
          {
            key: 'health', label: '健康', render: function (p) { return healthBadge(store.derive(p).health); }
          },
          { key: 'dueDate', label: '计划完成' }
        ],
        emptyText: '没有符合条件的项目',
        emptyAction: '新建项目',
        emptyActionFn: function () { PLM.crud.openForm('project', null, { onSaved: repaint }); }
      }));
    }

    /* 顶部：阶段胶囊 + 搜索 + 新建 */
    var stageChips = ui.el('div', { class: 'chips' }, [
      ui.el('span', {
        class: 'chip' + (!filter.stage ? ' on' : ''), text: '全部阶段',
        on: { click: function () { filter.stage = ''; syncChips(); repaint(); } }
      })
    ].concat(schema.stages.map(function (s) {
      return ui.el('span', {
        class: 'chip' + (filter.stage === s.id ? ' on' : ''), text: s.name, dataset: { stage: s.id },
        on: { click: function (e) { filter.stage = filter.stage === s.id ? '' : s.id; syncChips(); repaint(); } }
      });
    })));
    function syncChips() {
      var chips = stageChips.querySelectorAll('.chip');
      for (var i = 0; i < chips.length; i++) {
        var sid = chips[i].dataset.stage;
        if (!sid) chips[i].classList.toggle('on', !filter.stage);
        else chips[i].classList.toggle('on', filter.stage === sid);
      }
    }

    var statusSel = ui.el('select', {
      class: 'input', style: 'width:132px',
      on: { change: function () { filter.status = statusSel.value; repaint(); } }
    }, [
      ui.el('option', { value: '', text: '全部状态' }),
      ui.el('option', { value: 'active', text: '进行中' }),
      ui.el('option', { value: 'paused', text: '已暂停' }),
      ui.el('option', { value: 'done', text: '已交付' }),
      ui.el('option', { value: 'archived', text: '已归档' })
    ]);
    if (filter.status) statusSel.value = filter.status;

    var search = ui.el('input', {
      class: 'input search', type: 'search', placeholder: '搜索项目名 / 编号 / 标签…',
      on: { input: util.debounce(function (e) { filter.q = e.target.value.trim(); repaint(); }, 160) }
    });

    toolbar = ui.el('div', { class: 'toolbar' }, [
      stageChips, statusSel, search, ui.el('span', { class: 'spacer' }),
      ui.el('button', {
        class: 'btn btn-primary', text: '＋ 新建项目',
        on: {
          click: function () {
            PLM.crud.openForm('project', null, {
              preset: { stageId: filter.stage || 'init', status: 'active', priority: 'P2' },
              onSaved: repaint
            });
          }
        }
      })
    ]);

    listWrap = ui.el('div', {});
    root.appendChild(toolbar);
    root.appendChild(ui.el('div', { class: 'mt' }, [ui.section('项目清单（点击行查看生命周期详情）', [listWrap], null)]));
    repaint();

    var unsub = store.subscribe(function () { repaint(); });
    root.addEventListener('plm:dispose', unsub);
  }

  global.PLM.projectDetail = { open: openDetail };

  PLM.registry.addView({
    id: 'projects', title: '项目台账', icon: '▣', order: 20,
    desc: '按生命周期阶段管理项目，查看健康度诊断',
    render: view
  });
})(typeof window !== 'undefined' ? window : globalThis);
