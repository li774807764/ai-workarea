/* risks.js —— 风险与变更：暴露矩阵、风险台账、变更决策 */
(function (global) {
  'use strict';

  var PLM = global.PLM;
  var ui = PLM.ui, util = PLM.util, schema = PLM.schema, store = PLM.store;

  function scoreOf(r) { return (+r.probability || 1) * (+r.impact || 1); }
  function levelOf(r) { var s = scoreOf(r); return s >= 15 ? 'high' : s >= 8 ? 'mid' : 'low'; }
  function levelBadge(r) {
    var lv = levelOf(r);
    return ui.badge(lv === 'high' ? '高' : lv === 'mid' ? '中' : '低', lv === 'high' ? 'err' : lv === 'mid' ? 'warn' : 'ok');
  }

  function view(root) {
    var onlyOpen = true;
    var cellFilter = null; /* {prob, impact} */
    var riskWrap = ui.el('div', {});

    function paint() {
      root.innerHTML = '';
      var state = store.state;
      var risks = state.risks.filter(function (r) { return !onlyOpen || r.status !== 'closed'; });
      var high = risks.filter(function (r) { return levelOf(r) === 'high'; });
      var pending = state.changes.filter(function (c) { return c.status === 'proposed'; });

      /* 指标 */
      root.appendChild(ui.el('div', { class: 'grid grid-4' }, [
        ui.el('div', { class: 'stat err' }, [
          ui.el('div', { class: 'stat-label', text: '高风险未缓解' }),
          ui.el('div', { class: 'stat-value', text: String(high.length) }),
          ui.el('div', { class: 'stat-foot', text: '概率 × 影响 ≥ 15' })
        ]),
        ui.el('div', { class: 'stat warn' }, [
          ui.el('div', { class: 'stat-label', text: '未关闭风险' }),
          ui.el('div', { class: 'stat-value', text: String(risks.length) }),
          ui.el('div', { class: 'stat-foot', text: '全部登记 ' + state.risks.length + ' 条' })
        ]),
        ui.el('div', { class: 'stat accent' }, [
          ui.el('div', { class: 'stat-label', text: '待决策变更' }),
          ui.el('div', { class: 'stat-value', text: String(pending.length) }),
          ui.el('div', { class: 'stat-foot', text: '需在评审会拍板' })
        ]),
        ui.el('div', { class: 'stat' }, [
          ui.el('div', { class: 'stat-label', text: '风险敞口' }),
          ui.el('div', { class: 'stat-value', text: String(risks.reduce(function (a, r) { return a + scoreOf(r); }, 0)) }),
          ui.el('div', { class: 'stat-foot', text: 'Σ(概率×影响)，越低越好' })
        ])
      ]));

      /* 矩阵 */
      var matrix = ui.el('div', { class: 'matrix big' });
      for (var imp = 5; imp >= 1; imp--) {
        for (var prob = 1; prob <= 5; prob++) {
          (function (p2, i2) {
            var score = p2 * i2;
            var lv = score >= 15 ? 'high' : score >= 8 ? 'mid' : 'low';
            var here = risks.filter(function (r) { return +r.probability === p2 && +r.impact === i2; });
            var active = cellFilter && cellFilter.prob === p2 && cellFilter.impact === i2;
            var cell = ui.el('div', {
              class: 'matrix-cell lv-' + lv + (active ? ' active' : ''),
              title: '可能性 ' + p2 + ' × 影响 ' + i2 + ' = ' + score + (here.length ? '\n' + here.map(function (r) { return '· ' + r.title; }).join('\n') : '\n（空）'),
              on: {
                click: function () {
                  cellFilter = active ? null : { prob: p2, impact: i2 };
                  paint();
                }
              }
            }, [
              ui.el('span', { class: 'mc-n', text: String(score) }),
              ui.el('span', { class: 'mc-c', text: here.length ? String(here.length) : '·' })
            ]);
            matrix.appendChild(cell);
          })(prob, imp);
        }
      }
      var matrixPanel = ui.el('div', { class: 'panel' }, [
        ui.el('div', { class: 'panel-head' }, [
          ui.el('b', { text: '风险暴露矩阵' }),
          ui.el('span', { class: 'spacer' }),
          ui.el('span', { class: 'muted', style: 'font-size:11.5px', text: '纵轴 影响 5→1，横轴 可能性 1→5，点格子筛选' })
        ]),
        ui.el('div', { class: 'panel-body' }, [
          matrix,
          ui.el('div', { class: 'legend' }, [
            ui.el('span', { class: 'lg lg-high', text: '高 15-25' }),
            ui.el('span', { class: 'lg lg-mid', text: '中 8-14' }),
            ui.el('span', { class: 'lg lg-low', text: '低 1-7' })
          ])
        ])
      ]);

      /* 预警建议汇总 */
      var alerts = PLM.app.alerts().filter(function (a) { return a.entity === 'risk' || a.ruleId === 'risk.highUnmitigated'; });
      var sugList = ui.el('div', { class: 'alert-list' });
      if (!alerts.length) sugList.appendChild(ui.el('p', { class: 'muted', text: '暂无风险类预警。' }));
      alerts.slice(0, 6).forEach(function (a) {
        sugList.appendChild(ui.el('div', { class: 'alert-item lv-' + a.level }, [
          ui.el('div', { class: 'alert-main' }, [
            ui.el('div', { class: 'alert-title', text: a.title }),
            ui.el('div', { class: 'alert-detail', text: a.detail }),
            a.suggestion ? ui.el('div', { class: 'alert-sug', text: '→ ' + a.suggestion }) : null
          ])
        ]));
      });
      var sugPanel = ui.el('div', { class: 'panel' }, [
        ui.el('div', { class: 'panel-head' }, [ui.el('b', { text: '高风险缓解建议' })]),
        ui.el('div', { class: 'panel-body' }, [sugList])
      ]);
      root.appendChild(ui.el('div', { class: 'grid grid-2 mt' }, [matrixPanel, sugPanel]));

      /* 风险台账 */
      var filtered = risks.filter(function (r) {
        if (!cellFilter) return true;
        return +r.probability === cellFilter.prob && +r.impact === cellFilter.impact;
      });

      var riskToolbar = ui.el('div', { class: 'toolbar' }, [
        ui.el('label', { class: 'check' }, [
          ui.el('input', {
            type: 'checkbox', checked: onlyOpen ? 'checked' : null,
            on: { change: function (e) { onlyOpen = e.target.checked; paint(); } }
          }),
          document.createTextNode(' 只看未关闭')
        ]),
        cellFilter ? ui.el('span', {
          class: 'chip on', text: '筛选：' + cellFilter.prob + '×' + cellFilter.impact + ' ✕',
          on: { click: function () { cellFilter = null; paint(); } }
        }) : null,
        ui.el('span', { class: 'spacer' }),
        ui.el('button', {
          class: 'btn btn-primary btn-sm', text: '＋ 登记风险',
          on: { click: function () { PLM.crud.openForm('risk', null, { preset: { status: 'open', probability: 3, impact: 3 }, onSaved: paint }); } }
        })
      ]);

      var riskTable = PLM.crud.table({
        entityKey: 'risk',
        rows: filtered.slice().sort(function (a, b) { return scoreOf(b) - scoreOf(a); }),
        onRowClick: function (r) { PLM.crud.openForm('risk', r, { onSaved: paint }); },
        columns: [
          { key: 'title', label: '风险', width: 260 },
          { key: 'projectId', label: '项目', width: 150 },
          { key: 'category', label: '类别' },
          { key: 'probability', label: '概率', render: function (r) { return ui.el('span', { class: 'num', text: String(r.probability) }); } },
          { key: 'impact', label: '影响', render: function (r) { return ui.el('span', { class: 'num', text: String(r.impact) }); } },
          { key: 'score', label: '分值', render: function (r) { return ui.el('b', { class: 'num', text: String(scoreOf(r)) }); } },
          { key: 'level', label: '等级', render: levelBadge },
          { key: 'owner', label: '责任人' },
          { key: 'status', label: '状态' },
          { key: 'mitigation', label: '缓解措施', width: 240 }
        ],
        emptyText: cellFilter ? '这个格子里没有风险' : '还没有登记风险'
      });

      root.appendChild(ui.el('div', { class: 'mt' }, [
        ui.el('div', { class: 'panel' }, [
          ui.el('div', { class: 'panel-head' }, [ui.el('b', { text: '风险台账（' + filtered.length + '）' }), ui.el('span', { class: 'spacer' }), riskToolbar]),
          ui.el('div', { class: 'panel-body flush' }, [riskTable])
        ])
      ]));

      /* 变更 */
      var changeTable = PLM.crud.table({
        entityKey: 'change',
        rows: state.changes.slice().sort(function (a, b) {
          var order = { proposed: 0, approved: 1, rejected: 2 };
          return (order[a.status] || 0) - (order[b.status] || 0);
        }),
        onRowClick: function (c) { PLM.crud.openForm('change', c, { onSaved: paint }); },
        columns: [
          { key: 'title', label: '变更内容', width: 240 },
          { key: 'projectId', label: '项目', width: 150 },
          { key: 'type', label: '类型' },
          { key: 'impact', label: '影响评估', width: 220 },
          { key: 'extraHours', label: '增补工时' },
          { key: 'proposedBy', label: '提出人' },
          { key: 'status', label: '决策' }
        ],
        emptyText: '还没有变更申请'
      });

      root.appendChild(ui.el('div', { class: 'mt' }, [
        ui.el('div', { class: 'panel' }, [
          ui.el('div', { class: 'panel-head' }, [
            ui.el('b', { text: '变更控制（' + state.changes.length + '）' }),
            ui.el('span', { class: 'spacer' }),
            ui.el('button', {
              class: 'btn btn-sm btn-primary', text: '＋ 发起变更',
              on: { click: function () { PLM.crud.openForm('change', null, { preset: { status: 'proposed', extraHours: 0 }, onSaved: paint }); } }
            })
          ]),
          ui.el('div', { class: 'panel-body flush' }, [changeTable])
        ])
      ]));
    }

    paint();
    var unsub = store.subscribe(function () { paint(); });
    root.addEventListener('plm:dispose', unsub);
  }

  PLM.registry.addView({
    id: 'risks', title: '风险与变更', icon: '⚠', order: 50,
    desc: '风险暴露矩阵、缓解建议、变更评审',
    render: view
  });
})(typeof window !== 'undefined' ? window : globalThis);
