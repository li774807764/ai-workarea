/* reports.js —— 报告中心：周报 / 单项目摘要 / 预警清单 / 数据导出 */
(function (global) {
  'use strict';

  var PLM = global.PLM;
  var ui = PLM.ui, util = PLM.util, schema = PLM.schema, store = PLM.store;

  /* ---------- 极简 Markdown → DOM（只覆盖报告用到的语法） ---------- */
  function mdToDom(md) {
    var wrap = ui.el('div', { class: 'md' });
    var lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
    var i = 0;
    var listStack = null;

    function closeList() {
      if (listStack) { wrap.appendChild(listStack); listStack = null; }
    }

    function inline(text, tag) {
      var node = ui.el(tag || 'span');
      var re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
      var last = 0, m;
      while ((m = re.exec(text))) {
        if (m.index > last) node.appendChild(document.createTextNode(text.slice(last, m.index)));
        var tok = m[0];
        if (tok.slice(0, 2) === '**') node.appendChild(ui.el('b', { text: tok.slice(2, -2) }));
        else node.appendChild(ui.el('code', { text: tok.slice(1, -1) }));
        last = m.index + tok.length;
      }
      if (last < text.length) node.appendChild(document.createTextNode(text.slice(last)));
      return node;
    }

    while (i < lines.length) {
      var line = lines[i];

      if (/^\s*$/.test(line)) { closeList(); i++; continue; }

      var h = /^(#{1,4})\s+(.*)$/.exec(line);
      if (h) {
        closeList();
        var lv = h[1].length;
        wrap.appendChild(inline(h[2], 'h' + Math.min(lv + 1, 5)));
        i++;
        continue;
      }

      if (/^\s*([-*_])\s*\1\s*\1[\s-*_]*$/.test(line)) {
        closeList();
        wrap.appendChild(ui.el('hr'));
        i++;
        continue;
      }

      if (/^\s*\|/.test(line)) {
        closeList();
        var head = line.split('|').slice(1, -1).map(function (s) { return s.trim(); });
        var rows = [];
        i++;
        if (i < lines.length && /^\s*\|[\s:|-]+\|?\s*$/.test(lines[i])) i++;
        while (i < lines.length && /^\s*\|/.test(lines[i])) {
          rows.push(lines[i].split('|').slice(1, -1).map(function (s) { return s.trim(); }));
          i++;
        }
        var table = ui.el('table', { class: 'tbl md-table' }, [
          ui.el('thead', {}, [ui.el('tr', {}, head.map(function (c) { return ui.el('th', { text: c }); }))]),
          ui.el('tbody', {}, rows.map(function (r) {
            return ui.el('tr', {}, r.map(function (c) { return ui.el('td', {}, [inline(c)]); }));
          }))
        ]);
        wrap.appendChild(ui.el('div', { class: 'table-wrap' }, [table]));
        continue;
      }

      var ul = /^\s*[-*]\s+(.*)$/.exec(line);
      var ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
      if (ul || ol) {
        var tag = ul ? 'ul' : 'ol';
        if (!listStack || listStack.tagName.toLowerCase() !== tag) {
          closeList();
          listStack = ui.el(tag);
        }
        listStack.appendChild(ui.el('li', {}, [inline((ul || ol)[1])]));
        i++;
        continue;
      }

      var q = /^\s*>\s?(.*)$/.exec(line);
      if (q) {
        closeList();
        wrap.appendChild(ui.el('blockquote', {}, [inline(q[1])]));
        i++;
        continue;
      }

      closeList();
      wrap.appendChild(inline(line, 'p'));
      i++;
    }
    closeList();
    return wrap;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { ui.toast('已复制到剪贴板', 'ok'); },
        function () { ui.toast('复制失败，请手动选择', 'err'); });
    } else {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); ui.toast('已复制', 'ok'); } catch (e) { ui.toast('复制失败', 'err'); }
      ta.remove();
    }
  }

  /* ---------- 导出定义 ---------- */
  var EXPORTS = [
    {
      key: 'projects', label: '项目清单', rows: function (s) { return s.projects; },
      columns: [
        { key: 'code', label: '编号' }, { key: 'name', label: '项目名' },
        { key: 'stageId', label: '阶段', map: function (v) { return (schema.stage[v] || {}).name || v; } },
        { key: 'status', label: '状态' }, { key: 'priority', label: '优先级' },
        { key: 'owner', label: '负责人', map: function (v) { return store.nameOf('member', v) || ''; } },
        { key: 'startDate', label: '开始' }, { key: 'dueDate', label: '计划完成' },
        { key: 'progress', label: '进度%', get: function (row) { return store.derive(row).progress; } },
        { key: 'health', label: '健康度', get: function (row) { return store.derive(row).health.score; } }
      ]
    },
    {
      key: 'tasks', label: '任务清单', rows: function (s) { return s.tasks; },
      columns: [
        { key: 'title', label: '任务' },
        { key: 'projectId', label: '项目', map: function (v) { return store.nameOf('project', v) || ''; } },
        { key: 'status', label: '状态' }, { key: 'priority', label: '优先级' },
        { key: 'assignee', label: '负责人', map: function (v) { return store.nameOf('member', v) || ''; } },
        { key: 'dueDate', label: '截止' }, { key: 'estimate', label: '工时(h)' },
        { key: 'progress', label: '进度%' }
      ]
    },
    {
      key: 'risks', label: '风险台账', rows: function (s) { return s.risks; },
      columns: [
        { key: 'title', label: '风险' },
        { key: 'projectId', label: '项目', map: function (v) { return store.nameOf('project', v) || ''; } },
        { key: 'category', label: '类别' }, { key: 'probability', label: '概率' },
        { key: 'impact', label: '影响' },
        { key: 'score', label: '分值', get: function (r) { return (+r.probability || 0) * (+r.impact || 0); } },
        { key: 'status', label: '状态' },
        { key: 'owner', label: '责任人', map: function (v) { return store.nameOf('member', v) || ''; } },
        { key: 'mitigation', label: '缓解措施' }
      ]
    },
    {
      key: 'changes', label: '变更台账', rows: function (s) { return s.changes; },
      columns: [
        { key: 'title', label: '变更' },
        { key: 'projectId', label: '项目', map: function (v) { return store.nameOf('project', v) || ''; } },
        { key: 'type', label: '类型' }, { key: 'impact', label: '影响' },
        { key: 'extraHours', label: '增补工时' }, { key: 'status', label: '决策' }
      ]
    },
    {
      key: 'alerts', label: '预警清单', rows: function () { return PLM.app.alerts(); },
      columns: [
        { key: 'level', label: '级别', map: function (v) { return v === 'high' ? '高' : v === 'mid' ? '中' : '低'; } },
        { key: 'projectId', label: '项目', map: function (v) { return store.nameOf('project', v) || ''; } },
        { key: 'title', label: '预警' }, { key: 'detail', label: '详情' },
        { key: 'suggestion', label: '建议' }
      ]
    }
  ];

  function view(root, params) {
    params = params || {};
    var tab = params.tab || 'weekly';
    var range = { since: util.addDays(util.today(), -7), until: util.today() };
    var projForSummary = (store.state.projects[0] || {}).id;

    var tabs = ui.el('div', { class: 'tabs' });
    var body = ui.el('div', { class: 'tab-body' });

    var TABS = [
      { id: 'weekly', label: '周报' },
      { id: 'summary', label: '项目摘要' },
      { id: 'alerts', label: '预警清单' },
      { id: 'export', label: '数据导出' }
    ];

    function paintTabs() {
      tabs.innerHTML = '';
      TABS.forEach(function (t) {
        tabs.appendChild(ui.el('button', {
          class: 'tab' + (tab === t.id ? ' on' : ''), text: t.label,
          on: { click: function () { tab = t.id; paint(); } }
        }));
      });
    }

    function mdPanel(md, filename) {
      var panel = ui.el('div', { class: 'panel' }, [
        ui.el('div', { class: 'panel-head' }, [
          ui.el('b', { text: filename }),
          ui.el('span', { class: 'spacer' }),
          ui.el('button', { class: 'btn btn-xs btn-ghost', text: '复制 Markdown', on: { click: function () { copyText(md); } } }),
          ui.el('button', {
            class: 'btn btn-xs btn-ghost', text: '下载 .md',
            on: { click: function () { util.download(filename, md, 'text/markdown;charset=utf-8'); } }
          })
        ]),
        ui.el('div', { class: 'panel-body md-body' }, [mdToDom(md)])
      ]);
      return panel;
    }

    function paintBody() {
      body.innerHTML = '';
      var st = store.state;

      if (tab === 'weekly') {
        if (!global.PLM_REPORT) {
          body.appendChild(ui.el('div', { class: 'uml-error' }, [ui.el('b', { text: '报告模块未加载' }), ui.el('p', { text: '请检查 js/engine/report.js 是否引入。' })]));
          return;
        }
        var sinceInput = ui.el('input', {
          class: 'input', type: 'date', value: range.since,
          on: { change: function (e) { range.since = e.target.value; paintBody(); } }
        });
        var untilInput = ui.el('input', {
          class: 'input', type: 'date', value: range.until,
          on: { change: function (e) { range.until = e.target.value; paintBody(); } }
        });
        var md;
        try {
          md = global.PLM_REPORT.weekly(st, { since: range.since, until: range.until });
        } catch (err) {
          md = '# 周报生成失败\n\n' + (err && err.message ? err.message : String(err));
        }
        body.appendChild(ui.el('div', { class: 'toolbar' }, [
          ui.el('span', { class: 'muted', text: '统计区间' }),
          sinceInput, ui.el('span', { class: 'muted', text: '→' }), untilInput,
          ui.el('span', { class: 'spacer' }),
          ui.el('button', { class: 'btn btn-xs', text: '最近 7 天', on: { click: function () { range = { since: util.addDays(util.today(), -7), until: util.today() }; paintBody(); } } }),
          ui.el('button', { class: 'btn btn-xs', text: '最近 30 天', on: { click: function () { range = { since: util.addDays(util.today(), -30), until: util.today() }; paintBody(); } } })
        ]));
        body.appendChild(mdPanel(md, '项目周报-' + range.since + '_' + range.until + '.md'));
        return;
      }

      if (tab === 'summary') {
        if (!global.PLM_REPORT) { body.appendChild(ui.el('p', { class: 'muted', text: '报告模块未加载' })); return; }
        var sel = ui.el('select', {
          class: 'input', style: 'width:320px',
          on: { change: function (e) { projForSummary = e.target.value; paintBody(); } }
        }, store.state.projects.map(function (p) {
          return ui.el('option', { value: p.id, text: p.code + ' · ' + p.name, selected: p.id === projForSummary ? 'selected' : null });
        }));
        var md2;
        try {
          md2 = global.PLM_REPORT.projectSummary(st, projForSummary);
        } catch (err) {
          md2 = '# 摘要生成失败\n\n' + (err && err.message ? err.message : String(err));
        }
        body.appendChild(ui.el('div', { class: 'toolbar' }, [ui.el('span', { class: 'muted', text: '选择项目' }), sel]));
        var nm = (util.byId(st.projects, projForSummary) || {}).code || 'project';
        body.appendChild(mdPanel(md2, nm + '-摘要.md'));
        return;
      }

      if (tab === 'alerts') {
        var alerts = PLM.app.alerts();
        var lv = { high: '高', mid: '中', low: '低' };
        var group = { high: [], mid: [], low: [] };
        alerts.forEach(function (a) { (group[a.level] || group.low).push(a); });

        var panel = ui.el('div', { class: 'panel' }, [
          ui.el('div', { class: 'panel-head' }, [
            ui.el('b', { text: '预警清单（' + alerts.length + '）' }),
            ui.el('span', { class: 'spacer' }),
            ui.el('span', { class: 'muted', style: 'font-size:11.5px', text: '高 ' + group.high.length + ' · 中 ' + group.mid.length + ' · 低 ' + group.low.length }),
            ui.el('button', {
              class: 'btn btn-xs btn-ghost', text: '导出 CSV',
              on: {
                click: function () {
                  var def = EXPORTS[4];
                  var csv = global.PLM_REPORT
                    ? global.PLM_REPORT.toCSV(alerts, def.columns)
                    : fallbackCSV(alerts, def.columns);
                  util.download('预警清单-' + util.today() + '.csv', csv, 'text/csv;charset=utf-8');
                  ui.toast('已导出 CSV', 'ok');
                }
              }
            })
          ]),
          ui.el('div', { class: 'panel-body flush' }, [
            alerts.length ? ui.el('div', { class: 'alert-list pad' }, alerts.map(function (a) {
              var p = util.byId(store.state.projects, a.projectId);
              return ui.el('div', {
                class: 'alert-item lv-' + a.level,
                on: { click: function () { if (p) PLM.app.openProject(p.id); } }
              }, [
                ui.el('div', { class: 'alert-main' }, [
                  ui.el('div', { class: 'alert-title' }, [
                    ui.el('span', { class: 'badge ' + (a.level === 'high' ? 'badge-err' : a.level === 'mid' ? 'badge-warn' : 'badge'), text: lv[a.level] || a.level }),
                    document.createTextNode(' ' + a.title),
                    p ? ui.el('span', { class: 'muted', style: 'margin-left:6px;font-size:11.5px', text: '· ' + p.name }) : null
                  ]),
                  ui.el('div', { class: 'alert-detail', text: a.detail }),
                  a.suggestion ? ui.el('div', { class: 'alert-sug', text: '→ ' + a.suggestion }) : null
                ])
              ]);
            })) : ui.empty('当前没有预警')
          ])
        ]);
        body.appendChild(panel);
        return;
      }

      /* 数据导出 */
      var cards = ui.el('div', { class: 'grid grid-2' }, EXPORTS.map(function (def) {
        var rows = def.rows(st);
        return ui.el('div', { class: 'panel' }, [
          ui.el('div', { class: 'panel-head' }, [ui.el('b', { text: def.label }), ui.el('span', { class: 'spacer' }), ui.el('span', { class: 'muted', text: rows.length + ' 行' })]),
          ui.el('div', { class: 'panel-body' }, [
            ui.el('div', { class: 'chips' }, def.columns.slice(0, 6).map(function (c) { return ui.el('span', { class: 'chip', text: c.label }); })),
            ui.el('div', { class: 'toolbar', style: 'margin-top:10px' }, [
              ui.el('button', {
                class: 'btn btn-sm', text: '导出 CSV',
                on: {
                  click: function () {
                    var csv = global.PLM_REPORT ? global.PLM_REPORT.toCSV(rows, def.columns) : fallbackCSV(rows, def.columns);
                    util.download(def.label + '-' + util.today() + '.csv', csv, 'text/csv;charset=utf-8');
                    ui.toast('已导出 ' + def.label, 'ok');
                  }
                }
              }),
              ui.el('button', {
                class: 'btn btn-sm btn-ghost', text: '导出 Markdown 表',
                on: {
                  click: function () {
                    var md = global.PLM_REPORT ? global.PLM_REPORT.toMarkdownTable(rows, def.columns)
                      : '# ' + def.label + '\n\n（报告模块未加载）';
                    util.download(def.label + '-' + util.today() + '.md', md, 'text/markdown;charset=utf-8');
                    ui.toast('已导出 Markdown', 'ok');
                  }
                }
              })
            ])
          ])
        ]);
      }));
      body.appendChild(ui.el('div', { class: 'panel', style: 'margin-bottom:14px' }, [
        ui.el('div', { class: 'panel-head' }, [ui.el('b', { text: '整份数据' })]),
        ui.el('div', { class: 'panel-body' }, [
          ui.el('p', { class: 'muted', style: 'margin:0 0 10px;font-size:12.5px', text: '完整状态（含项目、任务、风险、变更、里程碑、交付物、成员、UML 图与操作日志）可导出为 JSON，用于备份或迁移到另一台机器。' }),
          ui.el('div', { class: 'toolbar' }, [
            ui.el('button', { class: 'btn btn-primary btn-sm', text: '导出 JSON 备份', on: { click: function () { PLM.app.exportJSON(); } } }),
            ui.el('button', { class: 'btn btn-sm', text: '导入 JSON', on: { click: function () { PLM.app.importJSON(); } } })
          ])
        ])
      ]));
      body.appendChild(cards);
    }

    function fallbackCSV(rows, columns) {
      var esc = function (v) {
        var s = v == null ? '' : String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      var head = columns.map(function (c) { return esc(c.label); }).join(',');
      var lines = rows.map(function (r) {
        return columns.map(function (c) {
          var v = c.get ? c.get(r) : r[c.key];
          if (c.map) v = c.map(v, r);
          return esc(v);
        }).join(',');
      });
      return '\uFEFF' + [head].concat(lines).join('\n');
    }

    function paint() {
      paintTabs();
      paintBody();
    }

    root.appendChild(tabs);
    root.appendChild(body);
    paint();

    var unsub = store.subscribe(function () { paintBody(); });
    root.addEventListener('plm:dispose', unsub);
  }

  PLM.registry.addView({
    id: 'reports', title: '报告中心', icon: '▦', order: 60,
    desc: '周报、项目摘要、预警清单与 CSV 导出',
    render: view
  });
})(typeof window !== 'undefined' ? window : globalThis);
