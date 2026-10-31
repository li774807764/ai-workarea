# UML 渲染引擎布局要点（js/uml/uml.js）

一个 IIFE 挂 `window.PLM_UML`，零依赖、无外链、不抛异常：`render(type, spec, opts)` 返回 `{svg,width,height}` 或 `{error}`。

## 通用
- 文本度量：中文 1em、英文/数字 0.55em、空格 0.32em；`\n` 硬换行，超宽再软折行。所有节点尺寸由文字反推，先量后排。
- 宽度预算：`opts.width` 下传为 `budget = width - 2*PAD - 2`，builder 在预算内自己折行/分带，**不做事后缩放**（`scale` 仅在无可行布局时兜底）。
- 包围盒：`Scene` 累加所有图元，`width/height = ceil(包围盒 + padding)`，`viewBox` 同值。
- 大图保护：节点数 > 60 时底部加提示条，SVG 仍合法。

## 用例图
- 用例按 `group` 分「横向分带」，组标题横排（不旋转），带内按 `budget` 折行。
- 椭圆 rx/ry 由文字中线宽反解（`rx = (tw/2)/sqrt(1-(th/2/ry)^2) * 1.06`），保证文字内切不溢出。
- actor 分左右两列排在 **boundary 之外**，竖直均分；boundary 不足标题宽度时对称撑开。

## 类图
- 继承/实现边做 DFS 去环 + 松弛求层级；同层超 `budget` 折行，行内居中。
- 行距随跨行边数放大：`base + min(跨行数*12, 40)`；跨行边走专属水平轨道 `laneFrac=(k+1)/(n+1)`。
- 先布线画线（`routed[]`），所有折线段入 `segList`，再统一放标签：标签不能压节点框、不能压已放标签、不能压任意线段（外扩 2px）。
- 记号：继承空心三角实线、实现空心三角虚线、聚合空心菱形/组合实心菱形（from 端）、依赖虚线开放箭头。

## 状态机
- 从 initial 做 BFS 分层（无根取入度 0，孤儿进末列）；列按 `budget` 分带、奇数带反向 → 蛇形。
- 转移端口按配对预算错开 ±11；水平分离走「水平-垂直-水平」，否则「垂直-水平-垂直」；自转移画右侧小环。
- 标签候选按车道奇偶分左右并做节点/线段避让。

## 时序图
- 参与者贴顶一行，超宽时压缩间距；生命线虚线；消息行距固定，纵向不重叠。
- `sync` 实心箭头、`async` 开放箭头、`return` 开放箭头 + 虚线；自消息画矩形环。

## 输入校验（面板「粘 JSON 先 render 一遍」当校验用）
- type 不在四种之内 → `未知图形类型：xxx`；spec 为 null / 非对象 / 数组 → `spec 必须是对象`。
- 必填数组缺失或非数组 → `spec.<字段> 必须是数组`；必填数组为空 → `这张图没有可渲染的节点（<字段> 为空）`。
- 必填：class→classes、usecase→actors+usecases、state→states、sequence→participants；relations/transitions/messages/links 可缺省。
- 单个节点字段类型错仍容错渲染（不整张崩、不出 NaN）。
