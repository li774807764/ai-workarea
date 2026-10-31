# 模块契约（CONTRACT）

本文件是各模块之间的**唯一接口约定**。任何模块不得依赖契约之外的东西。

## 0. 硬约束

- **零依赖、零构建**：不用 CDN、不用 npm、不用打包工具。所有文件是原生 `<script>`，以普通 `<script src>` 顺序加载，可 `file://` 直接双击打开。
- 每个 js 文件都是一个 IIFE，只向 `window` 挂**一个**约定的全局名。
- 文件必须 UTF-8 无 BOM，`\n` 换行。注释用中文。
- 不写 `debugger`、不写 `console.log` 噪音（只允许 `console.warn/error` 记录异常）。
- 不得访问网络（`fetch`/XHR 全禁）。数据只走 `localStorage`。
- 深色/浅色主题用 CSS 变量，**目录中不得写死颜色**（SVG 用 `var(--... )` 或 `currentColor`，见 §5）。

## 1. 全局命名

| 全局 | 文件 | 说明 |
| --- | --- | --- |
| `PLM.bus` | `js/core/bus.js` | 事件总线 |
| `PLM.util` | `js/core/util.js` | 工具函数 |
| `PLM.schema` | `js/core/schema.js` | 实体/字段元模型（驱动 CRUD 与类图） |
| `PLM.store` | `js/core/store.js` | 状态、持久化、撤销 |
| `PLM.ui` | `js/core/ui.js` | 通用 UI（toast/modal/表单生成） |
| `PLM.registry` | `js/core/registry.js` | 视图与阶段扩展点 |
| `PLM_UML` | `js/uml/uml.js` | UML 渲染器（见 §4） |
| `PLM_ENGINE` | `js/engine/rules.js` | 预警规则引擎（见 §6） |
| `PLM_REPORT` | `js/engine/report.js` | 报告/导出（见 §7） |
| `PLM.views` | `js/views/*.js` | 各视图，`PLM.views.dashboard` 等 |

## 2. 状态形状（storage v1）

```js
state = {
  version: 1,
  meta: { name: '智能项目全生命周期管理面板', createdAt: ISO, updatedAt: ISO, theme: 'dark'|'light' },
  config: {
    stages: [ Stage ],          // 生命周期阶段，来自 PLM.schema.stages，可被用户改
    workHoursPerDay: 6,
    warnDaysBeforeDue: 3,
    wipLimit: 6,
    stallDays: 14,
    changePendingDays: 7,
    milestoneSoonDays: 7,
    milestoneMinProgress: 80
    // ↑ 与 js/engine/rules.js 的 DEFAULTS 对齐；store.emptyState 里写的是同值常量（store 先于引擎加载）
  },
  projects: [Project], tasks: [Task], risks: [Risk], changes: [Change],
  milestones: [Milestone], deliverables: [Deliverable], members: [Member],
  diagrams: [Diagram], logs: [Log]
}
```

ID 规则：`PLM.util.uid('p')` → `p_lq3k9s2a`。所有实体必有 `id`、`createdAt`、`updatedAt`。

### 实体字段（权威定义在 `js/core/schema.js`，此处仅关键项）

- **Project**：`code, name, owner(memberId), sponsor, stageId, priority(P0..P3), startDate, dueDate, budget, description, tags[], status('active'|'paused'|'done'|'archived')`. 无 `progress` 字段——由任务完成率派生计算。
- **Task**：`projectId, title, stageId, status('todo'|'doing'|'review'|'done'), assignee, estimate(人天), dueDate, order`.
- **Risk**：`projectId, title, category, probability(1-5), impact(1-5), mitigation, owner, status('open'|'mitigating'|'closed')`. 等级 `level` 由 `P×I` 派生：≥15 高、≥8 中、else 低。
- **Change**：`projectId, title, reason, impact, status('proposed'|'approved'|'rejected')`, `decidedAt`.
- **Milestone**：`projectId, title, dueDate, status('pending'|'met'|'missed')`.
- **Deliverable**：`projectId, name, kind, version, reviewer, status('draft'|'in_review'|'accepted')`.
- **Member**：`name, role, capacity(人天/周), email`.
- **Diagram**：`projectId|null, type('usecase'|'class'|'state'|'sequence'), name, spec`（spec 见 §4），`source('manual'|'auto')`.
- **Log**：`at, entity, entityId, action, detail`.

## 3. 核心 API（由 Lead 提供，其他人只调用）

