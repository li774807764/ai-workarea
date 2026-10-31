# 场景：QQ 通道

- 职责：QQ 私聊/群聊接入 DSH，独立 session，共享星图与长期记忆。
- 目录：`F:\AI工作区\场景\qq-channel\`
- 代码：`C:\Users\Administrator\.dsh\profiles\desktop\node_modules\dsh-qqchat`（含本机补丁）
- 配套插件：`E:\11\qq-bind`（@local/qq-bind 0.1.0，左侧栏绑定面板）
- 数据：`C:\Users\Administrator\.dsh\plugins\dsh-qqchat`（qqchat.sqlite + workspace）
- 边界：Bot 只给本人用；审批走 danger-full-access 预设（无人值守）。
