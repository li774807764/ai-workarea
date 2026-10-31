# F:\AI工作区

这是「一个能自我维护的 AI 工作台」的落盘目录：文件放这里、备份放这里、仓库也接这里。

入口三样：

1. **`总纲\README.md`** —— 六层目录是什么、谁写谁读。
2. **`总纲\constitution.md`** —— L0 宪法 12 条 + 权限矩阵（只有你能改）。
3. **左侧栏「控制台」** —— DSH 插件 `@local/workdesk`，一屏看目录/看板/项目/体检/备份。

## 备份

- 手动：`node "F:\AI工作区\工具\backup.mjs"`（或双击 `E:\11\ai-workarea-backup.bat`）
- 自动（两条线，日志都在 `E:\11\workarea-backup.log`）：
  - 「AI工作区每日备份」每天 00:00 跑一次
  - 「AI工作区开机补跑备份」登录后 2 分钟检查一次，若 20 小时内没有新快照就补跑（脚本 `E:\11\catchup-backup.mjs`）
- 产物：`备份/snapshots/<时间戳>/`（工作区、dsh-chain、qq-bind、workdesk、星图数据），保留最近 14 份；`工具/git`、`工具/_dl`、`.git`、内嵌裸仓库、快照自身都不进快照
- 为什么这么配：快照是「能回退到昨天」，仓库是「能看清每一步改了什么」，两者不互相替代

## 仓库

- 主远端就是 GitHub：`git@github.com:li774807764/ai-workarea.git`（ssh，主分支 `main`），分支已跟踪 `origin/main`
- 本机裸库 `仓库/ai-workarea.git` 保留作**离线镜像**：断网也能 push，等于第二份拷贝
- git 本体放在 `工具/git`（MinGit，免安装；这台机器原先没装 git），全路径调用：`F:\AI工作区\工具\git\cmd\git.exe`
- 凭据：专用密钥 `仓库/.ssh/id_ed25519`（公钥那一行在 `仓库/公钥.txt`，已加到 GitHub 账号，标题「AI工作区」）；`core.sshCommand` 已指向 MinGit 的 ssh 并带上这把钥匙，所以直接 `git push` 就行
- 日常动作：`工具/git/cmd/git.exe add -A` → `... commit -m "做了什么"` → `... push origin main`
- 地址与台账：仓库地址记在 `仓库/远端地址.json`，当前远端与镜像记在 `仓库/repos.json`；换地址后跑一次 `node "F:\AI工作区\工具\接远端.mjs"` 即可自动重设 origin 并推送
- `.gitignore` 排除了 `备份/snapshots/`、`备份/backup.log`、`仓库/ai-workarea.git/`、`工具/git/`、`工具/_dl/`、`仓库/.ssh/` —— 快照、工具本体与私钥都不进历史

## 目录

```
总纲       L0  宪法、记忆总纲(charter)、目录说明
共享       L1  须知(AGENTS) / 技能 / 看板(board.json) / 主画像 + 画像参考
场景       L2  每个场景四张卡：scene / 定位卡 / 场景画像 / 私有记忆
个人       L3  主画像与私人档案（隔离）
执行       L4  派单 / 审计 / 运行时
归档       L5  只进不改
项目            projects.json 项目台账
零件库          index.json 可复用插件与口令
工具            backup.mjs 等脚本
备份            backup-manifest.json + snapshots/
仓库            repos.json
```

已有场景：`dsh-chain`（星图记忆）、`qq-channel`（QQ 通道）、`workdesk`（本控制台）、`video-study`（长视频复盘）。

## 三条日常动作

| 想干什么 | 怎么做 |
| --- | --- |
| 看全局 / 体检 | 左侧栏「控制台」→ 概览 / 体检 |
| 干活推进 | 看板里把卡片从「待办」拖到「进行中」→ 完成后移入「已完成」（自动盖回执时间） |
| 备份 | `node "F:\AI工作区\工具\backup.mjs"`（或控制台「打一次快照」） |

## 备份与仓库，现在是什么状态

1. **每日自动备份**：已接。计划任务「AI工作区每日备份」每天 00:00 跑，「AI工作区开机补跑备份」登录后 2 分钟检查一次（20 小时内没新快照就补跑）。日志在 `E:\11\workarea-backup.log`。
2. **仓库**：已接 GitHub（ssh 认证通过，`main` 跟踪 `origin/main`）。本机裸库 `仓库/ai-workarea.git` 继续作离线镜像。日常改完：`工具/git/cmd/git.exe add -A` → `commit -m "..."` → `push origin main`。

## 下一步（按看板走）

- 每日备份后自动 push 一次（看板 c7）
- 场景画像与记忆闸门（看板 c1 / c2）
- 控制台里加一栏「远端是否落后 / 上次 push 时间」
