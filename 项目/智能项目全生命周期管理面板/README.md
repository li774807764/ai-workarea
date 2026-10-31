# 智能项目全生命周期管理面板

一个**零依赖、零构建、可离线**的项目全生命周期管控中枢。双击 `index.html` 就能用，数据存在本机浏览器里，不联网、不上报、不需要装任何东西。

核心特征：**UML 建模**（用例 / 类 / 状态机 / 时序，全部手写 SVG 渲染）+ **阶段门禁**（8 阶段生命周期）+ **智能预警**（11 条内置规则）+ **本地可扩展**（新增字段、阶段、规则、视图都只改一处）。

---

## 一、怎么打开

**方式一（推荐）**：双击 `index.html`。`file://` 直接可用，所有脚本都是相对路径、无 CDN。

**方式二**：放到任意静态服务器（IIS / nginx / `python -m http.server`）下访问。两种方式功能一致。

> 首次打开会自动写入 12 个示例项目（含任务、风险、变更、里程碑、交付物、4 张 UML 图）。想从空白开始：设置与扩展 → 数据管理 → **清空数据**。

浏览器要求：任意现代 Chromium / Firefox / Safari（用了 CSS 变量、`color-mix()`、HTML5 拖拽、`<details>`）。建议窗口宽度 ≥ 1280px；< 880px 时侧栏收成抽屉。

---

## 二、七个工作区

| 视图 | 作用 | 关键交互 |
| --- | --- | --- |
| **总览** | 5 张指标卡、生命周期漏斗、风险矩阵、预警 Top7、健康度榜、最近动态 | 点漏斗进阶段筛选、点预警开项目详情 |
| **项目台账** | 12 列台账 + 阶段/状态/搜索筛选；行内看进度与健康度 | 点行开详情抽屉：八段阶段条、健康度扣分原因、下属任务/风险/变更/里程碑/交付物；「推进到下一阶段」写 `stageEnteredAt` |
| **任务看板** | 四列（待开始/进行中/待验收/已完成）拖拽流转 | 拖卡片改状态（落盘 + 记录 `doneAt`）；进行中超 `wipLimit` 列头变红；列头 `+` 就地新建 |
| **UML 建模** | 四类图：用例 / 类 / 状态机 / 时序。类图与状态机支持**从当前数据自动生成** | 缩放 40%–200%、导出 SVG / PNG、编辑 JSON spec（先校验再保存）、↻ 重新生成 |
| **风险与变更** | 5×5 风险矩阵（点击格子筛选）、高风险缓解建议、风险台账、变更控制表 | 「只看未关闭」开关；矩阵格 = 概率×影响，≥15 红 / ≥8 黄 |
| **报告中心** | 周报（Markdown 直出）、单项目摘要、预警清单、数据导出 | 复制 Markdown、下载 `.md`、导出带 BOM 的 CSV（Excel 直接打开不乱码） |
| **设置与扩展** | 主题、7 项阈值、阶段模型、规则清单、数据管理、扩展点说明 | 改阈值立刻影响预警；导入/导出整份 JSON；恢复示例 / 清空 |

---

## 三、生命周期与门禁

八个阶段（可在 `js/core/schema.js` 里改；运行时也能用 `PLM.registry.addStage()` 插）：

```
立项 init → 需求 req → 设计 design → 开发 dev → 测试 qa → 上线 release → 运维 ops → 归档 archive
```

每个阶段带一个**门禁**（gate），状态机图里就画成「准入通过 / 评审不通过返工」的双向边。项目详情里的八段条会标出已完成、当前、未开始；`stageEnteredAt` 进阶段时间被用来算「阶段停滞多少天」。

---

## 四、智能预警怎么算

规则引擎在 `js/engine/rules.js`，`PLM_ENGINE.evaluate(state)` 逐条跑、每条独立 try/catch、结果按 high → mid → low 排序、上限 200 条。每条 Finding 都带**可执行的下一步建议**（不是"有风险，请注意"这种废话）。

内置 11 条：

