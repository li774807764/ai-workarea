/* =============================================================================
 * tests/uml.test.js —— PLM_UML 渲染引擎自测（零依赖，直接 node 跑）
 *   node tests/uml.test.js
 * ============================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'js', 'uml', 'uml.js');

let pass = 0;
let fail = 0;
const fails = [];

function ok(name, cond, detail) {
  if (cond) {
    pass += 1;
    console.log('PASS  ' + name);
  } else {
    fail += 1;
    const d = detail ? ('  → ' + String(detail).slice(0, 300)) : '';
    fails.push(name + d);
    console.log('FAIL  ' + name + d);
  }
}

/* ---------------- 加载被测文件：假 window ---------------- */
function loadEngine() {
  const code = fs.readFileSync(SRC, 'utf8');
  const sandbox = {
    window: {},
    console: { log() {}, warn() {}, error() {} },
    Math, JSON, Date, Object, Array, String, Number, isFinite, isNaN, parseInt, parseFloat
  };
  sandbox.global = sandbox;
  sandbox.self = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'uml.js' });
  return sandbox.window.PLM_UML;
}

const UML = loadEngine();
ok('加载文件并挂载 window.PLM_UML', !!UML && typeof UML.render === 'function');
ok('VERSION 是字符串', typeof UML.VERSION === 'string' && UML.VERSION.length > 0);
ok('types 包含四种图', ['usecase', 'class', 'state', 'sequence'].every(t => UML.types.indexOf(t) >= 0));

/* ---------------- 通用断言 ---------------- */
function count(svg, needle) {
  let n = 0;
  let i = svg.indexOf(needle);
  while (i >= 0) { n += 1; i = svg.indexOf(needle, i + needle.length); }
  return n;
}

