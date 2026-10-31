/* settings.js —— 设置：外观 / 阈值 / 阶段模型 / 规则清单 / 数据管理 / 扩展指南 */
(function (global) {
  'use strict';

  var PLM = global.PLM;
  var ui = PLM.ui, util = PLM.util, schema = PLM.schema, store = PLM.store;

  var CONFIG_FIELDS = [
    { key: 'wipLimit', label: '并行任务上限（每人进行中）', min: 1, max: 20, step: 1, unit: '个', hint: '超过后看板标红、引擎报 wip.overLimit' },
    { key: 'stallDays', label: '阶段停滞判定', min: 1, max: 90, step: 1, unit: '天', hint: '超过该天数无动作 → stage.stall' },
    { key: 'warnDaysBeforeDue', label: '到期提前预警', min: 0, max: 60, step: 1, unit: '天', hint: '任务/里程碑临近到期即提醒' },
    { key: 'changePendingDays', label: '变更悬置上限', min: 1, max: 60, step: 1, unit: '天', hint: '超过该天数未决策 → change.pending' },
    { key: 'milestoneSoonDays', label: '里程碑逼近窗口', min: 1, max: 60, step: 1, unit: '天', hint: '窗口内未达阈值完成率即预警' },
    { key: 'milestoneMinProgress', label: '里程碑最低完成率', min: 0, max: 100, step: 5, unit: '%', hint: '低于该完成率且逼近窗口 → 预警' },
    { key: 'workHoursPerDay', label: '人均日工时', min: 1, max: 24, step: 0.5, unit: '小时', hint: '用于工期折算' }
  ];

  function row(label, control, hint) {
    return ui.el('div', { class: 'setting-row' }, [
      ui.el('div', { class: 'setting-label' }, [
        ui.el('b', { text: label }),
        hint ? ui.el('div', { class: 'setting-hint', text: hint }) : null
      ]),
      ui.el('div', { class: 'setting-control' }, [control])
    ]);
  }

  function view(root) {
    function paint() {
      root.innerHTML = '';
      var st = store.state;
      var cfg = st.config || {};

      /* ---------- 外观 ---------- */
      var themes = [
        { id: 'dark', label: '深海控制室（深色）' },
        { id: 'light', label: '纸面台账（浅色）' }
      ];
      var themeGroup = ui.el('div', { class: 'chips' }, themes.map(function (t) {
        return ui.el('span', {
          class: 'chip' + ((st.meta.theme || 'dark') === t.id ? ' on' : ''),
          text: t.label,
          on: {
            click: function () {
              store.commit('切换主题：' + t.label, function (draft) { draft.meta.theme = t.id; }, { entity: '设置' });
              paint();
            }
          }
        });
      }));

      root.appendChild(ui.el('div', { class: 'panel' }, [
        ui.el('div', { class: 'panel-head' }, [ui.el('b', { text: '外观' })]),
        ui.el('div', { class: 'panel-body' }, [
          row('界面主题', themeGroup, '主题写进本地数据，下次打开仍是同一个'),
          row('动画与图表', ui.el('span', { class: 'muted', text: '全部由 CSS 变量驱动，无脚本动画依赖' }), null)
        ])
      ]));

      /* ---------- 阈值 ---------- */
      var inputs = {};
      var grid = ui.el('div', {});
      CONFIG_FIELDS.forEach(function (f) {
        var input = ui.el('input', {
          class: 'input', type: 'number', style: 'width:110px',
          min: f.min, max: f.max, step: f.step,
          value: String(cfg[f.key] == null ? '' : cfg[f.key])
        });
        inputs[f.key] = input;
        grid.appendChild(row(f.label, ui.el('span', { class: 'inline-input' }, [input, ui.el('span', { class: 'unit', text: f.unit })]), f.hint));
      });
      grid.appendChild(ui.el('div', { class: 'setting-row' }, [
        ui.el('div', { class: 'setting-label' }, [ui.el('b', { text: '保存' })]),
        ui.el('div', { class: 'setting-control' }, [
          ui.el('button', {
            class: 'btn btn-primary btn-sm', text: '应用阈值',
            on: {
              click: function () {
                var patch = {};
                var bad = null;
                CONFIG_FIELDS.forEach(function (f) {
                  var raw = inputs[f.key].value;
                  var v = Number(raw);
                  if (raw === '' || !isFinite(v) || v < f.min || v > f.max) { bad = bad || f.label; return; }
                  patch[f.key] = v;
                });
                if (bad) { ui.toast('「' + bad + '」数值不合法', 'err'); return; }
                store.commit('调整预警阈值', function (draft) { Object.assign(draft.config, patch); }, { entity: '设置' });
                ui.toast('阈值已生效，预警按新标准重算', 'ok');
                paint();
              }
            }
          }),
          ui.el('button', {
            class: 'btn btn-sm btn-ghost', text: '恢复默认',
            on: {
              click: function () {
                var defaults = (global.PLM_ENGINE && global.PLM_ENGINE.DEFAULTS) || {};
                store.commit('恢复默认阈值', function (draft) {
                  Object.assign(draft.config, {
                    wipLimit: defaults.wipLimit || 3,
                    stallDays: defaults.stallDays || 14,
                    warnDaysBeforeDue: defaults.warnDaysBeforeDue || 3,
                    changePendingDays: defaults.changePendingDays || 7,
                    milestoneSoonDays: defaults.milestoneSoonDays || 7,
                    milestoneMinProgress: defaults.milestoneMinProgress || 80,
                    workHoursPerDay: 8
                  });
                }, { entity: '设置' });
                ui.toast('已恢复默认', 'ok');
                paint();
              }
            }
          })
        ])
      ]));
      root.appendChild(ui.el('div', { class: 'panel mt' }, [
        ui.el('div', { class: 'panel-head' }, [ui.el('b', { text: '管理阈值与预警口径' }), ui.el('span', { class: 'spacer' }), ui.el('span', { class: 'muted', style: 'font-size:11.5px', text: '生效范围：健康度、预警、报告' })]),
        ui.el('div', { class: 'panel-body' }, [grid])
      ]));

      /* ---------- 阶段模型 ---------- */
      var stageTable = ui.el('table', { class: 'tbl' }, [
        ui.el('thead', {}, [ui.el('tr', {}, ['#', '阶段', '准入条件（门禁）', '说明'].map(function (h) { return ui.el('th', { text: h }); }))]),
        ui.el('tbody', {}, schema.stages.map(function (s, i) {
          return ui.el('tr', {}, [
            ui.el('td', { class: 'num', text: String(i + 1) }),
            ui.el('td', {}, [ui.el('span', { class: 'badge', style: 'color:' + s.color + ';border-color:' + s.color + '55', text: s.name })]),
            ui.el('td', { text: s.gate || '—' }),
            ui.el('td', { class: 'muted', text: s.desc || '' })
          ]);
        }))
      ]);

      /* ---------- 规则清单 ---------- */
      var rules = (global.PLM_ENGINE && global.PLM_ENGINE.rules) ? global.PLM_ENGINE.rules() : [];
      var ruleTable = ui.el('table', { class: 'tbl' }, [
        ui.el('thead', {}, [ui.el('tr', {}, ['规则 ID', '名称', '作用域', '级别', '说明'].map(function (h) { return ui.el('th', { text: h }); }))]),
        ui.el('tbody', {}, rules.length ? rules.map(function (r) {
          return ui.el('tr', {}, [
            ui.el('td', {}, [ui.el('code', { text: r.id })]),
            ui.el('td', { text: r.name || '—' }),
            ui.el('td', { text: r.scope || '—' }),
            ui.el('td', {}, [ui.badge(r.level === 'high' ? '高' : r.level === 'mid' ? '中' : '低', r.level === 'high' ? 'err' : r.level === 'mid' ? 'warn' : 'ok')]),
            ui.el('td', { class: 'muted', text: r.description || '' })
          ]);
        }) : [ui.el('tr', {}, [ui.el('td', { colspan: 5, class: 'muted', text: '规则引擎未加载（js/engine/rules.js）' })])])
      ]);

      root.appendChild(ui.el('div', { class: 'grid grid-2 mt' }, [
        ui.el('div', { class: 'panel' }, [
          ui.el('div', { class: 'panel-head' }, [ui.el('b', { text: '生命周期阶段模型' }), ui.el('span', { class: 'spacer' }), ui.el('span', { class: 'muted', style: 'font-size:11.5px', text: schema.stages.length + ' 个阶段' })]),
          ui.el('div', { class: 'panel-body flush' }, [ui.el('div', { class: 'table-wrap' }, [stageTable])])
        ]),
        ui.el('div', { class: 'panel' }, [
          ui.el('div', { class: 'panel-head' }, [ui.el('b', { text: '预警规则（' + rules.length + '）' }), ui.el('span', { class: 'spacer' }), ui.el('span', { class: 'muted', style: 'font-size:11.5px', text: '可注册新规则' })]),
          ui.el('div', { class: 'panel-body flush' }, [ui.el('div', { class: 'table-wrap' }, [ruleTable])])
        ])
      ]));

      /* ---------- 数据管理 ---------- */
      var bytes = 0;
      try { bytes = new Blob([JSON.stringify(st)]).size; } catch (e) { bytes = JSON.stringify(st).length; }
      root.appendChild(ui.el('div', { class: 'panel mt' }, [
        ui.el('div', { class: 'panel-head' }, [ui.el('b', { text: '数据管理' }), ui.el('span', { class: 'spacer' }), ui.el('span', { class: 'muted', style: 'font-size:11.5px', text: '当前数据约 ' + (bytes / 1024).toFixed(1) + ' KB' })]),
        ui.el('div', { class: 'panel-body' }, [
          row('导出备份', ui.el('div', { class: 'chips' }, [
            ui.el('button', { class: 'btn btn-sm btn-primary', text: '导出 JSON', on: { click: function () { PLM.app.exportJSON(); } } }),
            ui.el('button', { class: 'btn btn-sm', text: '导出 CSV 报表', on: { click: function () { PLM.app.go('reports', { tab: 'export' }); } } })
          ]), 'JSON 含全部实体与 UML 图，可直接换机器继续用'),
          row('导入 / 迁移', ui.el('div', { class: 'chips' }, [
            ui.el('button', { class: 'btn btn-sm', text: '导入 JSON 文件', on: { click: function () { PLM.app.importJSON(); } } })
          ]), '导入前会校验版本与结构，失败不会破坏现有数据'),
          row('重置为示例数据', ui.el('div', { class: 'chips' }, [
            ui.el('button', {
              class: 'btn btn-sm btn-danger', text: '恢复 12 个示例项目',
              on: {
                click: function () {
                  ui.confirm('将清空当前数据并写入示例项目，确定吗？（可撤销一次）', { danger: true, okLabel: '恢复示例' }).then(function (yes) {
                    if (yes) { PLM.app.resetSeed(); paint(); }
                  });
                }
              }
            })
          ]), '适合演示与培训'),
          row('清空所有项目数据', ui.el('div', { class: 'chips' }, [
            ui.el('button', {
              class: 'btn btn-sm btn-ghost', text: '清空（保留设置）',
              on: {
                click: function () {
                  ui.confirm('清空全部项目、任务、风险、变更、图与日志？此操作可撤销一次。', { danger: true, okLabel: '清空' }).then(function (yes) {
                    if (yes) { PLM.app.clearData(); paint(); }
                  });
                }
              }
            })
          ]), '清空后从零开始录入')
        ])
      ]));

      /* ---------- 扩展点 ---------- */
      var extendList = ui.el('div', { class: 'ext-list' }, [
        ['新增实体/字段', 'js/core/schema.js 的 entities 里加字段定义，表格、表单、校验、类图会自动跟上；ref 类型字段自动变成类图关联。'],
        ['新增生命周期阶段', 'js/core/schema.js 的 stages，或在任意模块调用 PLM.registry.addStage({id,name,gate,color}) —— 漏斗、状态机、阶段推进按钮立即生效。'],
        ['新增预警规则', 'PLM.registry.addRule({id,name,scope,level,description,test(ctx){ ... }}) 或直接 PLM_ENGINE.registerRule()，设置页会列出它。'],
        ['新增视图', 'PLM.registry.addView({id,title,icon,order,render(root,ctx)})，左侧导航自动出现，无需改 index.html。'],
        ['换存储后端', 'PLM.store.setAdapter({get,set,remove}) —— 默认 localStorage，可换 IndexedDB 或自建 HTTP API 做多人协同。'],
        ['接入外部数据', 'state 是纯 JSON：{version, projects, tasks, risks, changes, milestones, deliverables, members, diagrams, logs}，任何系统导出成这个形状即可导入。']
      ].map(function (pair) {
        return ui.el('div', { class: 'ext-item' }, [
          ui.el('b', { text: pair[0] }),
          ui.el('p', { text: pair[1] })
        ]);
      }));

      root.appendChild(ui.el('div', { class: 'panel mt' }, [
        ui.el('div', { class: 'panel-head' }, [ui.el('b', { text: '扩展点（本地可扩展）' }), ui.el('span', { class: 'spacer' }), ui.el('span', { class: 'muted', style: 'font-size:11.5px', text: '零依赖 · 零构建 · 纯前端模块' })]),
        ui.el('div', { class: 'panel-body' }, [extendList])
      ]));

      /* ---------- 关于 ---------- */
      root.appendChild(ui.el('div', { class: 'panel mt' }, [
        ui.el('div', { class: 'panel-head' }, [ui.el('b', { text: '关于' })]),
        ui.el('div', { class: 'panel-body' }, [
          ui.el('div', { class: 'kv' }, [
            ['面板版本', 'PLM 1.0.0（本地单文件零依赖）'],
            ['数据结构版本', 'state.version = ' + st.version],
            ['存储键', 'plm.panel.v1（localStorage）'],
            ['UML 引擎', global.PLM_UML ? ('PLM_UML ' + (global.PLM_UML.VERSION || '')) : '未加载'],
            ['规则引擎', global.PLM_ENGINE ? '已加载 · ' + rules.length + ' 条规则' : '未加载'],
            ['报告模块', global.PLM_REPORT ? '已加载' : '未加载'],
            ['快捷键', 'Ctrl/⌘+K 搜索 · Ctrl/⌘+Z 撤销 · Shift+Ctrl/⌘+Z 重做 · Ctrl/⌘+S 立即保存 · Ctrl/⌘+N 新建']
          ].map(function (p) {
            return ui.el('div', { class: 'kv-row' }, [ui.el('span', { class: 'kv-k', text: p[0] }), ui.el('span', { class: 'kv-v', text: p[1] })]);
          }))
        ])
      ]));
    }

    paint();
    var unsub = store.subscribe(function () { paint(); });
    root.addEventListener('plm:dispose', unsub);
  }

  PLM.registry.addView({
    id: 'settings', title: '设置与扩展', icon: '⚙', order: 90,
    desc: '主题、阈值、阶段模型、规则清单与数据管理',
    render: view
  });
})(typeof window !== 'undefined' ? window : globalThis);