| 规则 id | 触发 | 默认阈值 |
| --- | --- | --- |
| `task.overdue` | 任务过了截止日仍未完成 | 超 7 天升级为 high |
| `stage.stall` | 阶段内任务 N 天没动 | `stallDays = 14` |
| `risk.highUnmitigated` | 概率×影响 ≥ 15 且未缓解 | 15 |
| `change.pending` | 变更提了 N 天没决策 | `changePendingDays = 7` |
| `milestone.approaching` | 里程碑临近但进度不够 | `milestoneSoonDays = 7`、`milestoneMinProgress = 80` |
| `milestone.missed` | 里程碑已过、未达成 | — |
| `deliverable.unaccepted` | 上线后交付物仍无验收人签收 | — |
| `wip.overLimit` | 单人/单列并行任务超限 | `wipLimit = 6` |
| `project.noOwner` | 项目没有负责人 | — |
| `project.overdue` | 项目整体超期 | — |
| `project.noTasks` | 项目在管但一条任务都没有 | — |

阈值都在 `state.config` 里，设置页可直接改，改完立即生效（预警缓存 1.5s）。

**健康度**（0–100，`store.derive()` 计算，非入库字段）：逾期任务每个 −6（最多 −30）、项目超期 −20、高风险未缓解每个 −10（最多 −25）、阶段停滞 >14 天 −10、上线后交付物未验收每个 −8（最多 −20）、无负责人 −15、无任务 −10。≥80 健康 / ≥60 关注 / 其余危险。

---

## 五、UML 模式

四个渲染器全部手写 SVG，颜色一律走 `var(--x, fallback)`，所以**深色/浅色主题切换时图会跟着变**，且导出的 SVG 拿到别处也能正常显示。

| 图 | 数据来源 | 说明 |
| --- | --- | --- |
| 用例图 | 手工 spec（含 `«include»` / `«extend»`） | 参与者画在系统边界外，用例按分组排列 |
| 类图 | **由 schema 元模型自动生成** | 每个实体 = 一个类（字段带类型），每个 `ref` 字段 = 一条关联（`1` 端 → `0..*` 端） |
| 状态机图 | 自动（生命周期 8 阶段）或手工（任务四态） | 支持 initial / final / entry 动作 / guard / 自环；自动生成时按蛇形折列排版 |
| 时序图 | 手工 spec | 生命线 + 同步/异步/返回三种箭头 |

**关键点**：类图不是画出来的，是 `schema.toClassSpec()` 从元模型推出来的。所以你新增一个实体（下面的扩展第 1 条），类图、表单、表格、校验会**同时**更新。

面板里的自动类图用的是精简签名 `schema.toClassSpec({ methods: false, maxAttrs: 8 })`——不画 CRUD 方法、每个类只画前 8 个属性（多的用 `…` 折起），这样一张图在 900px 宽内能排成两行三列、文字不打架。想看完整字段就自己在 spec 编辑器里加，或者直接调 `schema.toClassSpec()`（无参 = 全字段 + 方法）。

导出：`导出 SVG`（矢量，可进 PPT/Visio）、`导出 PNG`（2× 像素密度，便于贴文档）。

画布会按容器宽度重新排版（宽度夹在 520–1100 之间），换图或改 spec 后自动「适应」到刚好放下整张图，也可以手动 `− / +`（40%–200%）或点「适应」。

自动图（类图 / 生命周期状态机 / 任务状态机）存的是 `source: 'auto'` + `autoKind`，**点一次「从当前数据生成」是原地刷新、不会堆出第二张**；类图如果还没有 spec，会直接按 `schema` 现算，所以它永远跟着元模型长。深链可以直接指定图：`index.html#/uml?kind=class`（可选 `class` / `lifecycle` / `task`），或 `#/uml?diagram=<图 id>`。
`渲染` 对坏输入是**报错而不是画空图**：`PLM_UML.render()` 在类型不认识、spec 不是对象、必填数组缺失/写错字段名、数组为空这几种情况下返回 `{ error: '中文原因' }`，画布上会用红字提示，spec 编辑器也会当场拦下来（"校验不通过：…"）。所以粘错 JSON 存不进去，也就不会出现"存了但一片空白"。空图（用户自己把节点删光）算「没有内容」的占位提示，不算错误。