```js
PLM.bus.on(evt, fn) / PLM.bus.off(evt, fn) / PLM.bus.emit(evt, payload)
// 事件：'state:change'、'view:enter'、'view:leave'、'toast'

PLM.util.uid(prefix)                 // 'p_x9f2k1'
PLM.util.today()                     // 'YYYY-MM-DD'
PLM.util.addDays(dateStr, n)         // 'YYYY-MM-DD'
PLM.util.daysBetween(a, b)           // b - a，天，可为负
PLM.util.fmtDate(s) / PLM.util.fmtMoney(n) / PLM.util.esc(html)
PLM.util.clone(o)                    // structuredClone 兜底 JSON
PLM.util.byId(arr, id)
PLM.util.sum(arr, fn) / PLM.util.groupBy(arr, fn)
PLM.util.download(filename, text, mime?)   // 触发本地下载
PLM.util.svgToPng(svgText, cb)             // 可选，异步

PLM.store.state                      // 只读快照
PLM.store.get()                      // = state
PLM.store.commit(label, mutator)     // mutator(draft) 里改，自动持久化 + 广播 + 记 log
PLM.store.save() / PLM.store.saveNow()
PLM.store.dump()                     // JSON 字符串
PLM.store.restore(jsonText)          // { ok:boolean, error?:string }
PLM.store.reset()                    // 恢复示例数据
PLM.store.undo() / PLM.store.redo() / PLM.store.canUndo()
PLM.store.derive(project)            // { progress, health, taskStats, riskScore, overdue }

PLM.ui.el(tag, attrs, children?)     // 'div'，attrs 含 class/text/on.click/dataset
PLM.ui.toast(msg, kind?)             // kind: 'ok'|'warn'|'err'
PLM.ui.modal({ title, body, actions:[{label, kind, onClick}] })
PLM.ui.confirm(text) -> Promise<boolean>
PLM.ui.drawer({ title, body })       // 右侧抽屉
PLM.ui.field(fieldDef, value)        // 依 schema 生成单个输入控件，返回 { el, read() }

PLM.registry.addView({ id, title, icon, order, render(root, ctx) })
PLM.registry.views()                 // 已注册视图（按 order）
PLM.registry.addStage({ id, name, ... })
```

**渲染约定**：每个 view 的 `render(root, ctx)` 拿到一个空的 `<div class="view">`，自己往里塞 DOM，返回可选的清理函数。视图**不要**直接 `localStorage`、不要改别的视图 DOM。

## 4. UML 渲染器契约（`js/uml/uml.js`）

```js
window.PLM_UML = {
  VERSION: '1.0.0',
  types: ['usecase', 'class', 'state', 'sequence'],
  render(type, spec, opts) -> { svg: string, width: number, height: number } | { error: string }
}
```

- `opts` 可选：`{ width, title }`；`svg` 必须自带 `viewBox`、`xmlns`、`font-family`，**无外链**，可直接 `innerHTML` 插入。
- 所有颜色用 CSS 变量：`var(--uml-line,#64748b)`、`var(--uml-fill,#1e293b)`、`var(--uml-text,#e2e8f0)`、`var(--accent,#38bdf8)` 等，缺失时回落到给定默认值（`var(--x, fallback)` 必须带 fallback，保证在 `<img>` 或导出时也能看）。
- 布局自己算：网格/分层自动排布（先算尺寸再画），不做随机位置。文本按字符宽度粗估（中文 1em、英文 0.55em）换行，避免溢出。
- **不允许抛异常**：捕获后返回 `{ error:'...' }`。

### 4.1 spec 结构

**用例图 usecase**
```js
{ actors: [{id, name}], usecases: [{id, name, group?}],
  links: [{from, to, kind:'assoc'|'include'|'extend'|'general'}] }
```
画法：左侧/右侧小人 + 中间系统边界矩形（`boundary` 可选标题），用例椭圆；`include`/`extend` 虚线箭头带 `«include»`/`«extend»` 标签。

**类图 class**
```js
{ classes: [{id, name, stereotype?, attrs:[{name, type?, visibility?:'+'|'-'|'#'}],
             methods:[{name, params?, ret?, visibility?}], note?}],
  relations: [{from, to, kind:'assoc'|'agg'|'comp'|'inherit'|'realize'|'depend',
               label?, fromMult?, toMult?}] }
```
画法：三分栏矩形（名称/属性/方法），继承实线空心三角、实现虚线空心三角、聚合空心菱形、组合实心菱形、依赖虚线箭头。

**状态机 state**
```js
{ states: [{id, name, kind:'initial'|'state'|'final', entry?, action?, x?, y?}],
  transitions: [{from, to, event?, guard?, action?}] }
```
画法：圆角矩形（initial 实心圆、final 双圆），箭头走正交折线，标签 `事件 [守卫] / 动作`。允许横排蛇形布局。

**时序图 sequence**
```js
{ participants: [{id, name}], messages: [{from, to, kind:'sync'|'async'|'return', text}] }
```
画法：顶部生命线方框 + 虚线生命线，消息按数组顺序从上往下，返回用虚线箭头。

## 5. CSS 变量（主题）

`--bg, --bg-2, --panel, --panel-2, --border, --text, --text-dim, --text-mute, --accent, --accent-2, --ok, --warn, --err, --uml-line, --uml-fill, --uml-text`
由 `css/app.css` 在 `:root` / `[data-theme=light]` 定义。**新模块只能引用，不得定义全局变量。**

