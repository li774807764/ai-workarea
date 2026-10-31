/* dashboard.js —— 总览：项目健康、阶段漏斗、预警处置 */
(function (global) {
  'use strict';

  var PLM = global.PLM;
  var ui = PLM.ui, util = PLM.util, schema = PLM.schema, store = PLM.store;

  function statCard(label, value, foot, kind, iconChar) {
    return ui.el('div', { class: 'stat ' + (kind || '') }, [
      ui.el('div', { class: 'stat-label' }, [ui.el('span', { text: iconChar || '·' }), document.createTextNode(label)]),
      ui.el('div', { class: 'stat-value' }, [document.createTextNode(String(value))]),
      ui.el('div', { class: 'stat-foot', text: foot || '' })
    ]);
  }

  function render(root) {
    var st = store.state;
    var alerts = PLM.app.alerts();
    var projects = st.projects;
    var active = projects.filter(function (p) { return p.status === 'active'; });
    var derived = projects.map(function (p) { return { p: p, d: store.derive(p) }; });
    var avgHealth = derived.filter(function (x) { return x.p.status === 'active'; })
      .reduce(function (acc, x, _, arr) { return acc + x.d.health.score / (arr.length || 1); }, 0);

    var overdueTasks = st.tasks.filter(function (t) {
      return t.status !== 'done' && t.dueDate && t.dueDate < util.today();
    });
    var highAlerts = alerts.filter(function (a) { return a.level === 'high'; });
    var pendingChanges = st.changes.filter(function (c) { return c.status === 'proposed'; });
    var openHighRisks = st.risks.filter(function (r) {
      return r.status !== 'closed' && (+r.probability || 1) * (+r.impact || 1) >= 15;
    });

    root.appendChild(ui.el('div', { class: 'grid grid-5' }, [
      statCard('在管项目', active.length, '共 ' + projects.length + ' 个（含归档）', 'accent', '◧'),
      statCard('预警待处置', alerts.length, '其中高优 ' + highAlerts.length + ' 条', highAlerts.length ? 'err' : 'ok', '⚠'),
      statCard('逾期任务', overdueTasks.length, '今日 ' + util.fmtDate(util.today()), overdueTasks.length ? 'warn' : 'ok', '☑'),
      statCard('待决策变更', pendingChanges.length, '影响范围需评估', pendingChanges.length ? 'warn' : 'ok', '⇄'),
      statCard('平均健康度', Math.round(avgHealth || 0), '在管项目加权（0-100）',
        avgHealth >= 80 ? 'ok' : avgHealth >= 60 ? 'warn' : 'err', '◍')
    ]));

    /* ---- 阶段漏斗 + 风险矩阵 ---- */
    var funnel = ui.el('div', { class: 'funnel' }, schema.stages.map(function (s) {
      var list = projects.filter(function (p) { return p.stageId === s.id; });
      var max = Math.max.apply(null, schema.stages.map(function (x) {
        return projects.filter(function (p) { return p.stageId === x.id; }).length;
      }).concat([1]));
      return ui.el('div', {
        class: 'funnel-step', title: s.desc,
        on: {
          click: function () {
            PLM.app.go('projects', { stage: s.id });
          }
        }
      }, [
        ui.el('div', { class: 'fn-name', text: s.name }),
        ui.el('div', { class: 'fn-val', text: String(list.length) }),
        ui.el('div', { class: 'fn-bar' }, [ui.el('i', { style: 'width:' + Math.round((list.length / max) * 100) + '%;background:' + s.color })])
      ]);
    }));

    var stagePanel = ui.section('生命周期分布（点击进入阶段筛选）', [funnel], null);
    stagePanel.classList.add('grid');

    var matrix = ui.el('div', { class: 'matrix' });
    for (var imp = 5; imp >= 1; imp--) {
      for (var prob = 1; prob <= 5; prob++) {
        (function (p2, i2) {
          var score = p2 * i2;
          var n = st.risks.filter(function (r) {
            return r.status !== 'closed' && +r.probability === p2 && +r.impact === i2;
          }).length;
          var lv = score >= 15 ? 'high' : score >= 8 ? 'mid' : 'low';
          matrix.appendChild(ui.el('div', {
            class: 'matrix-cell lv-' + lv,
            title: '可能性 ' + p2 + ' × 影响 ' + i2 + ' = ' + score,
            on: { click: function () { PLM.app.go('risks'); } }
          }, [
            document.createTextNode(n ? String(n) : ''),
            n ? ui.el('span', { class: 'mc-n', text: score + '' }) : null
          ]));
        })(prob, imp);
      }
    }
    var matrixPanel = ui.section('风险暴露矩阵（未关闭）', [
      matrix,
      ui.el('div', { class: 'matrix-axis' }, [
        ui.el('span', { text: '← 可能性 1' }),
        ui.el('span', { text: '5 影响 ↓' })
      ]),
      ui.el('p', { class: 'muted', style: 'font-size:11.5px;margin:10px 0 0', text: '高风险（≥15）' + openHighRisks.length + ' 项，建议本周内出缓解方案。' })
    ]);

    root.appendChild(ui.el('div', { class: 'grid grid-2 mt' }, [stagePanel, matrixPanel]));

    /* ---- 预警 + 健康度 ---- */
    var alertList = ui.el('div', { class: 'alert-list' });
    if (!alerts.length) {
      alertList.appendChild(ui.empty('当前没有需要处置的预警', null, null));
    } else {
      alerts.slice(0, 7).forEach(function (a) {
        var proj = util.byId(projects, a.projectId);
        alertList.appendChild(ui.el('div', {
          class: 'alert-item lv-' + a.level,
          on: { click: function () { if (proj) PLM.app.openProject(proj.id); } }
        }, [
          ui.el('div', { class: 'alert-main' }, [
            ui.el('div', { class: 'alert-title' }, [
              document.createTextNode(a.title),
              proj ? ui.el('span', { class: 'muted', style: 'margin-left:6px;font-weight:400;font-size:11.5px', text: '· ' + proj.name }) : null
            ]),
            ui.el('div', { class: 'alert-detail', text: a.detail }),
            a.suggestion ? ui.el('div', { class: 'alert-sug', text: '→ ' + a.suggestion }) : null
          ])
        ]));
      });
    }
    var alertPanel = ui.section('智能预警（' + alerts.length + '）',
      [alertList],
      ui.el('button', { class: 'btn btn-ghost btn-sm right', text: '查看全部 ›', on: { click: function () { PLM.app.go('reports', { tab: 'alerts' }); } } })
    );

    var healthRows = ui.el('div', { class: 'health-list' });
    derived.filter(function (x) { return x.p.status === 'active'; })
      .sort(function (a, b) { return a.d.health.score - b.d.health.score; })
      .slice(0, 8)
      .forEach(function (x) {
        var h = x.d.health;
        healthRows.appendChild(ui.el('div', {
          class: 'health-row',
          on: { click: function () { PLM.app.openProject(x.p.id); } },
          style: 'cursor:pointer'
        }, [
          ui.el('div', { class: 'hn' }, [
            ui.el('span', { class: 'badge', style: 'color:' + x.d.stage.color + ';border-color:' + x.d.stage.color + '55', text: x.d.stage.name }),
            ui.el('span', { class: 'nowrap', text: x.p.name, title: h.reasons.join('；') })
          ]),
          ui.progressBar(h.score, h.level === 'ok' ? 'ok' : h.level === 'watch' ? 'warn' : 'err', false),
          ui.el('span', { class: 'health-score', text: h.score + '' })
        ]));
      });
    var healthPanel = ui.section('在管项目健康度（点击查看）', [healthRows]);

    root.appendChild(ui.el('div', { class: 'grid grid-2 mt' }, [alertPanel, healthPanel]));

    /* ---- 最近动态 ---- */
    var logs = st.logs.slice(-8).reverse();
    var tl = ui.el('div', { class: 'timeline' });
    if (!logs.length) tl.appendChild(ui.el('p', { class: 'muted', text: '暂无操作记录' }));
    logs.forEach(function (l) {
      tl.appendChild(ui.el('div', { class: 'tl-item' }, [
        ui.el('div', { text: l.action }),
        ui.el('div', { class: 'tl-time', text: (l.at || '').replace('T', ' ').slice(0, 16) + ' · ' + l.entity })
      ]));
    });
    root.appendChild(ui.el('div', { class: 'mt' }, [ui.section('最近动态', [tl])]));
  }

  PLM.registry.addView({
    id: 'dashboard', title: '总览', icon: '◱', order: 10,
    desc: '项目健康度、生命周期分布与预警处置',
    render: function (root) { render(root); }
  });
})(typeof window !== 'undefined' ? window : globalThis);