---

## 六、本地存储与数据安全

- 存储键 `plm.panel.v1`，`localStorage`，`{ version, meta, config, projects, tasks, risks, changes, milestones, deliverables, members, diagrams, logs }`。
- **所有写入只走** `store.commit(label, mutator, meta)`：深拷贝草稿 → 改 → 入栈撤销（上限 40 步）→ 落盘 → 广播 `state:change`。撤销/重做是整份状态快照，所以任何操作都能退回去。
- 350ms 防抖落盘，顶栏「已保存 / 保存中…」是真实状态。
- 操作日志（`logs`，保留 400 条）就是总览页的"最近动态"。
- 存储层是**可替换适配器**：`PLM.store.setAdapter({ get, set, remove })`，将来换 IndexedDB / 本地文件 / 远端同步只实现这三个方法，业务代码零改动。
- 设置页可以导出整份 JSON 做备份，也可以导入还原（导入前会 `normalize()`，字段缺失/类型不对都会兜底）。

> 注意：`localStorage` 按「浏览器 + 文件路径」隔离。换浏览器、换目录、清缓存都会丢数据。**重要数据请定期导出 JSON。**

---

## 七、怎么扩展（这是"可扩展"的具体含义）

### 1. 加字段 / 加实体 —— 只改 `js/core/schema.js`

```js
// 给项目加一个「预算」字段
project: {
  fields: [
    // ...
    { key: 'budget', label: '预算(万)', type: 'number', table: true, width: 90, defaultValue: 0 }
  ]
}
```

保存后自动获得：台账新列、新建/编辑表单里的输入项、`store.derive()` 可用、**类图自动多出该属性**。

新增一个实体（比如「问题单 issue」）：

```js
issue: {
  label: '问题单', icon: '!', title: 'title',
  fields: [
    { key: 'projectId', label: '所属项目', type: 'ref', ref: 'project', required: true, table: true },
    { key: 'title', label: '问题', type: 'text', required: true, table: true },
    { key: 'status', label: '状态', type: 'select', table: true,
      options: [{ value: 'open', label: '待处理' }, { value: 'closed', label: '已关闭' }] }
  ]
}
```

再去 `store.emptyState()` 补 `issues: []`、`js/views/table.js` 的 `CASCADE` 决定删除项目时是否级联。表格/表单/类图/导出就能直接用 `PLM.crud.table({ entityKey: 'issue', rows: state.issues })`。

### 2. 加生命周期阶段 —— `PLM.registry.addStage()`

```js
PLM.registry.addStage({ id: 'pilot', name: '试运行', gate: '试运行评审', order: 5, color: '#22d3ee' });
```
插进 `order` 指定位置，后续阶段自动重排号；状态机图 ↻ 重新生成即生效。

### 3. 加预警规则 —— `PLM.registry.addRule()`（引擎未加载时自动排队）

```js
PLM.registry.addRule({
  id: 'budget.overspend',
  name: '预算超支',
  scope: 'project',
  test: function (ctx) {
    var p = ctx.project;
    if (!p || !p.budget || !p.actualCost) return null;
    if (p.actualCost <= p.budget) return null;
    return {
      level: 'high',
      title: '预算超支 ' + Math.round((p.actualCost / p.budget - 1) * 100) + '%',
      detail: p.name + '：预算 ' + p.budget + ' 万，已花 ' + p.actualCost + ' 万。',
      suggestion: '本周冻结非必要支出，并让发起人确认追加预算或缩范围。'
    };
  }
});
```

规则必须**纯函数、不抛异常**（引擎兜底 try/catch，但别依赖它）。

### 4. 加视图 —— `PLM.registry.addView()`

```js
PLM.registry.addView({
  id: 'timeline', title: '里程碑时间线', icon: '⟜', order: 35,
  render: function (root, params) { /* 往 root 里 append 您的 DOM */ }
});
```
侧栏导航、路由 `#/timeline`、错误兜底自动接好。别忘了在 `store.subscribe` 后清理：`root.addEventListener('plm:dispose', function(){ /* 退订 */ })`。