## 6. 预警引擎（`js/engine/rules.js`）

```js
window.PLM_ENGINE = {
  registerRule(rule),            // { id, name, scope, level?, test(ctx) -> finding|null }
  rules(),                        // 已注册规则
  evaluate(state, opts) -> Finding[],
  defaultRules                     // 内置规则数组
}
// Finding = { id, ruleId, level:'high'|'mid'|'low', projectId, entity:'project'|'task'|'risk'|'milestone'|'deliverable'|'change',
//            entityId, title, detail, suggestion }
```
- `ctx = { state, now(ISO), today('YYYY-MM-DD'), derive(project), config }`，`derive` 由 store 提供同款计算。
- 规则必须**纯函数**、不抛异常（`evaluate` 会 try/catch 每条）。
- 内置规则至少 7 条（逾期任务、阶段停滞、高风险未缓解、变更未决、里程碑逼近/错过、交付物未验收、WIP 超限、项目无负责人等），阈值取 `state.config`。

## 7. 报告与导出（`js/engine/report.js`）

```js
window.PLM_REPORT = {
  weekly(state, opts) -> string      // Markdown 周报
  projectSummary(state, projectId) -> string
  toCSV(rows, columns) -> string     // 带 BOM 的 UTF-8 CSV
  toMarkdownTable(rows, columns) -> string
}
```

## 8. 失败处理

- 任何模块初始化失败只能 `console.error` 并在页面留痕，**不得让整页白屏**：`index.html` 对每个视图 `render` 做 try/catch，失败时在该视图内显示错误卡片。
- `PLM_UML.render` / `PLM_ENGINE.evaluate` / `PLM_REPORT.*` 被调用时若未加载，调用方负责降级文案。

## 9. 视图层补充约定（实现期新增，已落地）

### 9.1 加载顺序（`index.html`，顺序不可换）

```
js/core/bus.js → util.js → schema.js → store.js → ui.js → registry.js
js/engine/rules.js → js/engine/report.js
js/uml/uml.js
js/data/seed.js
js/views/table.js → dashboard.js → projects.js → kanban.js → uml.js → risks.js → reports.js → settings.js
js/app.js
```
`registry.addRule()` 在 `PLM_ENGINE` 之前调用会排队，`index.html` 末尾与 `load` 事件各 `flushRules()` 一次。

### 9.2 `PLM.crud`（`js/views/table.js`）—— 所有台账表格/表单复用

```js
PLM.crud.table({ entityKey, rows, columns?, onRowClick?, rowActions?, emptyText? }) -> Element
PLM.crud.openForm(entityKey, obj|null, { projectId?, preset?, onSaved? }) -> modal
PLM.crud.removeEntity(entityKey, id, { onSaved? })        // confirm + 级联
PLM.crud.renderCell(entityKey, item, fieldDef) -> Node
PLM.crud.labelOf(fieldDef, value) -> string
PLM.crud.CASCADE                                          // project → tasks/risks/changes/milestones/deliverables
```
- 表格列默认取 `schema.tableColumns(entityKey)`；`columns: [{ key, label, render?(item), width? }]` 覆盖。
- 表单默认值顺序：字段 `defaultValue` → `preset` → `projectId` 注入。

### 9.3 `PLM.app`（`js/app.js`）—— 外壳与跨视图动作

```js
PLM.app = {
  go(viewId, params?),        // 路由到 #/view?k=v
  openProject(id),            // 打开项目详情抽屉（PLM.projectDetail.open）
  alerts(),                   // 1500ms 缓存；PLM_ENGINE.evaluate(state,{derive:store.derive})
  refresh(),                  // 重绘当前视图 + 顶栏
  exportJSON(), importJSON(), resetSeed(), clearData(),
  toggleTheme(), mount()
}
PLM.projectDetail = { open(projectId) }   // js/views/projects.js 暴露
```
- 路由 hash 形如 `#/projects?stage=dev`；视图 `render(root, params)`，`root` 是 `.view-root` 内的新容器。
- 卸载视图时派发 `plm:dispose`（视图用它 `store.subscribe` 退订，避免重复绑定）。
- 单视图渲染异常由 `app.js` 捕获并显示错误卡片 + 重试按钮；不得白屏。

### 9.4 字段命名速查（视图/导出/引擎必须一致）

| 实体 | 负责人字段 | 备注 |
| --- | --- | --- |
| project | `owner` | 派生字段 `progress`/`health` 不入库 |
| task | `assignee` | 状态 `todo/doing/review/done`，`doneAt` |
| risk | `owner` | 分值 = `probability × impact`（≥15 高、≥8 中） |
| change | `requestedBy` | 状态 `proposed/approved/rejected` |
| deliverable | `reviewer` | 状态 `draft/in_review/accepted` |

> 踩坑记录：早期视图误用 `ownerId`，导致「负责人」整列显示「未指派」。改字段时以 `js/core/schema.js` 为准。
