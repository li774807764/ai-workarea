# 预警引擎与报告模块说明

契约见 `docs/CONTRACT.md` §6 / §7；全局名 `PLM_ENGINE`、`PLM_REPORT`，两个文件都是 IIFE、零依赖。
阈值一律读 `state.config`，缺省值集中在 `PLM_ENGINE.DEFAULTS`；`evaluate(state, opts)` 的 `opts` 可覆盖 `{ today, now, config }`（自测用）。

## 一、规则清单（内置 11 条，`PLM_ENGINE.defaultRules`）

| id | 触发条件 | 阈值 | 级别 | 建议要点 |
| --- | --- | --- | --- | --- |
| `task.overdue` | 任务 `dueDate < today` 且 status ≠ done | `overdueHighDays`=7；逾期 ≥7 天升 high | mid/high | 逐条给「把 X 截止日改到 today+3 并拆出 ≤1 人天子任务」 |
| `stage.stall` | 项目当前 `stageId` 下最早任务的 `updatedAt` 距今超期 | `stallDays`=14；超过 2 倍升 high | mid/high | 「本周给该阶段排一个 ≤1 人天下一步，或改 paused 并写阻塞原因」 |
| `risk.highUnmitigated` | `probability*impact ≥ 15` 且 status === 'open' | 固定 15（P×I≥20 需发起人过目） | high | 「指定负责人 + 一条可验收缓解动作，3 天内转 mitigating」 |
| `change.pending` | status === 'proposed' 且提出超期 | `changePendingDays`=7；超 3 倍升 high | mid/high | 「评审会定去留：批准写排期，驳回补依据，然后改状态」 |
| `milestone.approaching` | `dueDate` 在 N 天内且 pending，完成率 < 阈值 | `milestoneSoonDays`=7、`milestoneMinProgress`=80；≤2 天升 high | mid/high | 「未完成里最关键的 2 条拉进本周，或顺延 7 天并同步发起人」 |
| `milestone.missed` | `dueDate < today` 且仍 pending | — | high | 「改 missed 写原因，后续里程碑重排到 today+14」 |
| `deliverable.unaccepted` | 项目已到上线/运维/归档阶段，交付物非 accepted | 阶段判定：阶段名含上线/运维/发布/归档，或位于 `stages` 末两位 | mid（draft 升 high） | 「3 天内约验收人过一遍；过不了退回 draft 列待修项」 |
| `wip.overLimit` | 某成员 `doing` 任务数 > 上限 | `wipLimit`=6；超 1.5 倍升 high | mid/high | 「把最早到期之外最不紧急的 N 条移回 todo 或转人」 |
| `project.noOwner` | 项目 `owner` 为空且未归档 | — | high | 「指定负责人；没人接就改 paused 并写等谁等什么」 |
| `project.overdue` | 项目 `dueDate` 已过、非 archived、阶段未到归档 | 超期 ≥7 天升 high | mid/high | 「二选一：收口给 today+7 新截止日，或改 paused/archived」 |
| `project.noTasks` | active 项目零任务 | — | mid | 「补 3 条最小任务（需求确认/方案/验收），补不出来就归档」 |

Finding = `{ id, ruleId, level, projectId, entity, entityId, title, detail, suggestion }`；`entity` 只在 project/task/risk/milestone/deliverable/change 六值内。
`suggestion` 必须是带「对象 + 动作 + 时间」的可执行文案（自测断言 ≥12 字），不写「请注意风险」。
`evaluate` 每条规则独立 try/catch（异常走 `console.error`，不中断其它规则），结果按 high→mid→low 稳定排序，上限 200 条。
扩展：`PLM_ENGINE.registerRule({ id, name, scope, level, description, test(ctx) })`；同 id 覆盖，`rules()` 返回生效全集（内置 + 扩展）。

## 二、报告模板说明（`PLM_REPORT`）

- `weekly(state, { projects, since, until })` —— 六个小节：① 本周概览（项目/任务/风险/变更/交付物/里程碑/预警计数）② 阶段分布（按 `config.stages` 计数 + 占比，含「未分阶段」）③ 预警 Top5（复用 `PLM_ENGINE.evaluate`，每条带一句建议）④ 风险登记（未关闭，按 P×I 降序，Top10）⑤ 里程碑（pending 且 30 天内到期或已逾期）⑥ 下周建议（取 Top 预警建议去重 ≤5 条，不足 3 条时按逾期任务/高风险/待决策变更补充）。
- `since` 缺省 = `until - 6`，`until` 缺省 = 今天；`projects` 可传 id 数组或项目对象数组，空则统计全部。数字全部现算，空段落写「无」。
- `projectSummary(state, projectId)` —— 基本信息 / 阶段进度 / 任务统计 / 任务清单（未完成按截止日排，最多 20 条）/ 风险 / 变更 / 交付物 / 里程碑；项目不存在返回 `> 未找到项目：\`id\``。
- `toCSV(rows, columns)` —— UTF-8 带 `\uFEFF`，`\r\n` 换行；含 `,` `"` 换行的字段加引号，内部 `"` → `""`；`columns=[{key,label}]`，缺省从首行键推导。
- `toMarkdownTable(rows, columns)` —— `|` 转义为 `\|`、换行转 `<br>`；数字列右对齐（`---:`）、文本列左对齐（`:---`）；空 rows 只返回表头 + 分隔行（报告里用「无」占位）。

## 三、已知限制与集成要求

1. §2 的 Milestone 没有 `taskIds`，关联任务完成率退化为**项目整体完成率**；若后续 schema 加了 `milestone.taskIds`，规则会自动改用它（已实现分支）。
2. 阶段语义靠 `config.stages` 的 name/id 关键词与「末两位」兜底，自定义阶段名请带上「上线/运维/发布/归档」之一，否则交付物规则可能不触发。
3. `evaluate` 的 `ctx.derive` 与 `PLM.store.derive` 同口径（progress/health/taskStats/riskScore/overdue），但引擎内自带一份实现以免加载顺序耦合；面板显示请统一用 store 的值。
4. `weekly` 需要 `window.PLM_ENGINE` 已加载才能算预警 Top5；未加载时该小节与「下周建议」降级为文案，不抛错。`index.html` 请先引 `rules.js` 再引 `report.js`。
5. 两个模块都不碰 DOM / localStorage / 网络；下载请调用方用 `PLM.util.download(filename, text, 'text/csv;charset=utf-8')`（CSV 文本已含 BOM，勿重复加）。
6. 自测：`node tests/engine.test.js`（90 项断言，12 个覆盖项目 + 空/非法输入 + 200 条上限 + 排序 + CSV 转义）。