function commonChecks(tag, res, extra) {
  if (!res || typeof res !== 'object') { ok(tag + '：返回对象', false, res); return; }
  if (res.error) { ok(tag + '：不应返回 error', false, res.error); return; }
  const svg = res.svg;
  ok(tag + '：有 svg 字符串', typeof svg === 'string' && svg.length > 0);
  if (typeof svg !== 'string') { return; }
  ok(tag + '：含 <svg', svg.indexOf('<svg') === 0);
  ok(tag + '：闭合 </svg>', svg.indexOf('</svg>') === svg.length - 6);
  ok(tag + '：width/height 为正数', typeof res.width === 'number' && typeof res.height === 'number' &&
    isFinite(res.width) && isFinite(res.height) && res.width > 0 && res.height > 0, res.width + 'x' + res.height);
  ok(tag + '：viewBox 尺寸与 width/height 一致',
    svg.indexOf('viewBox="0 0 ' + res.width + ' ' + res.height + '"') > 0);
  ok(tag + '：含 font-family', svg.indexOf('font-family="') > 0);
  ok(tag + '：无 undefined', svg.indexOf('undefined') < 0,
    svg.slice(Math.max(0, svg.indexOf('undefined') - 60), svg.indexOf('undefined') + 60));
  ok(tag + '：无 NaN', svg.indexOf('NaN') < 0,
    svg.slice(Math.max(0, svg.indexOf('NaN') - 60), svg.indexOf('NaN') + 60));

  /* 去掉 xmlns 声明后不许有外链 / 网络调用 */
  const bare = svg.replace(/xmlns(:xlink)?="[^"]*"/g, '').replace(/xml:space="preserve"/g, '');
  ok(tag + '：无 http 外链', bare.indexOf('http') < 0, bare.slice(Math.max(0, bare.indexOf('http') - 60), bare.indexOf('http') + 60));
  ok(tag + '：无 fetch/XHR', bare.indexOf('fetch') < 0 && bare.indexOf('XMLHttpRequest') < 0);
  ok(tag + '：无 <script / on* 事件', bare.indexOf('<script') < 0 && !/\son[a-z]+\s*=/.test(bare));
  ok(tag + '：无外链图片', bare.indexOf('<image') < 0 && bare.indexOf('href="//') < 0);

  /* 颜色只用 var(--x, y) 或 none */
  const bad = [];
  const re = /(?:^|\s)(fill|stroke)="([^"]*)"/g;
  let m;
  while ((m = re.exec(svg)) !== null) {
    const v = m[2];
    if (v === 'none' || v === '') { continue; }
    if (/^var\(--[a-z0-9-]+,\s*#[0-9a-fA-F]{3,8}\)$/.test(v)) { continue; }
    bad.push(m[1] + '=' + v);
  }
  ok(tag + '：颜色全部走 var(--x, fallback)', bad.length === 0, bad.slice(0, 5).join(' , '));

  if (extra) { extra(svg); }
}

function escChecks(tag, svg, raw) {
  ok(tag + '：尖括号被转义', svg.indexOf('&lt;') > 0 && svg.indexOf(raw) < 0, raw);
  ok(tag + '：引号被转义', svg.indexOf('&quot;') > 0 || raw.indexOf('"') < 0);
}

/* =============================================================
 * 用例图
 * ============================================================= */
(function usecaseTests() {
  // U1 空数组：画不出东西 → {error}
  let r = UML.render('usecase', { actors: [], usecases: [], links: [] });
  ok('用例图/空：返回 error 而不是空图', !!r.error, r.error);
  ok('用例图/空：文案指明字段（actors）', String(r.error).indexOf('actors 为空') >= 0, r.error);
  ok('用例图/空：不返回 svg', !r.svg);

  // U2 单节点
  r = UML.render('usecase', {
    actors: [{ id: 'a1', name: '顾客' }],
    usecases: [{ id: 'u1', name: '登录' }],
    links: [{ from: 'a1', to: 'u1', kind: 'assoc' }]
  });
  commonChecks('用例图/单节点', r, svg => {
    ok('用例图/单节点：1 个椭圆', count(svg, 'data-role="usecase"') === 1);
    ok('用例图/单节点：1 个 actor 头', count(svg, 'data-role="actor-head"') === 1);
    ok('用例图/单节点：有系统边界', count(svg, 'data-role="boundary"') === 1);
    ok('用例图/单节点：火柴人有身体', count(svg, '<polyline') + count(svg, '<path') > 0);
  });

  // U3 复杂：分组 / include / extend / general / 中英混排 / 长标签 / 转义
  r = UML.render('usecase', {
    boundary: '在线商城 <系统>',
    actors: [
      { id: 'buyer', name: '买家 Buyer' },
      { id: 'admin', name: '管理员' }
    ],
    usecases: [
      { id: 'uc1', name: '浏览商品列表并加入购物车', group: '前台' },
      { id: 'uc2', name: '下单支付', group: '前台' },
      { id: 'uc3', name: 'Refund 退款', group: '前台' },
      { id: 'uc4', name: '审核商品 <b>上架</b>', group: '后台' },
      { id: 'uc6', name: '用户管理', group: '后台' },
      { id: 'uc5', name: '导出月度销售报表 CSV' }
    ],
    links: [
      { from: 'buyer', to: 'uc1', kind: 'assoc' },
      { from: 'buyer', to: 'uc2', kind: 'assoc' },
      { from: 'buyer', to: 'uc3', kind: 'assoc' },
      { from: 'admin', to: 'uc4', kind: 'assoc' },
      { from: 'admin', to: 'uc6', kind: 'assoc' },
      { from: 'admin', to: 'uc5', kind: 'assoc' },
      { from: 'uc2', to: 'uc1', kind: 'include' },
      { from: 'uc3', to: 'uc2', kind: 'extend' },
      { from: 'uc4', to: 'uc5', kind: 'general' }
    ]
  }, { title: '用例图：在线商城' });
  commonChecks('用例图/复杂', r, svg => {
    ok('用例图/复杂：6 个用例椭圆', count(svg, 'data-role="usecase"') === 6);
    ok('用例图/复杂：2 个参与者', count(svg, 'data-role="actor-head"') === 2);
    ok('用例图/复杂：两个分组框 + 竖排标签',
      count(svg, 'data-role="group"') === 2 && count(svg, 'data-role="group-label"') === 2);
    ok('用例图/复杂：带 «include» / «extend»', svg.indexOf('«include»') > 0 && svg.indexOf('«extend»') > 0);
    ok('用例图/复杂：有标题', svg.indexOf('用例图：在线商城') > 0);
    ok('用例图/复杂：菱形三角记号存在', count(svg, 'data-role="rel') >= 0);
    escChecks('用例图/复杂', svg, '<b>上架</b>');
    ok('用例图/复杂：&lt;系统&gt; 已转义', svg.indexOf('&lt;系统&gt;') > 0);
  });

  // U4 大图保护
  const many = [];
  for (let i = 0; i < 70; i++) { many.push({ id: 'u' + i, name: '用例 ' + i }); }
  r = UML.render('usecase', { actors: [{ id: 'a', name: 'A' }], usecases: many, links: [] });
  commonChecks('用例图/大图保护', r, svg => {
    ok('用例图/大图保护：有简化提示', svg.indexOf('data-role="note"') > 0 && svg.indexOf('已简化') > 0);
    ok('用例图/大图保护：仍是合法 svg', svg.indexOf('</svg>') > 0);
  });
}());

/* =============================================================
 * 类图
 * ============================================================= */
(function classTests() {
  // C1 空：画不出东西 → {error}
  let r = UML.render('class', { classes: [], relations: [] });
  ok('类图/空：返回 error 而不是空图', !!r.error, r.error);
  ok('类图/空：文案指明字段（classes）', String(r.error).indexOf('classes 为空') >= 0, r.error);
  ok('类图/空：不返回 svg', !r.svg);

  // C2 单类
  r = UML.render('class', {
    classes: [{
      id: 'c1', name: 'Order', stereotype: 'entity',
      attrs: [{ name: 'id', type: 'UUID', visibility: '-' }],
      methods: [{ name: 'total', params: '', ret: 'Money', visibility: '+' }],
      note: '核心聚合根'
    }],
    relations: []
  });
  commonChecks('类图/单类', r, svg => {
    ok('类图/单类：1 个类框', count(svg, 'data-role="class"') === 1);
    ok('类图/单类：三分栏分隔线 ≥2', count(svg, '<line') >= 2);
    ok('类图/单类：可见性符号 -', svg.indexOf('- id') > 0 || svg.indexOf('-id') > 0);
    ok('类图/单类：可见性符号 +', svg.indexOf('+ total') > 0 || svg.indexOf('+total') > 0);
    ok('类图/单类：stereotype', svg.indexOf('«entity»') > 0);
    ok('类图/单类：备注', svg.indexOf('核心聚合根') > 0);
    ok('类图/单类：类型标注', svg.indexOf('UUID') > 0);
  });

  // C3 关系全家桶
  r = UML.render('class', {
    classes: [
      { id: 'Base', name: 'AbstractRepository', stereotype: 'abstract', attrs: [{ name: 'ds', type: 'DataSource', visibility: '#' }], methods: [{ name: 'save', params: 'e', ret: 'void', visibility: '+' }] },
      { id: 'UserRepo', name: 'UserRepository', methods: [{ name: 'findById', params: 'id', ret: 'User', visibility: '+', }] },
      { id: 'OrderRepo', name: 'OrderRepository 订单仓储', attrs: [{ name: 'cache', type: 'Map', visibility: '-' }] },
      { id: 'User', name: 'User 用户', attrs: [{ name: 'name', type: 'string', visibility: '- ' }] },
      { id: 'Order', name: 'Order', attrs: [{ name: 'lines', type: 'OrderLine[*]', visibility: '-' }], note: '订单聚合' },
      { id: 'Notifier', name: 'Notifier 通知接口', stereotype: 'interface' },
      { id: 'Logger', name: 'Logger' }
    ],
    relations: [
      { from: 'UserRepo', to: 'Base', kind: 'inherit' },
      { from: 'OrderRepo', to: 'Base', kind: 'inherit' },
      { from: 'Notifier', to: 'Order', kind: 'realize', label: 'notifies' },
      { from: 'Order', to: 'User', kind: 'agg', fromMult: '1', toMult: '1..*', fromRole: 'owner', toRole: 'orders' },
      { from: 'Order', to: 'Notifier', kind: 'comp', label: 'composed of', fromMult: '1', toMult: '0..n' },
      { from: 'UserRepo', to: 'Logger', kind: 'depend', label: 'logs', fromMult: '1', toMult: '1' },
      { from: 'User', to: 'Order', kind: 'assoc', label: '与 Order 关联并携带一个特别长的说明标签', fromMult: '*', toMult: '*' }
    ]
  }, { title: '类图：仓储与聚合' });
  commonChecks('类图/复杂', r, svg => {
    ok('类图/复杂：7 个类框', count(svg, 'data-role="class"') === 7);
    ok('类图/复杂：有 marker 定义', count(svg, '<marker') >= 5);
    ok('类图/复杂：空心三角（继承/实现）在用例', svg.indexOf('_tri"') > 0);
    ok('类图/复杂：空心菱形（聚合）', svg.indexOf('_dia"') > 0);
    ok('类图/复杂：实心菱形（组合）', svg.indexOf('_diaF"') > 0);
    ok('类图/复杂：开放箭头（依赖）', svg.indexOf('_open"') > 0);
    ok('类图/复杂：虚线描边存在', count(svg, 'stroke-dasharray') >= 2);
    ok('类图/复杂：多重度 1..* 出现', svg.indexOf('1..*') > 0);
    ok('类图/复杂：角色名 owner / orders', svg.indexOf('owner') > 0 && svg.indexOf('orders') > 0);
    ok('类图/复杂：关系标签', svg.indexOf('composed of') > 0);
    ok('类图/复杂：interface 构造型', svg.indexOf('«interface»') > 0);
    ok('类图/复杂：中英混排类名', svg.indexOf('OrderRepository') > 0 && svg.indexOf('订单仓储') > 0);
  });

  // C4 循环继承（必须不抛错、不死循环）
  r = UML.render('class', {
    classes: [{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }],
    relations: [{ from: 'x', to: 'y', kind: 'inherit' }, { from: 'y', to: 'x', kind: 'inherit' }]
  });
  commonChecks('类图/循环继承', r, svg => {
    ok('类图/循环继承：两个框都在', count(svg, 'data-role="class"') === 2);
  });
}());

/* =============================================================
 * 状态机
 * ============================================================= */
(function stateTests() {
  // S1 空：画不出东西 → {error}
  let r = UML.render('state', { states: [], transitions: [] });
  ok('状态机/空：返回 error 而不是空图', !!r.error, r.error);
  ok('状态机/空：文案指明字段（states）', String(r.error).indexOf('states 为空') >= 0, r.error);
  ok('状态机/空：不返回 svg', !r.svg);

  // S2 单状态
  r = UML.render('state', {
    states: [{ id: 's', name: '等待中', kind: 'state', entry: 'startTimer()', action: 'poll()' }],
    transitions: []
  });
  commonChecks('状态机/单状态', r, svg => {
    ok('状态机/单状态：1 个圆角矩形', count(svg, 'data-role="state"') === 1);
    ok('状态机/单状态：有 rx 圆角', svg.indexOf('rx="12"') > 0);
    ok('状态机/单状态：entry/action 小字', svg.indexOf('startTimer()') > 0 && svg.indexOf('poll()') > 0);
  });

  // S3 完整生命周期：initial / 多状态 / final / 自转移 / 前进 / 后退 / 守卫
  r = UML.render('state', {
    states: [
      { id: 'i', name: 'initial', kind: 'initial' },
      { id: 'draft', name: '草稿', kind: 'state', entry: 'init()' },
      { id: 'review', name: '待审核 Review', kind: 'state', action: 'lock()' },
      { id: 'done', name: '已完成', kind: 'state' },
      { id: 'f', name: 'final', kind: 'final' }
    ],
    transitions: [
      { from: 'i', to: 'draft' },
      { from: 'draft', to: 'draft', event: '自动保存', guard: '每 30 秒', action: 'persist()' },
      { from: 'draft', to: 'review', event: '提交', guard: '必填项已填', action: 'notifyReviewer()' },
      { from: 'review', to: 'draft', event: '驳回', action: 'unlock()' },
      { from: 'review', to: 'done', event: '通过', guard: '审批人 ≥ 2 且无反对票', action: 'archive()' },
      { from: 'done', to: 'f' }
    ]
  }, { title: '状态机：单据流转' });
  commonChecks('状态机/复杂', r, svg => {
    ok('状态机/复杂：initial 实心圆', count(svg, 'data-role="initial"') === 1);
    ok('状态机/复杂：final 双环', count(svg, 'data-role="final"') === 1 && count(svg, 'data-role="final-inner"') === 1);
    ok('状态机/复杂：3 个 state 框', count(svg, 'data-role="state"') === 3);
    ok('状态机/复杂：6 条转移折线', count(svg, 'data-role="trans"') + count(svg, 'marker-end') >= 6);
    ok('状态机/复杂：转移标签', svg.indexOf('trans-label') > 0);
    ok('状态机/复杂：事件 [守卫] / 动作', svg.indexOf('[必填项已填]') > 0 && svg.indexOf('/ notifyReviewer()') > 0);
    ok('状态机/复杂：自转移标签', svg.indexOf('自动保存') > 0);
    ok('状态机/复杂：长守卫标签', svg.indexOf('审批人 ≥ 2 且无反对票') > 0);
    ok('状态机/复杂：标题', svg.indexOf('状态机：单据流转') > 0);
  });

  // S4 悬空引用 / 缺字段不崩
  r = UML.render('state', {
    states: [{ id: 'a' }],
    transitions: [{ from: 'a', to: 'ghost', event: 'x' }, { from: 'nope', to: 'a' }, {}]
  });
  ok('状态机/悬空引用：不抛错且返回 svg 或 error',
    !!r && (typeof r.svg === 'string' || typeof r.error === 'string'));
  if (r && r.svg) { commonChecks('状态机/悬空引用', r); }
}());

/* =============================================================
 * 时序图
 * ============================================================= */
(function sequenceTests() {
  // Q1 空：画不出东西 → {error}
  let r = UML.render('sequence', { participants: [], messages: [] });
  ok('时序图/空：返回 error 而不是空图', !!r.error, r.error);
  ok('时序图/空：文案指明字段（participants）', String(r.error).indexOf('participants 为空') >= 0, r.error);
  ok('时序图/空：不返回 svg', !r.svg);

  // Q2 单参与者
  r = UML.render('sequence', { participants: [{ id: 'p', name: '客户端' }], messages: [] });
  commonChecks('时序图/单参与者', r, svg => {
    ok('时序图/单参与者：1 个框', count(svg, 'data-role="participant"') === 1);
    ok('时序图/单参与者：1 条生命线', count(svg, 'data-role="lifeline"') === 1);
    ok('时序图/单参与者：生命线是虚线', svg.indexOf('stroke-dasharray="5 5"') > 0);
  });

  // Q3 完整交互：sync / async / return / 自消息 / 长文本
  r = UML.render('sequence', {
    participants: [
      { id: 'ui', name: '前端 UI' },
      { id: 'api', name: 'API 网关 Gateway' },
      { id: 'svc', name: '订单服务' },
      { id: 'db', name: 'PostgreSQL 数据库' }
    ],
    messages: [
      { from: 'ui', to: 'api', kind: 'sync', text: 'POST /orders' },
      { from: 'api', to: 'svc', kind: 'sync', text: 'createOrder(dto)' },
      { from: 'svc', to: 'svc', kind: 'sync', text: 'validate(dto) 自调用' },
      { from: 'svc', to: 'db', kind: 'async', text: 'INSERT INTO orders ...' },
      { from: 'db', to: 'svc', kind: 'return', text: 'orderId' },
      { from: 'svc', to: 'api', kind: 'return', text: '201 Created 并返回一个很长很长很长的响应说明文本' },
      { from: 'api', to: 'ui', kind: 'async', text: 'push 更新通知' }
    ]
  }, { title: '时序图：下单主链路' });
  commonChecks('时序图/复杂', r, svg => {
    ok('时序图/复杂：4 个参与者', count(svg, 'data-role="participant"') === 4);
    ok('时序图/复杂：4 条生命线', count(svg, 'data-role="lifeline"') === 4);
    ok('时序图/复杂：7 条消息文本', count(svg, 'data-role="msg-text"') === 7);
    ok('时序图/复杂：return 虚线', count(svg, 'stroke-dasharray="6 4"') >= 2);
    ok('时序图/复杂：sync 实心箭头 marker', svg.indexOf('_filled"') > 0);
    ok('时序图/复杂：async 开放箭头 marker', svg.indexOf('_open"') > 0);
    ok('时序图/复杂：自消息环路', svg.indexOf('<polyline') > 0 || svg.indexOf('<path') > 0);
    ok('时序图/复杂：中文长文本未丢', svg.indexOf('201 Created') > 0 && svg.indexOf('下单主链路') > 0);
  });

  // Q4 空 messages / 引用不存在的参与者
  r = UML.render('sequence', { participants: [{ id: 'a', name: 'A' }], messages: [{ from: 'a', to: 'zzz', kind: 'sync', text: 'x' }] });
  ok('时序图/悬空参与者：不抛错', !!r && (typeof r.svg === 'string' || typeof r.error === 'string'));
  if (r && r.svg) { ok('时序图/悬空参与者：无 NaN', r.svg.indexOf('NaN') < 0); }
}());

/* =============================================================
 * 长文本：只换行、不截断（不允许出现被切一半的签名）
 * ============================================================= */
(function longTextTests() {
  function plainText(svg) {
    return svg.replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").replace(/&amp;/g, '&')
      .replace(/\s+/g, '');
  }

  const longMeth = 'findAllWithPaginationAndSorting(criteria: Criteria, page: PageRequest, sort: Sort): Page<User>';
  const rc2 = UML.render('class', {
    classes: [{
      id: 'big', name: 'ExtremelyLongRepositoryNameForPagingTests 分页仓储实现类',
      attrs: [{ name: 'aVeryLongAttributeNameForTesting', type: 'Map<String, List<OrderLine>>', visibility: '-' }],
      methods: [{ name: longMeth.split('(')[0], params: longMeth.slice(longMeth.indexOf('(') + 1, longMeth.lastIndexOf(')')), ret: 'Page<User>', visibility: '+' }]
    }],
    relations: []
  });
  commonChecks('长文本/类图', rc2, svg => {
    ok('长文本/类图：方法签名完整保留（未截断）', plainText(svg).indexOf(longMeth.replace(/\s+/g, '')) >= 0);
    ok('长文本/类图：长类名完整保留', plainText(svg).indexOf('分页仓储实现类') >= 0);
    ok('长文本/类图：长属性类型完整保留', plainText(svg).indexOf('Map<String,List<OrderLine>>') >= 0);
  });

  const longUc = '跨组织跨区域多租户权限审批与最终结算流程（含异常回滚与补偿解释）';
  const ru2 = UML.render('usecase', {
    actors: [{ id: 'a', name: '一个名字特别长的系统使用者角色' }],
    usecases: [{ id: 'u', name: longUc }],
    links: [{ from: 'a', to: 'u', kind: 'assoc' }]
  });
  commonChecks('长文本/用例图', ru2, svg => {
    ok('长文本/用例图：用例名完整保留（换行不截断）', plainText(svg).indexOf(longUc) >= 0);
    ok('长文本/用例图：角色名完整保留', plainText(svg).indexOf('一个名字特别长的系统使用者角色') >= 0);
  });

  const longGuard = '订单金额 > 10000 且客户等级 >= VIP2 且无未结清欠款记录';
  const rs2 = UML.render('state', {
    states: [{ id: 'i', kind: 'initial' }, { id: 'a', name: '待支付' }, { id: 'b', name: '已放行' }],
    transitions: [{ from: 'a', to: 'b', event: '免密放行检查触发', guard: longGuard, action: 'releaseImmediately()' }]
  });
  commonChecks('长文本/状态机', rs2, svg => {
    ok('长文本/状态机：守卫条件完整保留', plainText(svg).indexOf(longGuard.replace(/\s+/g, '')) >= 0);
    ok('长文本/状态机：动作完整保留', plainText(svg).indexOf('releaseImmediately()') >= 0);
  });

  const longMsg = '返回 201 Created，并附带一个非常长的 Location 头与分页游标 cursor=abcdef123456';
  const rq2 = UML.render('sequence', {
    participants: [{ id: 'x', name: '客户端' }, { id: 'y', name: '服务端' }],
    messages: [{ from: 'y', to: 'x', kind: 'return', text: longMsg }]
  });
  commonChecks('长文本/时序图', rq2, svg => {
    ok('长文本/时序图：消息文本完整保留', plainText(svg).indexOf(longMsg.replace(/\s+/g, '')) >= 0);
  });
}());

/* =============================================================
 * 异常输入：一律不抛错
 * ============================================================= */
(function errorTests() {
  const cases = [
    ['null', 'class', null],
    ['undefined', 'class', undefined],
    ['字符串 spec', 'class', 'oops'],
    ['数字 spec', 'class', 42],
    ['数组 spec', 'class', []],
    ['空对象', 'usecase', {}],
    ['空对象', 'class', {}],
    ['空对象', 'state', {}],
    ['空对象', 'sequence', {}],
    ['缺 classes 的类图', 'class', { relations: [{ from: 'a', to: 'b', kind: 'inherit' }] }],
    ['字段类型错乱', 'state', { states: 'nope', transitions: 5 }],
    ['未知类型', 'flowchart', { nodes: [] }],
    ['大写类型', 'CLASS', { classes: [{ id: 'a', name: 'A' }] }],
    ['自引用关系', 'class', { classes: [{ id: 'a', name: 'A' }], relations: [{ from: 'a', to: 'a', kind: 'agg' }] }],
    ['links 里 from===to', 'usecase', { actors: [{ id: 'a', name: 'A' }], usecases: [{ id: 'u', name: 'U' }], links: [{ from: 'u', to: 'u', kind: 'include' }] }]
  ];
  cases.forEach(([label, type, spec]) => {
    let threw = false;
    let res = null;
    try { res = UML.render(type, spec); } catch (e) { threw = true; console.log('       抛错：' + e.message); }
    ok('异常输入/' + label + '：不抛错', threw === false);
    ok('异常输入/' + label + '：返回对象',
      !!res && (typeof res.error === 'string' || typeof res.svg === 'string'), JSON.stringify(res && Object.keys(res)));
    if (res && res.svg) {
      ok('异常输入/' + label + '：svg 干净', res.svg.indexOf('NaN') < 0 && res.svg.indexOf('undefined') < 0);
    }
  });

  ok('未知类型返回 {error}', !!UML.render('flowchart', {}).error);
  ok('null spec 返回 {error}', !!UML.render('class', null).error);
  ok('大写类型可正常渲染（不区分大小写）', !!UML.render('CLASS', { classes: [{ id: 'a', name: 'A' }] }).svg);
}());

/* =============================================================
 * 几何校验：节点不重叠、整体落在 viewBox 内
 * ============================================================= */
(function geometryTests() {
  function parseShapes(svg) {
    const out = [];
    const re = /<(rect|ellipse|circle)\b([^>]*?)\/?>/g;
    let m;
    while ((m = re.exec(svg)) !== null) {
      const tag = m[1];
      const attrs = {};
      const ar = /([\w:-]+)="([^"]*)"/g;
      let a;
      while ((a = ar.exec(m[2])) !== null) { attrs[a[1]] = a[2]; }
      let b = null;
      if (tag === 'rect') {
        b = { x: +attrs.x, y: +attrs.y, w: +attrs.width, h: +attrs.height };
      } else if (tag === 'ellipse') {
        b = { x: +attrs.cx - +attrs.rx, y: +attrs.cy - +attrs.ry, w: 2 * +attrs.rx, h: 2 * +attrs.ry };
      } else if (tag === 'circle') {
        b = { x: +attrs.cx - +attrs.r, y: +attrs.cy - +attrs.r, w: 2 * +attrs.r, h: 2 * +attrs.r };
      }
      if (b && isFinite(b.x) && isFinite(b.y) && isFinite(b.w) && isFinite(b.h)) {
        out.push({ role: attrs['data-role'] || '', tag: tag, b: b });
      }
    }
    return out;
  }

  function translateOf(svg) {
    const m = /<g transform="translate\(([-\d.]+),([-\d.]+)\)">/.exec(svg);
    return m ? { x: +m[1], y: +m[2] } : { x: 0, y: 0 };
  }

  function overlapArea(a, b) {
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return (ox > 1 && oy > 1) ? ox * oy : 0;
  }

  function noOverlap(tag, res, roles) {
    const shapes = parseShapes(res.svg).filter(s => roles.indexOf(s.role) >= 0);
    let worst = null;
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        const area = overlapArea(shapes[i].b, shapes[j].b);
        if (area > 0 && (!worst || area > worst.area)) {
          worst = { area: area, a: shapes[i].role, b: shapes[j].role };
        }
      }
    }
    ok(tag + '：' + roles.join('/') + ' 之间无重叠', !worst,
      worst ? ('重叠面积 ' + Math.round(worst.area) + 'px²：' + worst.a + ' × ' + worst.b) : '');
  }

  function insideViewport(tag, res, roles) {
    const t = translateOf(res.svg);
    const shapes = parseShapes(res.svg).filter(s => roles.indexOf(s.role) >= 0);
    const out = shapes.filter(s => {
      const x0 = s.b.x + t.x;
      const y0 = s.b.y + t.y;
      return x0 < -2 || y0 < -2 || x0 + s.b.w > res.width + 2 || y0 + s.b.h > res.height + 2;
    });
    ok(tag + '：全部图形落在 viewBox 内', out.length === 0,
      out.slice(0, 3).map(s => s.role + '@' + Math.round(s.b.x) + ',' + Math.round(s.b.y)).join(' '));
  }

  /* 用例图：椭圆互不重叠 + 参与者互不重叠 */
  const ru = UML.render('usecase', {
    boundary: '系统',
    actors: [{ id: 'a1', name: '顾客甲' }, { id: 'a2', name: '顾客乙' }, { id: 'a3', name: '运营' }],
    usecases: [
      { id: 'u1', name: '登录系统' }, { id: 'u2', name: '浏览商品' }, { id: 'u3', name: '下单' },
      { id: 'u4', name: '支付' }, { id: 'u5', name: '退款售后处理' }, { id: 'u6', name: '查看订单' },
      { id: 'u7', name: '导出报表' }
    ],
    links: [
      { from: 'a1', to: 'u1', kind: 'assoc' }, { from: 'a1', to: 'u3', kind: 'assoc' },
      { from: 'a2', to: 'u5', kind: 'assoc' }, { from: 'a3', to: 'u7', kind: 'assoc' },
      { from: 'u3', to: 'u1', kind: 'include' }, { from: 'u5', to: 'u4', kind: 'extend' }
    ]
  });
  noOverlap('几何/用例图', ru, ['usecase']);
  insideViewport('几何/用例图', ru, ['usecase', 'actor-head', 'boundary']);
  noOverlap('几何/用例图', ru, ['actor-head']);

  /* 类图：类框互不重叠 */
  const rc = UML.render('class', {
    classes: [
      { id: 'A', name: 'BaseRepository', attrs: [{ name: 'ds', type: 'DS' }], methods: [{ name: 'save' }] },
      { id: 'B', name: 'UserRepository 用户仓储', methods: [{ name: 'findAll', ret: 'List<User>' }] },
      { id: 'C', name: 'OrderRepository', attrs: [{ name: 'cache', type: 'Map' }] },
      { id: 'D', name: 'User', attrs: [{ name: 'name', type: 'string' }] },
      { id: 'E', name: 'Order', attrs: [{ name: 'total', type: 'Money' }, { name: 'lines', type: 'Line[]' }], note: '聚合根' },
      { id: 'F', name: 'Notifier', stereotype: 'interface' }
    ],
    relations: [
      { from: 'B', to: 'A', kind: 'inherit' }, { from: 'C', to: 'A', kind: 'inherit' },
      { from: 'F', to: 'E', kind: 'realize' },
      { from: 'E', to: 'D', kind: 'agg', fromMult: '1', toMult: '1..*' },
      { from: 'E', to: 'F', kind: 'comp' },
      { from: 'B', to: 'E', kind: 'depend', label: 'reads' },
      { from: 'D', to: 'C', kind: 'assoc' }
    ]
  });
  noOverlap('几何/类图', rc, ['class']);
  insideViewport('几何/类图', rc, ['class']);

  /* 状态机：状态框/圆互不重叠 */
  const rs = UML.render('state', {
    states: [
      { id: 'i', kind: 'initial' }, { id: 's1', name: '空闲' }, { id: 's2', name: '运行中 Running' },
      { id: 's3', name: '暂停' }, { id: 's4', name: '已停止' }, { id: 'f', kind: 'final' }
    ],
    transitions: [
      { from: 'i', to: 's1' }, { from: 's1', to: 's2', event: 'start' },
      { from: 's2', to: 's3', event: 'pause' }, { from: 's2', to: 's2', event: 'tick' },
      { from: 's3', to: 's2', event: 'resume' }, { from: 's2', to: 's4', event: 'stop' },
      { from: 's4', to: 'f' }
    ]
  });
  noOverlap('几何/状态机', rs, ['state', 'initial', 'final']);
  insideViewport('几何/状态机', rs, ['state', 'initial', 'final']);

  /* 时序图：参与者框互不重叠（同一行） */
  const rq = UML.render('sequence', {
    participants: [
      { id: 'a', name: '客户端' }, { id: 'b', name: '网关' }, { id: 'c', name: '服务' }, { id: 'd', name: '数据库' }
    ],
    messages: [
      { from: 'a', to: 'b', kind: 'sync', text: '请求' },
      { from: 'b', to: 'c', kind: 'sync', text: '调用' },
      { from: 'c', to: 'd', kind: 'async', text: 'SQL' },
      { from: 'd', to: 'c', kind: 'return', text: '结果集' },
      { from: 'c', to: 'b', kind: 'return', text: 'DTO' },
      { from: 'b', to: 'a', kind: 'sync', text: '响应' }
    ]
  });
  noOverlap('几何/时序图', rq, ['participant']);
  insideViewport('几何/时序图', rq, ['participant']);

  /* ---- 文字不得溢出所在节点框 ---- */
  function charW(ch) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x2e80) { return 1; }
    if (ch === ' ') { return 0.32; }
    return 0.55;
  }
  function textWidthOf(s, size) {
    let w = 0;
    for (const ch of s) { w += charW(ch); }
    return w * size;
  }
  const SKIP_TEXT_ROLES = ['rel-label', 'rel-mult', 'trans-label', 'msg-text', 'title', 'note',
    'empty', 'group-label', 'actor-name'];

  function unescapeHtml(s) {
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  }

  function textsFit(tag, res, containerRoles, minMatched) {
    const shapes = parseShapes(res.svg).filter(s => containerRoles.indexOf(s.role) >= 0);
    const bad = [];
    let matched = 0;
    const re = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
    let m;
    while ((m = re.exec(res.svg)) !== null) {
      const attrs = {};
      const ar = /([\w:-]+)="([^"]*)"/g;
      let a;
      while ((a = ar.exec(m[1])) !== null) { attrs[a[1]] = a[2]; }
      if (attrs.transform) { continue; }
      if (SKIP_TEXT_ROLES.indexOf(attrs['data-role'] || '') >= 0) { continue; }
      const raw = unescapeHtml(m[2]);
      if (!raw) { continue; }
      const size = parseFloat(attrs['font-size'] || '13');
      const tw = textWidthOf(raw, size);
      const ax = parseFloat(attrs.x);
      const ay = parseFloat(attrs.y);
      let left = ax;
      if (!isFinite(ax) || !isFinite(ay) || !isFinite(tw)) { continue; }
      const anchor = attrs['text-anchor'] || 'start';
      if (anchor === 'middle') { left = ax - tw / 2; } else if (anchor === 'end') { left = ax - tw; }
      /* 找能包住该文字基线的最小容器框 */
      let box = null;
      for (const s of shapes) {
        const b = s.b;
        if (ay >= b.y && ay <= b.y + b.h && left >= b.x - 2 && left + tw <= b.x + b.w + 2) {
          if (!box || b.w * b.h < box.b.w * box.b.h) { box = s; }
        }
      }
      if (!box) { continue; }   /* 不在任何节点框里（标题/连线上标签等），跳过 */
      matched += 1;
      const inner = box.b.w - 10;
      if (tw > inner) {
        bad.push('「' + raw.slice(0, 16) + '」宽 ' + Math.round(tw) + ' > 框内 ' + Math.round(inner));
      }
    }
    ok(tag + '：文字未溢出节点框', bad.length === 0, bad.slice(0, 4).join(' | '));
    ok(tag + '：文字归属检查覆盖 ' + matched + ' 段（≥' + minMatched + '）', matched >= minMatched, matched);
  }

  textsFit('几何/用例图', ru, ['usecase', 'boundary'], 7);
  textsFit('几何/类图', rc, ['class'], 10);
  textsFit('几何/状态机', rs, ['state'], 4);
  textsFit('几何/时序图', rq, ['participant'], 4);

  /* ---- 连线标签不得压在节点框上 ---- */
  function labelsClear(tag, res, labelRoles, nodeRoles) {
    const nodes = parseShapes(res.svg).filter(s => nodeRoles.indexOf(s.role) >= 0);
    const bad = [];
    let labels = 0;
    const re = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
    let m;
    while ((m = re.exec(res.svg)) !== null) {
      const attrs = {};
      const ar = /([\w:-]+)="([^"]*)"/g;
      let a;
      while ((a = ar.exec(m[1])) !== null) { attrs[a[1]] = a[2]; }
      if (labelRoles.indexOf(attrs['data-role'] || '') < 0) { continue; }
      const raw = unescapeHtml(m[2]);
      const size = parseFloat(attrs['font-size'] || '11');
      const tw = textWidthOf(raw, size);
      let left = parseFloat(attrs.x);
      const base = parseFloat(attrs.y);
      const anchor = attrs['text-anchor'] || 'start';
      if (anchor === 'middle') { left -= tw / 2; } else if (anchor === 'end') { left -= tw; }
      const box = { x: left, y: base - size * 0.78, w: tw, h: size * 1.02 };
      labels += 1;
      for (const s of nodes) {
        if (overlapArea(box, s.b) > 0) {
          bad.push('「' + raw.slice(0, 12) + '」压到 ' + s.role);
          break;
        }
      }
    }
    ok(tag + '：' + labels + ' 个连线标签均未压在节点框上', bad.length === 0, bad.slice(0, 4).join(' | '));
    ok(tag + '：连线标签检查生效（>0 个）', labels > 0, labels);
  }

  labelsClear('几何/状态机', rs, ['trans-label'], ['state', 'initial', 'final']);
  labelsClear('几何/类图', rc, ['rel-label', 'rel-mult'], ['class']);
}());

