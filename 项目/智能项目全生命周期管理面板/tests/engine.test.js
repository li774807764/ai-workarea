/* engine.test.js —— 预警引擎 / 报告模块 自测（Node，无依赖）
 * 运行：node tests/engine.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const RULES = path.join(ROOT, 'js', 'engine', 'rules.js');
const REPORT = path.join(ROOT, 'js', 'engine', 'report.js');

// ---------------------------------------------------------------- 载入（假 window）

const sandbox = {};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.console = console;
vm.createContext(sandbox);
for (const f of [RULES, REPORT]) {
  if (!fs.existsSync(f)) {
    console.error('缺少文件：' + f);
    process.exit(1);
  }
  vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: f });
}
const ENGINE = sandbox.PLM_ENGINE;
const REPORTAPI = sandbox.PLM_REPORT;

// ---------------------------------------------------------------- 断言小工具

let passed = 0;
const failures = [];

function ok(name, cond, extra) {
  if (cond) {
    passed++;
    console.log('PASS ' + name);
  } else {
    failures.push(name + (extra ? ' → ' + extra : ''));
    console.log('FAIL ' + name + (extra ? ' → ' + extra : ''));
  }
}

function eq(name, actual, expected) {
  ok(name, actual === expected, '期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual));
}

function noThrow(name, fn) {
  try {
    fn();
    passed++;
    console.log('PASS ' + name);
  } catch (e) {
    failures.push(name + ' → ' + e.message);
    console.log('FAIL ' + name + ' → ' + e.message);
  }
}

// ---------------------------------------------------------------- 固定时间与状态

const TODAY = '2026-10-31';
const NOW = '2026-10-31T22:35:00+08:00';

const STAGES = [
  { id: 'init', name: '立项' },
  { id: 'plan', name: '规划' },
  { id: 'dev', name: '开发' },
  { id: 'test', name: '测试' },
  { id: 'ops', name: '上线运维' },
  { id: 'archive', name: '归档' }
];

const CONFIG = {
  stages: STAGES,
  workHoursPerDay: 6,
  warnDaysBeforeDue: 3,
  wipLimit: 6,
  stallDays: 14,
  changePendingDays: 7,
  milestoneSoonDays: 7,
  milestoneMinProgress: 80,
  overdueHighDays: 7
};

const RECENT = '2026-10-30T10:00:00+08:00';

let seq = 0;
function id(prefix) { return prefix + '_t' + (++seq); }

function proj(o) {
  return Object.assign({
    id: '', code: '', name: '', owner: '', sponsor: '', stageId: 'dev',
    priority: 'P1', startDate: '2026-09-01', dueDate: '2026-12-31', budget: 10,
    description: '', tags: [], status: 'active', createdAt: '2026-09-01T09:00:00+08:00', updatedAt: RECENT
  }, o);
}

function task(o) {
  return Object.assign({
    id: '', projectId: '', title: '', stageId: 'dev', status: 'todo',
    assignee: '', estimate: 1, dueDate: '2026-11-20', order: 1,
    createdAt: '2026-09-05T09:00:00+08:00', updatedAt: RECENT
  }, o);
}

const members = [
  { id: 'm1', name: '林岸' }, { id: 'm2', name: '周晴' }, { id: 'm3', name: '陈默' },
  { id: 'm8', name: '吴悠' }, { id: 'm10', name: '赵一' }, { id: 'm12', name: '钱多' }
];

const projects = [];
const tasks = [];
const risks = [];
const changes = [];
const milestones = [];
const deliverables = [];

function addProject(p) { projects.push(p); return p; }

// p1：逾期任务（高 + 中）
addProject(proj({ id: 'p1', code: 'PRJ-01', name: '逾期样例', owner: 'm1', stageId: 'dev' }));
tasks.push(task({ id: 't1a', projectId: 'p1', title: '接口联调', status: 'doing', assignee: 'm1', dueDate: '2026-10-10' }));
tasks.push(task({ id: 't1b', projectId: 'p1', title: '补单元测试', status: 'todo', assignee: 'm1', dueDate: '2026-10-29' }));

// p2：高风险未缓解
addProject(proj({ id: 'p2', code: 'PRJ-02', name: '高风险样例', owner: 'm2', stageId: 'dev' }));
tasks.push(task({ id: 't2a', projectId: 'p2', title: '完成原型', status: 'done', assignee: 'm2' }));
risks.push({
  id: 'r2', projectId: 'p2', title: '第三方接口不提供沙箱', category: '技术',
  probability: 5, impact: 4, mitigation: '', owner: 'm2', status: 'open',
  createdAt: '2026-10-01T09:00:00+08:00', updatedAt: RECENT
});

// p3：阶段停滞（任务 updatedAt 60 天前）
addProject(proj({ id: 'p3', code: 'PRJ-03', name: '停滞样例', owner: 'm3', stageId: 'plan' }));
tasks.push(task({
  id: 't3a', projectId: 'p3', title: '写立项材料', stageId: 'plan', status: 'todo',
  assignee: 'm3', dueDate: '2026-12-20', updatedAt: '2026-09-01T09:00:00+08:00'
}));

// p4：变更悬置（proposed 16 天）
addProject(proj({ id: 'p4', code: 'PRJ-04', name: '悬置变更样例', owner: 'm1', stageId: 'dev' }));
tasks.push(task({ id: 't4a', projectId: 'p4', title: '实现登录', status: 'todo', assignee: 'm1' }));
changes.push({
  id: 'c4', projectId: 'p4', title: '登录改为手机号验证码', reason: '客户要求', impact: '多 5 人天',
  status: 'proposed', createdAt: '2026-10-15T10:00:00+08:00', updatedAt: RECENT
});

// p5：里程碑逼近（3 天后到期，完成率 0%）
addProject(proj({ id: 'p5', code: 'PRJ-05', name: '里程碑逼近样例', owner: 'm1', stageId: 'dev' }));
tasks.push(task({ id: 't5a', projectId: 'p5', title: '数据迁移脚本', status: 'todo', assignee: 'm1' }));
tasks.push(task({ id: 't5b', projectId: 'p5', title: '迁移演练', status: 'todo', assignee: 'm1' }));
milestones.push({ id: 'ms5', projectId: 'p5', title: 'v0.9 内测', dueDate: '2026-11-03', status: 'pending' });

// p6：里程碑错过
addProject(proj({ id: 'p6', code: 'PRJ-06', name: '里程碑错过样例', owner: 'm2', stageId: 'dev' }));
tasks.push(task({ id: 't6a', projectId: 'p6', title: '灰度方案', status: 'doing', assignee: 'm2' }));
milestones.push({ id: 'ms6', projectId: 'p6', title: 'v1.0 上线', dueDate: '2026-10-20', status: 'pending' });

// p7：交付物未验收（已在 ops 阶段）
addProject(proj({ id: 'p7', code: 'PRJ-07', name: '交付物未验收样例', owner: 'm3', stageId: 'ops' }));
tasks.push(task({ id: 't7a', projectId: 'p7', title: '上线检查单', stageId: 'ops', status: 'done', assignee: 'm3' }));
deliverables.push({
  id: 'd7', projectId: 'p7', name: '部署手册', kind: 'doc', version: '1.0',
  reviewer: 'm3', status: 'in_review', createdAt: '2026-09-20T09:00:00+08:00', updatedAt: RECENT
});

// p8：WIP 超限（吴悠手上 7 条 doing）
addProject(proj({ id: 'p8', code: 'PRJ-08', name: 'WIP 样例', owner: 'm8', stageId: 'dev' }));
for (let i = 1; i <= 7; i++) {
  tasks.push(task({ id: 't8_' + i, projectId: 'p8', title: '并行任务 ' + i, status: 'doing', assignee: 'm8', dueDate: '2026-11-2' + (i % 5) }));
}

// p9：项目无负责人
addProject(proj({ id: 'p9', code: 'PRJ-09', name: '无负责人样例', owner: '', stageId: 'dev' }));
tasks.push(task({ id: 't9a', projectId: 'p9', title: '需求拆解', status: 'todo', assignee: 'm1' }));

// p10：空转（零任务）
addProject(proj({ id: 'p10', code: 'PRJ-10', name: '空转样例', owner: 'm10', stageId: 'dev' }));

// p11：项目超期未归档
addProject(proj({ id: 'p11', code: 'PRJ-11', name: '超期样例', owner: 'm2', stageId: 'dev', dueDate: '2026-09-30' }));
tasks.push(task({ id: 't11a', projectId: 'p11', title: '收尾清理', status: 'todo', assignee: 'm2' }));

// p12：正常项目（任何规则都不该命中）
addProject(proj({ id: 'p12', code: 'PRJ-12', name: '正常样例', owner: 'm12', stageId: 'dev' }));
tasks.push(task({ id: 't12a', projectId: 'p12', title: '按计划推进', status: 'todo', assignee: 'm12', dueDate: '2026-11-20' }));

const state = {
  version: 1,
  meta: { name: '智能项目全生命周期管理面板', createdAt: '2026-09-01T09:00:00+08:00', updatedAt: RECENT, theme: 'dark' },
  config: CONFIG,
  projects, tasks, risks, changes, milestones, deliverables,
  members, diagrams: [], logs: []
};

function ev(s, opts) {
  return ENGINE.evaluate(s, Object.assign({ today: TODAY, now: NOW }, opts || {}));
}

// ---------------------------------------------------------------- 1. 接口形状

eq('模块已挂载规则引擎', typeof ENGINE, 'object');
eq('模块已挂载报告模块', typeof REPORTAPI, 'object');
ok('defaultRules ≥ 9 条（实际 ' + ENGINE.defaultRules.length + '）', ENGINE.defaultRules.length >= 9);
ok('每条内置规则都有 id / name / description / test', ENGINE.defaultRules.every(r =>
  r.id && r.name && r.description && typeof r.test === 'function'));
ok('evaluate 是函数 / rules 是函数 / registerRule 是函数',
  typeof ENGINE.evaluate === 'function' && typeof ENGINE.rules === 'function' && typeof ENGINE.registerRule === 'function');

// ---------------------------------------------------------------- 2. 12 个场景

eq('构造 12 个项目', projects.length, 12);

const found = ev(state);
const ids = new Set(found.map(f => f.ruleId));

const RULE_IDS = [
  'task.overdue',
  'stage.stall',
  'risk.highUnmitigated',
  'change.pending',
  'milestone.approaching',
  'milestone.missed',
  'deliverable.unaccepted',
  'wip.overLimit',
  'project.noOwner',
  'project.overdue',
  'project.noTasks'
];

RULE_IDS.forEach(rid => {
  const n = found.filter(f => f.ruleId === rid).length;
  ok('规则触发 ' + rid + '（' + n + ' 条）', n >= 1);
});

ok('覆盖 ≥9 条规则（实际 ' + ids.size + ' 条）', ids.size >= 9);

// 逾期分级
const overdueLevels = found.filter(f => f.ruleId === 'task.overdue').map(f => f.level);
ok('逾期任务按天数分级出现 high', overdueLevels.includes('high'));
ok('逾期任务按天数分级出现 mid', overdueLevels.includes('mid'));

// 正常项目不误报
const clean = found.filter(f => f.projectId === 'p12');
eq('正常项目 p12 不误报', clean.length, 0);

// 每条 finding 结构完整、建议可执行
const required = ['id', 'ruleId', 'level', 'entity', 'entityId', 'title', 'detail', 'suggestion'];
ok('finding 字段齐全', found.every(f => required.every(k => f[k] !== undefined)));
ok('level 只在 high/mid/low', found.every(f => ['high', 'mid', 'low'].includes(f.level)));
ok('entity 在允许集合内', found.every(f => ['project', 'task', 'risk', 'milestone', 'deliverable', 'change'].includes(f.entity)));
ok('每条 finding 的 suggestion 都是可执行文案（≥12 字）', found.every(f => f.suggestion.length >= 12));
ok('finding 的所有 projectId 都指向真实项目', found.every(f => !f.projectId || projects.some(p => p.id === f.projectId)));
ok('finding id 无重复', new Set(found.map(f => f.id)).size === found.length);

// ---------------------------------------------------------------- 3. 排序与上限

const RANK = { high: 0, mid: 1, low: 2 };
let sorted = true;
for (let i = 1; i < found.length; i++) {
  if (RANK[found[i - 1].level] > RANK[found[i].level]) sorted = false;
}
ok('evaluate 按 high→mid→low 稳定排序', sorted);

const firstMid = found.findIndex(f => f.level === 'mid');
if (firstMid > 0) {
  ok('high 段在 mid 段之前', found.slice(0, firstMid).every(f => f.level === 'high'));
}

// 300 条逾期任务 → 截断到 200
const bigProjects = [proj({ id: 'pBig', code: 'BIG', name: '压测项目', owner: 'm1', stageId: 'dev' })];
const bigTasks = [];
for (let i = 0; i < 300; i++) {
  bigTasks.push(task({ id: 'tb' + i, projectId: 'pBig', title: '逾期压测 ' + i, status: 'todo', assignee: 'm1', dueDate: '2026-09-01' }));
}
const bigState = Object.assign({}, state, { projects: bigProjects, tasks: bigTasks, risks: [], changes: [], milestones: [], deliverables: [] });
const big = ev(bigState);
eq('Finding 上限 200', big.length, 200);
ok('上限截断后仍是 high 优先', big.every(f => ['high', 'mid', 'low'].includes(f.level)));

// ---------------------------------------------------------------- 4. 空/非法输入

const emptyState = {
  version: 1, meta: {}, config: {},
  projects: [], tasks: [], risks: [], changes: [], milestones: [], deliverables: [], members: [], diagrams: [], logs: []
};
noThrow('空 state 不抛错', () => ev(emptyState));
eq('空 state 返回 []', ev(emptyState).length, 0);
eq('null state 返回 []', ENGINE.evaluate(null).length, 0);
eq('undefined state 返回 []', ENGINE.evaluate().length, 0);
eq('非对象 state 返回 []', ENGINE.evaluate('oops').length, 0);
noThrow('config 为 null 不抛错', () => ENGINE.evaluate({ projects: [], config: null }, { today: TODAY }));

// 日期格式错的字符串
const badState = {
  version: 1, config: CONFIG,
  projects: [proj({ id: 'pX', name: '坏日期', owner: 'm1', dueDate: '2026-13-45' })],
  tasks: [
    task({ id: 'tx1', projectId: 'pX', title: '坏日期1', dueDate: '2026-13-45' }),
    task({ id: 'tx2', projectId: 'pX', title: '坏日期2', dueDate: 'abc' }),
    task({ id: 'tx3', projectId: 'pX', title: '坏日期3', dueDate: '', updatedAt: 'not-a-time' }),
    task({ id: 'tx4', projectId: 'pX', title: '坏日期4', dueDate: null })
  ],
  risks: [{ id: 'rx', projectId: 'pX', title: '坏概率', probability: 'x', impact: 'y', status: 'open' }],
  changes: [{ id: 'cx', projectId: 'pX', title: '坏日期变更', status: 'proposed', createdAt: 'oops' }],
  milestones: [{ id: 'mx', projectId: 'pX', title: '坏日期里程碑', dueDate: '2026-02-31', status: 'pending' }],
  deliverables: [{ id: 'dx', projectId: 'pX', name: '坏交付物', status: 'draft' }],
  members: []
};
noThrow('日期/数值非法的 state 不抛错', () => ev(badState));
const badFound = ev(badState);
ok('坏日期任务不产生逾期误报', !badFound.some(f => f.entityId === 'tx1' || f.entityId === 'tx2'));
ok('坏日期变更不产生悬置误报', !badFound.some(f => f.ruleId === 'change.pending'));
ok('坏日期里程碑不产生错过误报', !badFound.some(f => f.ruleId === 'milestone.missed'));

noThrow('opts 里 today 也非法时不抛错', () => ENGINE.evaluate(state, { today: 'not-a-day', now: 'nope' }));

// ---------------------------------------------------------------- 5. 注册扩展

const customId = 'custom.demo';
ok('registerRule 接受合法规则', ENGINE.registerRule({
  id: customId, name: '示例规则', scope: 'project', level: 'low', description: '演示用',
  test: function (ctx) {
    return { projectId: 'p1', entity: 'project', entityId: 'p1', title: '自定义规则命中', detail: 'd', suggestion: '按自定义规则处理 p1' };
  }
}) === true);
ok('rules() 含自定义规则', ENGINE.rules().some(r => r.id === customId));
ok('evaluate 会执行自定义规则', ev(state).some(f => f.ruleId === customId));
const countBefore = ENGINE.rules().length;
ENGINE.registerRule({ id: customId, name: '示例规则v2', test: () => null });
eq('同 id 重复注册不会重复入列', ENGINE.rules().length, countBefore);
ok('重复注册走覆盖（name 更新）', ENGINE.rules().find(r => r.id === customId).name === '示例规则v2');
const origWarn = console.warn;
console.warn = () => {};
const badRuleResult = ENGINE.registerRule({ id: '', test: null }) === false && ENGINE.registerRule(null) === false;
console.warn = origWarn;
ok('registerRule 拒绝非法规则', badRuleResult);

const origError = console.error;
console.error = () => {};
let boomCount = 0;
let boomOn = true;   // 只在断言期间炸，避免污染后面的周报输出
ENGINE.registerRule({
  id: 'custom.boom', name: '会炸的规则', scope: 'project', level: 'low',
  test: function () { if (boomOn) throw new Error('故意的'); return null; }
});
noThrow('抛异常的规则不会拖垮 evaluate', () => { boomCount = ev(state).length; });
boomOn = false;
console.error = origError;
ok('其它规则照常产出（' + boomCount + ' 条）', boomCount > 0 && !ev(state).some(f => f.ruleId === 'custom.boom'));

// ---------------------------------------------------------------- 6. 报告

const weekly = REPORTAPI.weekly(state, { since: '2026-10-25', until: TODAY });
['本周概览', '阶段分布', '预警 Top5', '风险登记', '里程碑', '下周建议'].forEach(sec => {
  ok('周报包含小节「' + sec + '」', weekly.includes(sec));
});
ok('周报标题含时间窗', weekly.includes('2026-10-25') && weekly.includes(TODAY));
ok('周报数字来自 state（任务总数 ' + tasks.length + '）', weekly.includes(String(tasks.length) + ' 条'));
ok('周报列出了高风险', weekly.includes('高风险'));
noThrow('weekly(null) 不抛错', () => REPORTAPI.weekly(null));
ok('weekly(null) 返回字符串且各小节仍在', typeof REPORTAPI.weekly(null) === 'string' && REPORTAPI.weekly(null).includes('本周概览'));
noThrow('weekly 传非法 since/until 不抛错', () => REPORTAPI.weekly(state, { since: 'xx', until: 123 }));
ok('周报含风险条目', weekly.includes('第三方接口不提供沙箱'));

const ps = REPORTAPI.projectSummary(state, 'p1');
['基本信息', '阶段进度', '任务统计', '风险', '变更', '交付物'].forEach(sec => {
  ok('项目摘要含小节「' + sec + '」', ps.includes(sec));
});
ok('项目摘要含任务标题', ps.includes('接口联调'));
ok('projectSummary 找不到项目时给出提示而不抛错', REPORTAPI.projectSummary(state, 'nope').includes('未找到项目'));
noThrow('projectSummary(null, id) 不抛错', () => REPORTAPI.projectSummary(null, 'p1'));
noThrow('projectSummary(state, null) 不抛错', () => REPORTAPI.projectSummary(state, null));
noThrow('projectSummary 用超期项目不抛错', () => REPORTAPI.projectSummary(state, 'p11'));

// ---------------------------------------------------------------- 7. CSV / Markdown 表

const csvRows = [
  { a: 'x,y', b: 'he said "hi"', c: 'line1\nline2', d: 'plain', n: 3 },
  { a: '', b: '无逗号', c: 'ok', d: '无引号', n: 0 }
];
const cols = [
  { key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' },
  { key: 'd', label: 'D' }, { key: 'n', label: 'N' }
];
const csv = REPORTAPI.toCSV(csvRows, cols);

ok('CSV 以 \\uFEFF 开头', csv.charCodeAt(0) === 0xFEFF);
ok('CSV 只含一个 BOM', csv.split('\uFEFF').length === 2);
ok('CSV 表头正确', csv.trim().split('\r\n')[0] === 'A,B,C,D,N');
ok('CSV 逗号字段加引号', csv.includes('"x,y"'));
ok('CSV 双引号转义为两个双引号', csv.includes('"he said ""hi"""'));
ok('CSV 换行字段加引号', csv.includes('"line1\nline2"'));
ok('CSV 普通字段不加引号', csv.includes('plain'));
ok('CSV 行数 = 表头 + 2', csv.trim().split('\r\n').length === 3);
ok('CSV 空 rows 仍带 BOM 表头', REPORTAPI.toCSV([], cols).charCodeAt(0) === 0xFEFF);
ok('CSV 缺列定义时从首行推导', REPORTAPI.toCSV([{ x: 1, y: 2 }]).includes('x,y'));

const mdTable = REPORTAPI.toMarkdownTable([{ x: 'a|b', y: 2 }], [{ key: 'x', label: 'X' }, { key: 'y', label: 'Y' }]);
const mdLines = mdTable.split('\n');
ok('Markdown 表有三行（表头/分隔/数据）', mdLines.length === 3);
ok('Markdown 表转义竖线', mdTable.includes('a\\|b'));
ok('Markdown 表带对齐分隔行', /^\|[\s:|-]+\|$/.test(mdLines[1]) && mdLines[1].includes('---'));
ok('Markdown 表数字列右对齐', mdLines[1].split('|')[2].trim().endsWith(':'));
ok('toMarkdownTable 空数据只给表头+分隔行', (() => {
  const t = REPORTAPI.toMarkdownTable([], cols).split('\n');
  return t.length === 2 && t[0].startsWith('| A') && t[1].includes('---');
})());
noThrow('toCSV / toMarkdownTable 传垃圾不抛错', () => {
  REPORTAPI.toCSV(null, null);
  REPORTAPI.toMarkdownTable(undefined, [{}]);
});

// ---------------------------------------------------------------- 收尾

console.log('');
console.log('--------------------------------------------------');
if (failures.length) {
  console.log('FAILED ' + failures.length + ' 项 / PASS ' + passed + ' 项');
  failures.forEach(f => console.log('  · ' + f));
  process.exit(1);
}
console.log('ALL PASS —— ' + passed + ' 项断言全绿');
process.exit(0);
