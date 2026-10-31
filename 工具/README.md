# 工具

放「一条命令能跑」的脚本。现在有：

| 脚本 | 作用 | 命令 |
| --- | --- | --- |
| `backup.mjs` | 打一份快照到 `备份/snapshots/<时间戳>/`（工作区 + dsh-chain + qq-bind + workdesk + 星图数据），只留最近 14 份 | `node "F:\AI工作区\工具\backup.mjs"` |

另外两种打快照的方式（等价、更轻）：

- 左侧栏「控制台」→ 体检页 → 「打一次快照」（只备份文本层，不备份代码）
- 让 AI 调工具：`desk action=backup`

要做成每天自动：Windows 任务计划程序里加一条，程序填 `node`，参数填 `"F:\AI工作区\工具\backup.mjs"`，触发选每天午夜。