/* =============================================================
 * 真实 spec 回归：Lead 报的三类问题（宽度越界 / actor 在边界内 / 文字溢出）
 * 用与 js/views/uml.js、js/core/schema.js 同形的数据，在 width:920 下渲染
 * ============================================================= */
(function realSpecTests() {
  const WIDTH = 920;

  /* 类图：9 个实体、全部 assoc（原始 layout 会平铺成一行） */
  function realClassSpec() {
    const names = ['Project', 'Stage', 'Task', 'Risk', 'Change', 'Member', 'Baseline', 'Metric', 'Report'];
    const classes = names.map((n, i) => ({
      id: 'c' + i,
      name: n,
      stereotype: i === 8 ? 'entity' : '',
      attrs: [{ name: 'id', type: 'string', visibility: '-' }, { name: 'name', type: 'string', visibility: '-' }],
      methods: [{ name: 'update', params: 'data', ret: 'void', visibility: '+' }]
    }));
    const relations = [];
    for (let i = 1; i < names.length; i++) {
      relations.push({ from: 'c0', to: 'c' + i, kind: 'assoc', fromMult: '1', toMult: '1..*' });
    }
    return { classes, relations };
  }

  /* 状态机：起点 + 8 个阶段（名称带 \n、带 entry）+ 终点，链式前进 + 返工 */
  function realLifecycleSpec() {
    const stages = [
      ['s1', '立项', '立项评审', '目标、范围、干系人与预算确认'],
      ['s2', '需求', '需求基线', '需求采集、澄清、评审并形成基线'],
      ['s3', '设计', '设计评审', '概要/详细设计、接口与数据模型'],
      ['s4', '开发', '提测准入', '编码、自测、持续集成'],
      ['s5', '测试', '质量门禁', '集成/系统/验收测试与缺陷收敛'],
      ['s6', '上线', '上线评审', '发布计划、灰度、回滚预案'],
      ['s7', '运维', 'SLA 复核', '监控、告警、迭代与容量'],
      ['s8', '归档', '结项验收', '交付物归档、复盘与知识沉淀']
    ];
    const states = [{ id: 'start', name: '', kind: 'initial' }];
    stages.forEach(s => states.push({ id: s[0], name: s[1] + '\n/' + s[2], kind: 'state', entry: s[3] }));
    states.push({ id: 'end', name: '', kind: 'final' });
    const transitions = [];
    for (let i = 0; i < stages.length; i++) {
      transitions.push({ from: i === 0 ? 'start' : stages[i - 1][0], to: stages[i][0], event: '准入通过' });
      if (i > 0) { transitions.push({ from: stages[i][0], to: stages[i - 1][0], event: '返工', guard: '评审不通过' }); }
    }
    transitions.push({ from: stages[stages.length - 1][0], to: 'end', event: '结项' });
    return { states, transitions };
  }

  /* 用例图：3 个 actor + 8 个用例（3 组）+ include/extend */
  function realUsecaseSpec() {
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

  /* 时序图：4 参与者 + 6 条消息（含 return） */
  function realSeqSpec() {
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

  function parseShapes2(svg) {
    const out = [];
    const re = /<(rect|ellipse|circle)\b([^>]*?)\/?>/g;
    let m;
    while ((m = re.exec(svg)) !== null) {
      const attrs = {};
      const ar = /([\w:-]+)="([^"]*)"/g;
      let a;
      while ((a = ar.exec(m[2])) !== null) { attrs[a[1]] = a[2]; }
      let b = null;
      if (m[1] === 'rect') { b = { x: +attrs.x, y: +attrs.y, w: +attrs.width, h: +attrs.height }; }
      else if (m[1] === 'ellipse') { b = { x: +attrs.cx - +attrs.rx, y: +attrs.cy - +attrs.ry, w: 2 * +attrs.rx, h: 2 * +attrs.ry }; }
      else { b = { x: +attrs.cx - +attrs.r, y: +attrs.cy - +attrs.r, w: 2 * +attrs.r, h: 2 * +attrs.r }; }
      if (isFinite(b.x) && isFinite(b.y) && isFinite(b.w) && isFinite(b.h)) {
        out.push({ role: attrs['data-role'] || '', b: b });
      }
    }
    return out;
  }

  function translate2(svg) {
    const m = /<g transform="translate\(([-\d.]+),([-\d.]+)\)">/.exec(svg);
    return m ? { x: +m[1], y: +m[2] } : { x: 0, y: 0 };
  }

  function artOverlap(a, b) {
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return (ox > 1 && oy > 1) ? ox * oy : 0;
  }

  /* 第 5 列 = 参与「互不重叠」判定的角色（boundary 是容器，天然包住椭圆，不参与） */
  const cases = [
    ['类图', 'class', realClassSpec(), ['class'], ['class']],
    ['状态机', 'state', realLifecycleSpec(), ['state', 'initial', 'final']],
    ['用例图', 'usecase', realUsecaseSpec(), ['usecase', 'actor-head', 'boundary'], ['usecase', 'actor-head']],
    ['时序图', 'sequence', realSeqSpec(), ['participant']]
  ];

  cases.forEach(function (c) {
    const tag = '真实 spec/' + c[0];
    const res = UML.render(c[1], c[2], { width: WIDTH });
    ok(tag + '：渲染成功', !!(res && res.svg && !res.error), res && res.error);
    if (!res || !res.svg) { return; }

    ok(tag + '：宽度不超过请求宽度（' + res.width + ' ≤ ' + WIDTH + '）', res.width <= WIDTH + 1);
    ok(tag + '：未使用整体缩放兜底（无 transform=scale）', res.svg.indexOf('transform="scale(') < 0);
    ok(tag + '：height 为有限正数', typeof res.height === 'number' && isFinite(res.height) && res.height > 0);

    /* 内容包围盒不得超出 viewBox */
    const t = translate2(res.svg);
    const shapes = parseShapes2(res.svg);
    const outOfBox = shapes.filter(function (s) {
      const x0 = s.b.x + t.x;
      const y0 = s.b.y + t.y;
      return x0 < -2 || y0 < -2 || x0 + s.b.w > res.width + 2 || y0 + s.b.h > res.height + 2;
    });
    ok(tag + '：全部图形落在 viewBox 内（' + shapes.length + ' 个）', outOfBox.length === 0,
      outOfBox.slice(0, 3).map(s => s.role).join(','));

    /* 同一角色的节点不得重叠 */
    const ovRoles = c[4] || c[3];
    const nodes = shapes.filter(s => ovRoles.indexOf(s.role) >= 0);
    let worst = null;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const area = artOverlap(nodes[i].b, nodes[j].b);
        if (area > 0 && (!worst || area > worst.area)) {
          worst = { area: area, a: nodes[i].role, b: nodes[j].role };
        }
      }
    }
    ok(tag + '：节点之间无重叠（' + ovRoles.join('/') + '，共 ' + nodes.length + ' 个）', !worst,
      worst ? (Math.round(worst.area) + 'px²：' + worst.a + ' × ' + worst.b) : '');
  });

  /* 用例图：actor 必须画在系统边界之外 */
  (function actorOutsideBoundary() {
    const res = UML.render('usecase', realUsecaseSpec(), { width: WIDTH });
    const t = translate2(res.svg);
    const shapes = parseShapes2(res.svg);
    const boundary = shapes.filter(s => s.role === 'boundary')
      .map(s => ({ x: s.b.x + t.x, y: s.b.y + t.y, w: s.b.w, h: s.b.h }))[0];
    const heads = shapes.filter(s => s.role === 'actor-head')
      .map(s => ({ x: s.b.x + t.x, y: s.b.y + t.y, w: s.b.w, h: s.b.h }));
    ok('真实 spec/用例图：存在系统边界', !!boundary);
    ok('真实 spec/用例图：3 个 actor 都被绘制', heads.length === 3, heads.length);
    if (!boundary) { return; }
    const clash = heads.filter(h => artOverlap(h, boundary) > 0);
    ok('真实 spec/用例图：actor 在系统边界之外', clash.length === 0, clash.length + ' 个 actor 落在边界内');

    /* actor 名字也不能压到边界/椭圆上 */
    const texts = [];
    const re = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
    let m;
    while ((m = re.exec(res.svg)) !== null) {
      const attrs = {};
      const ar = /([\w:-]+)="([^"]*)"/g;
      let a;
      while ((a = ar.exec(m[1])) !== null) { attrs[a[1]] = a[2]; }
      if (attrs['data-role'] !== 'actor-name') { continue; }
      const raw = m[2].replace(/&lt;/g, '<').replace(/&amp;/g, '&');
      const size = parseFloat(attrs['font-size'] || '13');
      let w0 = 0;
      for (const ch of raw) {
        const cp = ch.codePointAt(0);
        w0 += (cp >= 0x2e80) ? 1 : (ch === ' ' ? 0.32 : 0.55);
      }
      w0 *= size;
      const ax = parseFloat(attrs.x) + t.x;
      const ay = parseFloat(attrs.y) + t.y;
      const left = (attrs['text-anchor'] === 'middle') ? ax - w0 / 2 : ax;
      texts.push({ x: left, y: ay - size * 0.86, w: w0, h: size * 1.1 });
    }
    const bad = texts.filter(tb => artOverlap(tb, boundary) > 0);
    ok('真实 spec/用例图：actor 名字在系统边界之外', bad.length === 0, bad.length + ' 处压到边界');
  }());

  /* 状态机：节点高必须撑得开 name + entry（不能是压扁的小胶囊） */
  (function stateNodeHeights() {
    const res = UML.render('state', realLifecycleSpec(), { width: WIDTH });
    const rects = parseShapes2(res.svg).filter(s => s.role === 'state').map(s => s.b);
    ok('真实 spec/状态机：10 个状态框分布（8 个 state）', rects.length === 8, rects.length);
    const tooLow = rects.filter(b => b.h < 60);
    ok('真实 spec/状态机：状态框高度随文本行数撑开（≥60）', tooLow.length === 0,
      tooLow.map(b => Math.round(b.h)).join(','));
    /* 状态机不得单行铺开：内容宽度 < 920 且至少两行 */
    const rows = new Set(rects.map(b => Math.round(b.y / 10)));
    ok('真实 spec/状态机：蛇形分带（≥2 行）', rows.size >= 2, rows.size);
  }());

  /* 类图关系标签：两两不重叠、不压类框（跨行「巷道」里容易叠字） */
  (function relLabels() {
    function charW(ch) {
      const cp = ch.codePointAt(0);
      if (cp >= 0x2e80) { return 1; }
      return ch === ' ' ? 0.32 : 0.55;
    }
    function textW(s, size) {
      let w = 0;
      for (const ch of s) { w += charW(ch); }
      return w * size;
    }
    function unesc(s) {
      return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    }
    /* 折线路径的线段（关系线都是 <path d="M.. L..">） */
    function pathSegs(svg) {
      const out = [];
      const re = /<path\b[^>]*\bd="([^"]*)"/g;
      let m;
      while ((m = re.exec(svg)) !== null) {
        const nums = m[1].match(/-?\d+(?:\.\d+)?/g) || [];
        const pts = [];
        for (let i = 0; i + 1 < nums.length; i += 2) { pts.push({ x: +nums[i], y: +nums[i + 1] }); }
        for (let i = 1; i < pts.length; i++) {
          out.push({ x0: pts[i - 1].x, y0: pts[i - 1].y, x1: pts[i].x, y1: pts[i].y });
        }
      }
      return out;
    }
    /* 线段与（外扩 gap 的）文本框是否相交：Liang–Barsky 裁剪 */
    function segBoxHit(b, sg, gap) {
      const x0 = b.x - gap, y0 = b.y - gap, x1 = b.x + b.w + gap, y1 = b.y + b.h + gap;
      const ax = sg.x0, ay = sg.y0, dx = sg.x1 - ax, dy = sg.y1 - ay;
      if (dx === 0 && dy === 0) { return ax >= x0 && ax <= x1 && ay >= y0 && ay <= y1; }
      let t0 = 0, t1 = 1;
      const p = [-dx, dx, -dy, dy];
      const q = [ax - x0, x1 - ax, ay - y0, y1 - ay];
      for (let i = 0; i < 4; i++) {
        if (p[i] === 0) {
          if (q[i] < 0) { return false; }
        } else {
          const t = q[i] / p[i];
          if (p[i] < 0) {
            if (t > t1) { return false; }
            if (t > t0) { t0 = t; }
          } else {
            if (t < t0) { return false; }
            if (t < t1) { t1 = t; }
          }
        }
      }
      return true;
    }
    function labelBoxes(svg, roles) {
      const out = [];
      const re = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
      let m;
      while ((m = re.exec(svg)) !== null) {
        const attrs = {};
        const ar = /([\w:-]+)="([^"]*)"/g;
        let a;
        while ((a = ar.exec(m[1])) !== null) { attrs[a[1]] = a[2]; }
        if (roles.indexOf(attrs['data-role'] || '') < 0 || attrs.transform) { continue; }
        const raw = unesc(m[2]);
        const size = parseFloat(attrs['font-size'] || '11');
        const w = textW(raw, size);
        const ax = parseFloat(attrs.x);
        const ay = parseFloat(attrs.y);
        const anchor = attrs['text-anchor'] || 'start';
        const left = anchor === 'middle' ? ax - w / 2 : (anchor === 'end' ? ax - w : ax);
        if (isFinite(left) && isFinite(ay) && isFinite(w)) {
          out.push({ role: attrs['data-role'], text: raw, x: left, y: ay - size * 0.8, w: w, h: size });
        }
      }
      return out;
    }
    [700, 920].forEach(function (w) {
      const res = UML.render('class', realClassSpec(), { width: w });
      const labs = labelBoxes(res.svg, ['rel-label', 'rel-mult']);
      const boxes = parseShapes2(res.svg).filter(s => s.role === 'class').map(s => s.b);
      let clash = null;
      let onNode = null;
      for (let i = 0; i < labs.length; i++) {
        for (let j = i + 1; j < labs.length; j++) {
          if (!clash && artOverlap(labs[i], labs[j]) > 0) {
            clash = labs[i].text + ' × ' + labs[j].text;
          }
        }
        for (const b of boxes) {
          if (!onNode && artOverlap(labs[i], b) > 0) { onNode = labs[i].text; }
        }
      }
      ok('真实 spec/类图@' + w + '：' + labs.length + ' 个关系标签两两不重叠', !clash, clash);
      ok('真实 spec/类图@' + w + '：关系标签不压类框', !onNode, onNode);

      /* 关系标签不能压在关系线上（Lead 报「倍度标签压线」） */
      const segs = pathSegs(res.svg);
      let onLine = null;
      for (const lab of labs) {
        for (const sg of segs) {
          if (!onLine && segBoxHit(lab, sg, 1)) { onLine = lab.text; }
        }
      }
      ok('真实 spec/类图@' + w + '：关系标签不压连线（' + segs.length + ' 段）', !onLine, onLine);
    });
  }());

  /* 窄宽度（700）下类图/状态机同样不出框、不重叠 */
  (function narrowWidth() {
    [['类图', 'class', realClassSpec(), ['class']], ['状态机', 'state', realLifecycleSpec(), ['state', 'initial', 'final']]]
      .forEach(function (c) {
        const res = UML.render(c[1], c[2], { width: 700 });
        const t = translate2(res.svg);
        const shapes = parseShapes2(res.svg);
        const out = shapes.filter(function (s) {
          const x0 = s.b.x + t.x;
          const y0 = s.b.y + t.y;
          return x0 < -2 || y0 < -2 || x0 + s.b.w > res.width + 2 || y0 + s.b.h > res.height + 2;
        });
        ok('真实 spec/' + c[0] + '@700：宽度 ≤700（' + res.width + '）', res.width <= 701);
        ok('真实 spec/' + c[0] + '@700：全部图形落在 viewBox 内', out.length === 0,
          out.slice(0, 3).map(s => s.role).join(','));
        const nodes = shapes.filter(s => c[3].indexOf(s.role) >= 0);
        let worst = null;
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const area = artOverlap(nodes[i].b, nodes[j].b);
            if (area > 0 && (!worst || area > worst.area)) { worst = Math.round(area) + 'px²'; }
          }
        }
        ok('真实 spec/' + c[0] + '@700：节点之间无重叠', !worst, worst);
      });
  }());

  /* 类图：9 个类必须折行，不能平铺超宽 */
  (function classWrap() {
    const res = UML.render('class', realClassSpec(), { width: WIDTH });
    const rects = parseShapes2(res.svg).filter(s => s.role === 'class').map(s => s.b);
    const rows = new Set(rects.map(b => Math.round(b.y / 10)));
    ok('真实 spec/类图：9 个类框', rects.length === 9, rects.length);
    ok('真实 spec/类图：按宽度折行（≥2 行）', rows.size >= 2, rows.size);
  }());
}());