### 5. 换存储后端 —— `PLM.store.setAdapter()`

```js
PLM.store.setAdapter({
  get: function (key) { return myBackend.read(key); },
  set: function (key, value) { myBackend.write(key, value); },
  remove: function (key) { myBackend.del(key); }
});
```

### 6. 换配色 —— 只改 CSS 变量

`css/app.css` 顶部 `:root` + `[data-theme="light"]`，改 `--accent` 一行就能整体换色，UML 图同步跟随。

---

## 八、快捷键

| 键 | 作用 |
| --- | --- |
| `Ctrl/⌘ + Z` | 撤销 |
| `Ctrl/⌘ + Shift + Z`（或 `Ctrl + Y`） | 重做 |
| `Ctrl/⌘ + S` | 立即存盘（绕过防抖） |
| `Ctrl/⌘ + N` | 新建项目 |
| `Ctrl/⌘ + K` | 快速跳转（按项目名/编号搜） |
| `Esc` | 关闭最上层弹层/抽屉 |

---

## 九、文件结构

```
index.html                 入口（只放脚本顺序与 <div id="app">）
css/app.css                主题变量 + 全部布局与组件样式（含打印样式）
docs/CONTRACT.md           模块间契约：全局名、state 形状、UML spec、引擎接口、字段命名
docs/engine-notes.md       规则引擎实现说明与阈值
docs/uml-notes.md          UML 渲染器实现说明

js/core/bus.js             事件总线（on/off/once/emit）
js/core/util.js            日期/金额/格式化/下载/去抖/PNG 导出等工具
js/core/schema.js          元模型：8 阶段 + 9 实体字段定义（扩展的唯一入口）
js/core/store.js           本地存储 + commit 唯一写入口 + 撤销重做 + derive 派生计算
js/core/ui.js              无框架 DOM 构件：el/toast/modal/confirm/drawer/form/badge/progressBar
js/core/registry.js        扩展点注册表：视图 / 阶段 / 规则 / 图表类型

js/engine/rules.js         预警引擎（11 条规则 + 阈值 + 排序去重）
js/engine/report.js        周报 / 项目摘要 / CSV / Markdown 表

js/uml/uml.js              SVG 渲染器：用例 / 类 / 状态机 / 时序（真算布局，不是贴图）

js/data/seed.js            12 个示例项目（相对"今天"生成，含逾期/停滞/高风险等真实场景）

js/views/table.js          通用台账表格 + 表单 + 删除级联（PLM.crud）
js/views/dashboard.js      总览
js/views/projects.js       项目台账 + 详情抽屉（PLM.projectDetail）
js/views/kanban.js         任务看板（拖拽）
js/views/uml.js            UML 工作台（图列表/画布/缩放/导出/spec 编辑/自动生成）
js/views/risks.js          风险与变更
js/views/reports.js        报告中心（自带极简 Markdown 渲染）
js/views/settings.js       设置与扩展
js/app.js                  外壳：引导、hash 路由、顶栏、快捷键、全局动作

tests/uml.test.js          渲染器自测（几何断言：越界/交叠/文字归属）
tests/engine.test.js       引擎与报告自测（90 项断言）
```

自测（需要 Node，仅开发时用；面板本身不需要）：

```bash
node tests/uml.test.js
node tests/engine.test.js
```

---

## 十、已知边界

- 单机单用户：没有账号体系，多人协作需要自己接后端（走第 7 节的存储适配器）。
- `localStorage` 约 5MB；几千条任务没问题，再大建议换 IndexedDB 适配器。
- 类图由元模型生成，**不画继承/组合**；需要复杂建模请直接写 JSON spec。
- 周报的「关联任务完成率」在里程碑没配 `taskIds` 时用项目整体完成率代理。
- 导入的 JSON 会被 `normalize()` 校正（缺字段补默认、非法引用置空），不会因脏数据白屏。

---

## 十一、版本

`v1.0.0` · 零依赖 · 单页 · 数据本地 · 可扩展。存储键 `plm.panel.v1`（结构变更时递增 version 并写迁移）。
