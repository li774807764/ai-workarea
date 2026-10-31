/* seed.js —— 首次打开时的示例数据（12 个项目，覆盖全生命周期与各类风险） */
(function (global) {
  'use strict';

  function build() {
    var u = global.PLM.util;
    var now = u.nowISO();
    var T = u.today();
    var d = function (n) { return u.addDays(T, n); };      // 相对今天
    var iso = function (n) { return u.addDays(T, n) + 'T09:00:00.000Z'; };

    function mk(obj) {
      obj.id = obj.id || u.uid(obj._p || 'x');
      obj.createdAt = obj.createdAt || now;
      obj.updatedAt = obj.updatedAt || now;
      delete obj._p;
      return obj;
    }

    /* ---------- 成员 ---------- */
    var members = [
      { id: 'u_zw', name: '张伟', role: 'pm', capacity: 5, email: 'zhangwei@example.com' },
      { id: 'u_ln', name: '李娜', role: 'po', capacity: 5, email: 'lina@example.com' },
      { id: 'u_wq', name: '王强', role: 'arch', capacity: 4, email: 'wangqiang@example.com' },
      { id: 'u_zm', name: '赵敏', role: 'dev', capacity: 5, email: 'zhaomin@example.com' },
      { id: 'u_ly', name: '刘洋', role: 'dev', capacity: 5, email: 'liuyang@example.com' },
      { id: 'u_cj', name: '陈静', role: 'qa', capacity: 5, email: 'chenjing@example.com' },
      { id: 'u_zj', name: '周杰', role: 'ops', capacity: 4, email: 'zhoujie@example.com' },
      { id: 'u_sy', name: '孙毅', role: 'sponsor', capacity: 2, email: 'sunyi@example.com' }
    ].map(mk);

    /* ---------- 项目 ---------- */
    var P = [
      { id: 'p_001', _p: 'p', code: 'PRJ-2026-001', name: 'DeepSeek 模型本地化部署', owner: 'u_zw', sponsor: '孙毅',
        stageId: 'dev', status: 'active', priority: 'P0', startDate: d(-45), dueDate: d(20), budget: 380,
        description: '在客户内网完成模型私有化部署，含推理集群、鉴权与观测。', tags: ['AI', '私有化', '交付'] },
      { id: 'p_002', _p: 'p', code: 'PRJ-2026-002', name: '企业级知识库构建', owner: 'u_ln', sponsor: '孙毅',
        stageId: 'release', status: 'active', priority: 'P1', startDate: d(-70), dueDate: d(3), budget: 220,
        description: '文档解析 + 向量检索 + 问答编排，面向 3000 人规模。', tags: ['RAG', '知识管理'] },
      { id: 'p_003', _p: 'p', code: 'PRJ-2026-003', name: '智能客服系统升级', owner: 'u_wq', sponsor: '李娜',
        stageId: 'design', status: 'active', priority: 'P1', startDate: d(-22), dueDate: d(45), budget: 150,
        description: '多渠道接入、意图识别与人工兜底链路重构。', tags: ['客服', '重构'] },
      { id: 'p_004', _p: 'p', code: 'PRJ-2026-004', name: '官网改版 v3.0', owner: 'u_zm', sponsor: '张伟',
        stageId: 'archive', status: 'archived', priority: 'P3', startDate: d(-120), dueDate: d(-40), budget: 60,
        description: '品牌升级与移动端适配，已结项归档。', tags: ['前端', '品牌'] },
      { id: 'p_005', _p: 'p', code: 'PRJ-2026-005', name: '数据中台迁移', owner: 'u_ly', sponsor: '孙毅',
        stageId: 'qa', status: 'active', priority: 'P0', startDate: d(-90), dueDate: d(-2), budget: 520,
        description: '从自建 Hadoop 迁移到湖仓一体，双跑期数据一致性校验。', tags: ['数据', '迁移', '高风险'] },
      { id: 'p_006', _p: 'p', code: 'PRJ-2026-006', name: '移动端 IM 即时通讯', owner: 'u_zm', sponsor: '张伟',
        stageId: 'req', status: 'active', priority: 'P2', startDate: d(-12), dueDate: d(80), budget: 300,
        description: '单聊群聊、消息漫游与端到端加密。', tags: ['IM', '移动端'] },
      { id: 'p_007', _p: 'p', code: 'PRJ-2026-007', name: '安全合规审计平台', owner: 'u_wq', sponsor: '孙毅',
        stageId: 'init', status: 'active', priority: 'P1', startDate: d(-5), dueDate: d(120), budget: 410,
        description: '等保 2.0 三级合规改造与审计留痕。', tags: ['合规', '安全'] },
      { id: 'p_008', _p: 'p', code: 'PRJ-2026-008', name: '供应链可视化看板', owner: 'u_ln', sponsor: '李娜',
        stageId: 'ops', status: 'active', priority: 'P2', startDate: d(-140), dueDate: d(10), budget: 180,
        description: '库存、在途与交付时效实时看板，运维迭代中。', tags: ['可视化', '供应链'] },
      { id: 'p_009', _p: 'p', code: 'PRJ-2026-009', name: '计费系统结算重构', owner: 'u_ly', sponsor: '孙毅',
        stageId: 'dev', status: 'paused', priority: 'P2', startDate: d(-60), dueDate: d(50), budget: 260,
        description: '按量计费与阶梯折扣，因财务口径未定暂停。', tags: ['计费', '暂停'] },
      { id: 'p_010', _p: 'p', code: 'PRJ-2026-010', name: '统一身份认证 SSO', owner: 'u_zj', sponsor: '张伟',
        stageId: 'qa', status: 'active', priority: 'P1', startDate: d(-55), dueDate: d(6), budget: 95,
        description: 'OIDC/SAML 对接 14 个内部系统。', tags: ['SSO', '身份'] },
      { id: 'p_011', _p: 'p', code: 'PRJ-2026-011', name: 'AI 编码助手试点', owner: null, sponsor: '孙毅',
        stageId: 'init', status: 'active', priority: 'P3', startDate: d(-3), dueDate: d(150), budget: 45,
        description: '研发效能试点，目标 30 人团队，尚未指定负责人。', tags: ['AI', '效能', '试点'] },
      { id: 'p_012', _p: 'p', code: 'PRJ-2026-012', name: '客服质检语音分析', owner: 'u_cj', sponsor: '李娜',
        stageId: 'design', status: 'active', priority: 'P2', startDate: d(-30), dueDate: d(70), budget: 130,
        description: '通话转写 + 质检规则引擎，命中率目标 85%。', tags: ['语音', '质检'] }
    ].map(mk);

    /* ---------- 任务 ---------- */
    function t(pid, title, stageId, status, assignee, estimate, dueOffset, updatedAgo) {
      return mk({
        _p: 't', projectId: pid, title: title, stageId: stageId, status: status,
        assignee: assignee, estimate: estimate, dueDate: d(dueOffset), order: 0,
        updatedAt: iso(-(updatedAgo == null ? 2 : updatedAgo))
      });
    }

    var tasks = [
      // PRJ-001 开发阶段
      t('p_001', '推理集群容器化编排', 'dev', 'done', 'u_ly', 3, -10),
      t('p_001', '模型权重加载与显存优化', 'dev', 'done', 'u_wq', 2, -6),
      t('p_001', '租户鉴权与配额限流', 'dev', 'doing', 'u_zm', 4, 2, 1),
      t('p_001', '推理压测与容量基线', 'dev', 'todo', 'u_cj', 2, 9),
      t('p_001', '部署手册与交付物整理', 'release', 'todo', 'u_zw', 1, 16),

      // PRJ-002 上线阶段（临近交付）
      t('p_002', '文档解析流水线联调', 'dev', 'done', 'u_ly', 5, -25),
      t('p_002', '检索召回率调优到 0.86', 'qa', 'done', 'u_cj', 3, -12),
      t('p_002', '灰度发布方案评审', 'release', 'doing', 'u_wq', 1, 1, 1),
      t('p_002', '回滚预案演练', 'release', 'todo', 'u_zj', 1, 2),
      t('p_002', '用户培训与知识库导流', 'release', 'todo', 'u_ln', 2, 5),

      // PRJ-003 设计阶段
      t('p_003', '意图识别接口定义', 'design', 'doing', 'u_wq', 2, 4, 1),
      t('p_003', '多渠道接入时序梳理', 'design', 'review', 'u_zm', 1, -2, 3),
      t('p_003', '人工兜底状态机设计', 'design', 'todo', 'u_ln', 2, 12),

      // PRJ-004 归档
      t('p_004', '移动端适配验收', 'archive', 'done', 'u_zm', 3, -45),
      t('p_004', '结项报告归档', 'archive', 'done', 'u_zw', 1, -42),

      // PRJ-005 测试阶段，已超期
      t('p_005', '双跑数据一致性核对', 'qa', 'doing', 'u_ly', 6, -8, 2),
      t('p_005', '历史数据回填校验', 'qa', 'doing', 'u_cj', 4, -5, 1),
      t('p_005', '查询性能回归', 'qa', 'todo', 'u_wq', 3, 4, 6),
      t('p_005', '迁移割接演练', 'qa', 'todo', 'u_zj', 2, 1),
      t('p_005', '口径对账脚本交付', 'qa', 'review', 'u_ly', 2, -3, 8),

      // PRJ-006 需求阶段
      t('p_006', '消息模型与协议选型', 'req', 'doing', 'u_wq', 3, 6, 1),
      t('p_006', '离线消息漫游需求澄清', 'req', 'doing', 'u_ln', 2, 8, 2),
      t('p_006', '端到端加密合规评估', 'req', 'todo', 'u_zm', 2, 20),
      t('p_006', '技术预研：长连接网关', 'req', 'todo', null, 3, 25),

      // PRJ-007 立项
      t('p_007', '等保差距分析', 'init', 'doing', 'u_wq', 4, 10, 1),
      t('p_007', '预算与资源申请', 'init', 'todo', 'u_zw', 1, 14),

      // PRJ-008 运维
      t('p_008', '看板数据延迟告警调优', 'ops', 'done', 'u_zj', 2, -20),
      t('p_008', '库存快照任务稳定性优化', 'ops', 'doing', 'u_ly', 3, 7, 2),
      t('p_008', '季度容量评估', 'ops', 'todo', 'u_cj', 1, 12),

      // PRJ-009 暂停
      t('p_009', '按量计费规则实现', 'dev', 'doing', 'u_ly', 5, -12, 21),
      t('p_009', '阶梯折扣算法', 'dev', 'todo', 'u_zm', 3, -6, 21),

      // PRJ-010 测试
      t('p_010', 'OIDC 联邦登录联调', 'qa', 'done', 'u_zm', 3, -14),
      t('p_010', '14 系统对接回归', 'qa', 'doing', 'u_cj', 5, 2, 1),
      t('p_010', '单点登出与令牌刷新验证', 'qa', 'review', 'u_ly', 2, -1, 4),
      t('p_010', '上线检查清单确认', 'release', 'todo', 'u_zj', 1, 8),

      // PRJ-011 空转
      // PRJ-012 设计
      t('p_012', '通话转写准确率验证', 'design', 'doing', 'u_cj', 3, 5, 2),
      t('p_012', '质检规则 DSL 设计', 'design', 'doing', 'u_wq', 4, 9, 1),
      t('p_012', '结果复核界面原型', 'design', 'todo', 'u_ln', 2, 15)
    ];

    /* ---------- 风险 ---------- */
    function r(pid, title, category, p, i, owner, status, mitigation) {
      return mk({ _p: 'r', projectId: pid, title: title, category: category, probability: String(p), impact: String(i), owner: owner, status: status, mitigation: mitigation });
    }
    var risks = [
      r('p_005', '双跑期口径不一致导致对账失败', 'quality', 5, 4, 'u_ly', 'open', '抽 3 个业务域做逐笔对账，差异入台账，每日 10:00 站会裁决。'),
      r('p_005', '历史数据回填窗口不足，割接延期', 'schedule', 4, 4, 'u_ly', 'mitigating', '按域分批割接，先切读后切写，保留 72 小时可回退窗口。'),
      r('p_001', '客户内网无外网源，镜像拉取受阻', 'tech', 3, 4, 'u_zj', 'mitigating', '提前离线镜像包 + 内网 registry 预热，压测前 3 天完成预检。'),
      r('p_002', '灰度期检索缓存击穿', 'tech', 3, 3, 'u_wq', 'open', '缓存预热 + 请求合并，灰度比例按 5%→20%→50% 阶梯放量。'),
      r('p_002', '培训不到位导致上线后求助量激增', 'external', 3, 2, 'u_ln', 'mitigating', '上线前 2 场直播培训 + 速查卡，设 1 周驻场支持。'),
      r('p_003', '意图识别训练数据不足', 'resource', 4, 3, 'u_ln', 'open', '先用品类规则兜底，同步采集 5000 条真实会话。'),
      r('p_009', '财务计费口径未定，需求反复', 'schedule', 4, 3, 'u_zw', 'open', '本周与财务对齐口径，出会议纪要与冻结版本。'),
      r('p_010', '第三方系统改造排期冲突', 'external', 3, 3, 'u_zj', 'mitigating', '先对接 5 个核心系统，其余走适配层并行。'),
      r('p_012', '方言场景转写准确率不达标', 'quality', 3, 4, 'u_cj', 'open', '按方言分桶评估，低于阈值的场景走人工复核流程。'),
      r('p_007', '等保整改工作量超出预算', 'schedule', 3, 5, 'u_wq', 'open', '先做差距分析排序，把必改项与建议项拆两期。'),
      r('p_011', '试点缺少负责人，推进停滞', 'resource', 5, 3, null, 'open', '本周指定负责人，否则降级为观察项。')
    ].filter(Boolean);

    /* ---------- 变更 ---------- */
    function c(pid, title, status, requestedBy, decidedOffset, reason, impact) {
      return mk({ _p: 'c', projectId: pid, title: title, status: status, requestedBy: requestedBy, decidedAt: decidedOffset == null ? null : d(decidedOffset), reason: reason, impact: impact });
    }
    var changes = [
      c('p_002', '知识库增加多模态图片解析', 'proposed', 'u_ln', null, '客户提出合同附件需 OCR 检索。', '范围 +1 周，成本 +12 万，影响上线日期 5 天。'),
      c('p_005', '割接窗口从周末改为工作日夜间', 'approved', 'u_ly', -4, '客户周末封网策略调整。', '人力夜班成本增加，进度不变。'),
      c('p_003', '接入企业微信渠道', 'proposed', 'u_wq', null, '客服坐席希望统一入口。', '设计阶段返工约 3 人天。'),
      c('p_010', '对接系统从 14 个减为 9 个', 'approved', 'u_zj', -8, '排期冲突，分两期上线。', '范围缩小，二期延后 1 个月。'),
      c('p_001', '增加国产化芯片适配', 'proposed', 'u_zw', null, '客户信创要求。', '新增 6 人天，需扩充测试环境。'),
      c('p_012', '质检结果导出增加 API 方式', 'approved', 'u_ln', -2, '客户希望对接自有 BI。', '接口开发 2 人天，不影响设计基线。'),
      c('p_009', '计费改为按日结算', 'rejected', 'u_ly', -15, '财务确认按月结算。', '无影响。')
    ];

    /* ---------- 里程碑 ---------- */
    function m(pid, title, dueOffset, status, note) {
      return mk({ _p: 'm', projectId: pid, title: title, dueDate: d(dueOffset), status: status, note: note || '' });
    }
    var milestones = [
      m('p_001', '提测准入', 12, 'pending', '需先完成鉴权与限流'),
      m('p_001', '客户验收', 20, 'pending'),
      m('p_002', '灰度发布', 2, 'pending', '已过评审，待排期'),
      m('p_002', '全量上线', 3, 'pending'),
      m('p_003', '设计基线', 10, 'pending'),
      m('p_004', '结项归档', -40, 'met'),
      m('p_005', '割接演练', -3, 'missed', '因对账差异超标推迟'),
      m('p_005', '正式割接', 5, 'pending', '风险较高'),
      m('p_006', '需求基线', 25, 'pending'),
      m('p_007', '立项评审', 8, 'pending'),
      m('p_008', 'SLA 季度复核', 10, 'pending'),
      m('p_010', '回归测试完成', 5, 'pending'),
      m('p_012', '设计评审', 18, 'pending')
    ];

    /* ---------- 交付物 ---------- */
    function dv(pid, name, kind, version, reviewer, status) {
      return mk({ _p: 'd', projectId: pid, name: name, kind: kind, version: version, reviewer: reviewer, status: status });
    }
    var deliverables = [
      dv('p_001', '私有化部署方案', 'design', 'v1.2', 'u_wq', 'accepted'),
      dv('p_001', '压测报告', 'test', 'v0.3', 'u_cj', 'draft'),
      dv('p_002', '上线清单与回滚预案', 'release', 'v1.0', 'u_zj', 'in_review'),
      dv('p_002', '用户操作手册', 'doc', 'v0.9', 'u_ln', 'in_review'),
      dv('p_002', '检索质量测试报告', 'test', 'v1.1', 'u_cj', 'accepted'),
      dv('p_004', '结项复盘报告', 'doc', 'v1.0', 'u_zw', 'accepted'),
      dv('p_005', '迁移实施方案', 'design', 'v2.0', 'u_wq', 'accepted'),
      dv('p_005', '数据一致性报告', 'test', 'v0.6', 'u_cj', 'draft'),
      dv('p_008', '运维手册', 'ops', 'v1.4', 'u_zj', 'accepted'),
      dv('p_010', 'SSO 对接规范', 'design', 'v1.0', 'u_wq', 'accepted'),
      dv('p_010', '上线检查清单', 'release', 'v0.2', 'u_zj', 'draft')
    ];

    /* ---------- UML 图 ---------- */
    var diagrams = [
      mk({
        _p: 'd', name: '项目生命周期状态机（自动生成）', type: 'state', projectId: null, source: 'auto', autoKind: 'lifecycle',
        spec: {
          states: [
            { id: 'init', name: '立项', kind: 'initial', action: '编制项目章程' },
            { id: 'req', name: '需求', action: '形成需求基线' },
            { id: 'design', name: '设计', action: '完成设计评审' },
            { id: 'dev', name: '开发', action: '编码与自测' },
            { id: 'qa', name: '测试', action: '缺陷收敛' },
            { id: 'release', name: '上线', action: '灰度发布' },
            { id: 'ops', name: '运维', action: 'SLA 监控' },
            { id: 'done', name: '归档', kind: 'final', action: '结项验收' }
          ],
          transitions: [
            { from: 'init', to: 'req', event: '立项评审通过', guard: '预算已批复' },
            { from: 'req', to: 'design', event: '需求基线冻结' },
            { from: 'design', to: 'dev', event: '设计评审通过' },
            { from: 'dev', to: 'qa', event: '提测准入通过', guard: '自测用例 100%' },
            { from: 'qa', to: 'dev', event: '严重缺陷回退', guard: 'P0 缺陷 > 0' },
            { from: 'qa', to: 'release', event: '质量门禁通过' },
            { from: 'release', to: 'ops', event: '灰度观察期满' },
            { from: 'release', to: 'qa', event: '回滚', guard: '错误率超阈值' },
            { from: 'ops', to: 'done', event: '结项验收' },
            { from: 'dev', to: 'dev', event: '需求变更', guard: '变更单已批准' }
          ]
        }
      }),
      mk({
        _p: 'd', name: '领域模型类图', type: 'class', projectId: null, source: 'auto', autoKind: 'class', spec: null
      }),
      mk({
        _p: 'd', name: '项目管控用例图', type: 'usecase', projectId: null, source: 'manual',
        spec: {
          boundary: '智能项目全生命周期管理面板',
          actors: [{ id: 'a1', name: '项目经理' }, { id: 'a2', name: '项目成员' }, { id: 'a3', name: '发起人' }],
          usecases: [
            { id: 'uc1', name: '立项与章程编制' }, { id: 'uc2', name: '任务拆解与排期' },
            { id: 'uc3', name: '阶段推进与评审' }, { id: 'uc4', name: '风险登记与缓解' },
            { id: 'uc5', name: '变更申请与决策' }, { id: 'uc6', name: '交付物验收' },
            { id: 'uc7', name: '预警查看与处置' }, { id: 'uc8', name: 'UML 建模与导出' },
            { id: 'uc9', name: '周报生成' }
          ],
          links: [
            { from: 'a1', to: 'uc1', kind: 'assoc' }, { from: 'a1', to: 'uc2', kind: 'assoc' },
            { from: 'a1', to: 'uc3', kind: 'assoc' }, { from: 'a1', to: 'uc5', kind: 'assoc' },
            { from: 'a1', to: 'uc7', kind: 'assoc' },
            { from: 'a2', to: 'uc2', kind: 'assoc' }, { from: 'a2', to: 'uc4', kind: 'assoc' },
            { from: 'a2', to: 'uc8', kind: 'assoc' },
            { from: 'a3', to: 'uc6', kind: 'assoc' }, { from: 'a3', to: 'uc9', kind: 'assoc' },
            { from: 'uc3', to: 'uc7', kind: 'include' },
            { from: 'uc2', to: 'uc4', kind: 'extend' },
            { from: 'uc6', to: 'uc3', kind: 'extend' }
          ]
        }
      }),
      mk({
        _p: 'd', name: '上线发布时序图', type: 'sequence', projectId: 'p_002', source: 'manual',
        spec: {
          participants: [
            { id: 'pm', name: '项目经理' }, { id: 'dev', name: '研发' }, { id: 'qa', name: '测试' },
            { id: 'ops', name: '运维' }, { id: 'sys', name: '生产环境' }
          ],
          messages: [
            { from: 'pm', to: 'dev', kind: 'sync', text: '提测申请' },
            { from: 'dev', to: 'qa', kind: 'sync', text: '交付构建包 v1.0' },
            { from: 'qa', to: 'sys', kind: 'sync', text: '部署灰度环境' },
            { from: 'qa', to: 'pm', kind: 'return', text: '质量报告：通过' },
            { from: 'pm', to: 'ops', kind: 'sync', text: '申请灰度发布 5%' },
            { from: 'ops', to: 'sys', kind: 'sync', text: '放量至 5%' },
            { from: 'sys', to: 'ops', kind: 'return', text: '错误率 0.02%' },
            { from: 'ops', to: 'sys', kind: 'sync', text: '阶梯放量 20% → 100%' },
            { from: 'sys', to: 'pm', kind: 'async', text: '上线完成通知' }
          ]
        }
      })
    ];

    /* 类图 spec 由 schema 动态生成，避免手写漂移（与视图的自动生成保持一致：不画方法、每类最多 8 属性） */
    var cls = global.PLM.schema.toClassSpec({ methods: false, maxAttrs: 8, relationLabels: 'key' });
    diagrams[1].spec = cls;

    var seedState = global.PLM.store.emptyState();
    seedState.version = global.PLM.store.VERSION;
    seedState.members = members;
    seedState.projects = P;
    seedState.tasks = tasks;
    seedState.risks = risks;
    seedState.changes = changes;
    seedState.milestones = milestones;
    seedState.deliverables = deliverables;
    seedState.diagrams = diagrams;
    seedState.logs = [{
      id: u.uid('g'), at: now, action: '初始化示例数据', entity: 'system', entityId: '—',
      detail: '12 个项目 / ' + tasks.length + ' 个任务 / ' + risks.length + ' 个风险'
    }];

    // 任务 order 按项目内顺序编号，看板用得上
    var counter = {};
    seedState.tasks.forEach(function (task) {
      counter[task.projectId] = (counter[task.projectId] || 0) + 1;
      task.order = counter[task.projectId];
    });

    return seedState;
  }

  global.PLM = global.PLM || {};
  global.PLM.seed = { build: build };
})(typeof window !== 'undefined' ? window : globalThis);