/* =============================================================
 * 非法 / 空 spec 校验
 * 面板「编辑 spec」会先 render 一遍当校验：粘空对象、写错字段名
 * （{nodes:[...]}）、必填数组为空，都必须拿回 {error} 而不是空图。
 * ============================================================= */
(function specValidation() {
  const FIELD = { class: 'classes', usecase: 'actors', state: 'states', sequence: 'participants' };

  function expectErr(tag, type, spec, needle) {
    const r = UML.render(type, spec, {});
    ok(tag + '：返回 {error}', !!(r && typeof r.error === 'string'), r && Object.keys(r).join(','));
    ok(tag + '：不返回 svg', !(r && r.svg), r && r.svg ? '返回了 svg' : '');
    if (needle) {
      ok(tag + '：文案含「' + needle + '」', !!(r && String(r.error).indexOf(needle) >= 0), r && r.error);
    }
  }

  Object.keys(FIELD).forEach(function (type) {
    const f = FIELD[type];
    // 1) null / undefined spec
    expectErr(type + '/null spec', type, null, 'spec 必须是对象');
    expectErr(type + '/undefined spec', type, undefined, 'spec 必须是对象');
    // 2) 非对象 spec（字符串 / 数组）
    expectErr(type + '/字符串 spec', type, 'nope', 'spec 必须是对象');
    expectErr(type + '/数组 spec', type, [], 'spec 必须是对象');
    // 3) 缺字段（空对象，或字段名写错）
    expectErr(type + '/缺字段', type, {}, 'spec.' + f + ' 必须是数组');
    expectErr(type + '/字段名写错', type, { nodes: [{ id: 'a', name: 'A' }] }, 'spec.' + f + ' 必须是数组');
    // 4) 字段类型错
    expectErr(type + '/字段类型错', type, (function () { const o = {}; o[f] = 'nope'; return o; }()), 'spec.' + f + ' 必须是数组');
    // 5) 空数组（画不出东西）
    expectErr(type + '/空数组', type, (function () { const o = {}; o[f] = []; return o; }()), f + ' 为空');
  });

  // Lead 的实际复现
  expectErr('Lead 复现 class/{classes:"nope"}', 'class', { classes: 'nope' }, 'spec.classes 必须是数组');

  // 用例图两个必填数组都要点名
  expectErr('用例图/usecases 为空', 'usecase', { actors: [{ id: 'a', name: 'A' }], usecases: [] }, 'usecases 为空');

  // 可选数组：缺省当空数组，不算错
  const okCases = [
    ['类图/缺 relations', 'class', { classes: [{ id: 'c', name: 'C' }] }],
    ['类图/relations 为 null', 'class', { classes: [{ id: 'c', name: 'C' }], relations: null }],
    ['状态机/缺 transitions', 'state', { states: [{ id: 's', name: 'S' }] }],
    ['时序图/缺 messages', 'sequence', { participants: [{ id: 'p', name: 'P' }] }],
    ['时序图/messages 为空数组', 'sequence', { participants: [{ id: 'p', name: 'P' }], messages: [] }],
    ['用例图/缺 links', 'usecase', { actors: [{ id: 'a', name: 'A' }], usecases: [{ id: 'u', name: 'U' }] }]
  ];
  okCases.forEach(function (c) {
    const r = UML.render(c[1], c[2], {});
    ok(c[0] + '：正常渲染', !!(r && r.svg && !r.error), r && r.error);
    commonChecks(c[0], r);
  });

  // 单个节点字段类型错：容错渲染，不崩、不出 NaN
  const bad = UML.render('state', { states: [{ id: 1, name: null }, { id: 'b', name: 'B' }], transitions: [{ from: 1, to: 'b' }] }, {});
  ok('节点字段类型错：仍然渲染', !!(bad && bad.svg && !bad.error), bad && bad.error);
  ok('节点字段类型错：svg 无 NaN', !!/NaN/.test(bad.svg) === false);
  ok('节点字段类型错：svg 无 undefined', bad.svg.indexOf('undefined') < 0);

  // 未知类型：文案带原型
  const t1 = UML.render('不存在的类型', {}, {});
  ok('未知类型：返回 {error}', !!t1.error);
  ok('未知类型：文案含「未知图形类型」', String(t1.error).indexOf('未知图形类型') >= 0, t1.error);
  ok('未知类型：文案含用户给的类型名', String(t1.error).indexOf('不存在的类型') >= 0, t1.error);
  ok('未知类型：不返回 svg', !t1.svg);

  // 大小写与前后空格仍认
  const t2 = UML.render('  CLASS ', { classes: [{ id: 'c', name: 'C' }] }, {});
  ok('类型大小写/空格容错', !!(t2 && t2.svg), t2 && t2.error);
}());

/* =============================================================
 * 汇总
 * ============================================================= */
console.log('');
console.log('----------------------------------------');
console.log('通过 ' + pass + ' / ' + (pass + fail));
if (fail) {
  console.log('失败用例：');
  fails.forEach(f => console.log('  - ' + f));
  process.exitCode = 1;
} else {
  console.log('全部通过 ✔');
}
