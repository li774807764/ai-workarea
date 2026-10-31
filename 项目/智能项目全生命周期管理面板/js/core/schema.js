/* schema.js —— 元模型：生命周期阶段 + 实体字段定义
 * 一切 CRUD / 表单 / 表格列 / 类图都由这里驱动，扩展新实体只需在此登记。 */
(function (global) {
  'use strict';

  /* ---------- 生命周期阶段（全生命周期 8 门） ---------- */
  var stages = [
    { id: 'init', name: '立项', order: 0, gate: '立项评审', desc: '目标、范围、干系人与预算确认', color: '#94a3b8' },
    { id: 'req', name: '需求', order: 1, gate: '需求基线', desc: '需求采集、澄清、评审并形成基线', color: '#60a5fa' },
    { id: 'design', name: '设计', order: 2, gate: '设计评审', desc: '概要/详细设计、接口与数据模型', color: '#818cf8' },
    { id: 'dev', name: '开发', order: 3, gate: '提测准入', desc: '编码、自测、持续集成', color: '#34d399' },
    { id: 'qa', name: '测试', order: 4, gate: '质量门禁', desc: '集成/系统/验收测试与缺陷收敛', color: '#fbbf24' },
    { id: 'release', name: '上线', order: 5, gate: '上线评审', desc: '发布计划、灰度、回滚预案', color: '#fb923c' },
    { id: 'ops', name: '运维', order: 6, gate: 'SLA 复核', desc: '监控、告警、迭代与容量', color: '#f472b6' },
    { id: 'archive', name: '归档', order: 7, gate: '结项验收', desc: '交付物归档、复盘与知识沉淀', color: '#a78bfa' }
  ];

  var stageMap = {};
  stages.forEach(function (s) { stageMap[s.id] = s; });

  /* ---------- 实体定义 ---------- */
  var entities = {

    project: {
      label: '项目', icon: '◧', title: 'name',
      fields: [
        { key: 'code', label: '项目编号', type: 'text', required: true, placeholder: '如 PRJ-2026-001', table: true, width: 120 },
        { key: 'name', label: '项目名称', type: 'text', required: true, placeholder: '一句话说清要交付什么', table: true, width: 220 },
        { key: 'owner', label: '负责人', type: 'ref', ref: 'member', table: true, width: 100 },
        { key: 'stageId', label: '生命周期阶段', type: 'select', options: stages.map(function (s) { return { value: s.id, label: s.name }; }), table: true, width: 110 },
        { key: 'status', label: '项目状态', type: 'select', table: true, width: 90, defaultValue: 'active',
          options: [{ value: 'active', label: '进行中' }, { value: 'paused', label: '已暂停' }, { value: 'done', label: '已交付' }, { value: 'archived', label: '已归档' }] },
        { key: 'priority', label: '优先级', type: 'select', table: true, width: 80, defaultValue: 'P2',
          options: [{ value: 'P0', label: 'P0 紧急' }, { value: 'P1', label: 'P1 高' }, { value: 'P2', label: 'P2 中' }, { value: 'P3', label: 'P3 低' }] },
        { key: 'sponsor', label: '发起人', type: 'text' },
        { key: 'startDate', label: '开始日期', type: 'date', table: true, width: 105 },
        { key: 'dueDate', label: '目标交付', type: 'date', table: true, width: 105 },
        { key: 'budget', label: '预算（万）', type: 'number', min: 0, step: 1, table: true, width: 90 },
        { key: 'description', label: '项目简介', type: 'textarea', rows: 3, full: true },
        { key: 'tags', label: '标签', type: 'tags', full: true, placeholder: '回车或逗号分隔' }
      ]
    },

    task: {
      label: '任务', icon: '☑', title: 'title',
      fields: [
        { key: 'projectId', label: '所属项目', type: 'ref', ref: 'project', required: true, table: true, width: 150 },
        { key: 'title', label: '任务', type: 'text', required: true, table: true, width: 220 },
        { key: 'stageId', label: '阶段', type: 'select', options: stages.map(function (s) { return { value: s.id, label: s.name }; }), table: true, width: 90 },
        { key: 'status', label: '状态', type: 'select', table: true, width: 90, defaultValue: 'todo',
          options: [{ value: 'todo', label: '待开始' }, { value: 'doing', label: '进行中' }, { value: 'review', label: '待验收' }, { value: 'done', label: '已完成' }] },
        { key: 'assignee', label: '负责人', type: 'ref', ref: 'member', table: true, width: 100 },
        { key: 'estimate', label: '工作量（人天）', type: 'number', min: 0, step: 0.5, table: true, width: 110 },
        { key: 'dueDate', label: '截止', type: 'date', table: true, width: 105 },
        { key: 'order', label: '排序', type: 'number', hidden: true }
      ]
    },

    risk: {
      label: '风险', icon: '⚠', title: 'title',
      fields: [
        { key: 'projectId', label: '所属项目', type: 'ref', ref: 'project', required: true, table: true, width: 150 },
        { key: 'title', label: '风险描述', type: 'text', required: true, table: true, width: 240 },
        { key: 'category', label: '类别', type: 'select', table: true, width: 90, defaultValue: 'tech',
          options: [{ value: 'tech', label: '技术' }, { value: 'resource', label: '资源' }, { value: 'schedule', label: '进度' }, { value: 'quality', label: '质量' }, { value: 'external', label: '外部' }] },
        { key: 'probability', label: '可能性(1-5)', type: 'select', table: true, width: 100, defaultValue: '3',
          options: [1, 2, 3, 4, 5].map(function (n) { return { value: String(n), label: String(n) }; }) },
        { key: 'impact', label: '影响(1-5)', type: 'select', table: true, width: 90, defaultValue: '3',
          options: [1, 2, 3, 4, 5].map(function (n) { return { value: String(n), label: String(n) }; }) },
        { key: 'owner', label: '责任人', type: 'ref', ref: 'member', table: true, width: 100 },
        { key: 'status', label: '状态', type: 'select', table: true, width: 100, defaultValue: 'open',
          options: [{ value: 'open', label: '未缓解' }, { value: 'mitigating', label: '缓解中' }, { value: 'closed', label: '已关闭' }] },
        { key: 'mitigation', label: '应对措施', type: 'textarea', rows: 3, full: true }
      ]
    },

    change: {
      label: '变更', icon: '⇄', title: 'title',
      fields: [
        { key: 'projectId', label: '所属项目', type: 'ref', ref: 'project', required: true, table: true, width: 150 },
        { key: 'title', label: '变更内容', type: 'text', required: true, table: true, width: 240 },
        { key: 'status', label: '状态', type: 'select', table: true, width: 100, defaultValue: 'proposed',
          options: [{ value: 'proposed', label: '待决策' }, { value: 'approved', label: '已批准' }, { value: 'rejected', label: '已驳回' }] },
        { key: 'requestedBy', label: '提出人', type: 'ref', ref: 'member', table: true, width: 100 },
        { key: 'decidedAt', label: '决策日期', type: 'date', table: true, width: 105 },
        { key: 'reason', label: '变更原因', type: 'textarea', rows: 2, full: true },
        { key: 'impact', label: '影响分析（范围/进度/成本）', type: 'textarea', rows: 2, full: true }
      ]
    },

    milestone: {
      label: '里程碑', icon: '◆', title: 'title',
      fields: [
        { key: 'projectId', label: '所属项目', type: 'ref', ref: 'project', required: true, table: true, width: 150 },
        { key: 'title', label: '里程碑', type: 'text', required: true, table: true, width: 220 },
        { key: 'dueDate', label: '计划日期', type: 'date', table: true, width: 105 },
        { key: 'status', label: '状态', type: 'select', table: true, width: 100, defaultValue: 'pending',
          options: [{ value: 'pending', label: '未达成' }, { value: 'met', label: '已达成' }, { value: 'missed', label: '已错过' }] },
        { key: 'note', label: '备注', type: 'textarea', rows: 2, full: true }
      ]
    },

    deliverable: {
      label: '交付物', icon: '▤', title: 'name',
      fields: [
        { key: 'projectId', label: '所属项目', type: 'ref', ref: 'project', required: true, table: true, width: 150 },
        { key: 'name', label: '交付物名称', type: 'text', required: true, table: true, width: 220 },
        { key: 'kind', label: '类型', type: 'select', table: true, width: 110, defaultValue: 'doc',
          options: [{ value: 'req', label: '需求文档' }, { value: 'design', label: '设计文档' }, { value: 'code', label: '代码/镜像' }, { value: 'test', label: '测试报告' }, { value: 'release', label: '上线清单' }, { value: 'ops', label: '运维手册' }, { value: 'doc', label: '其他文档' }] },
        { key: 'version', label: '版本', type: 'text', table: true, width: 80 },
        { key: 'reviewer', label: '验收人', type: 'ref', ref: 'member', table: true, width: 100 },
        { key: 'status', label: '状态', type: 'select', table: true, width: 100, defaultValue: 'draft',
          options: [{ value: 'draft', label: '草稿' }, { value: 'in_review', label: '评审中' }, { value: 'accepted', label: '已验收' }] }
      ]
    },

    member: {
      label: '成员', icon: '◉', title: 'name',
      fields: [
        { key: 'name', label: '姓名', type: 'text', required: true, table: true, width: 120 },
        { key: 'role', label: '角色', type: 'select', table: true, width: 120, defaultValue: 'dev',
          options: [{ value: 'pm', label: '项目经理' }, { value: 'po', label: '产品' }, { value: 'arch', label: '架构师' }, { value: 'dev', label: '开发' }, { value: 'qa', label: '测试' }, { value: 'ops', label: '运维' }, { value: 'sponsor', label: '发起人' }] },
        { key: 'capacity', label: '周产能（人天）', type: 'number', min: 0, step: 0.5, table: true, width: 130 },
        { key: 'email', label: '邮箱', type: 'text', table: true, width: 180 }
      ]
    },

    diagram: {
      label: 'UML 图', icon: '◇', title: 'name',
      fields: [
        { key: 'name', label: '图名称', type: 'text', required: true, table: true, width: 220 },
        { key: 'type', label: '图类型', type: 'select', table: true, width: 120, defaultValue: 'state',
          options: [{ value: 'usecase', label: '用例图' }, { value: 'class', label: '类图' }, { value: 'state', label: '状态机图' }, { value: 'sequence', label: '时序图' }] },
        { key: 'projectId', label: '所属项目', type: 'ref', ref: 'project', table: true, width: 150 },
        { key: 'source', label: '来源', type: 'select', table: true, width: 90, defaultValue: 'manual',
          options: [{ value: 'manual', label: '手工' }, { value: 'auto', label: '自动生成' }] }
      ]
    },

    log: { label: '操作日志', icon: '≡', title: 'action', readonly: true, fields: [
      { key: 'at', label: '时间', type: 'text', table: true, width: 160 },
      { key: 'action', label: '动作', type: 'text', table: true, width: 200 },
      { key: 'entity', label: '对象', type: 'text', table: true, width: 90 },
      { key: 'entityId', label: 'ID', type: 'text', table: true, width: 120 },
      { key: 'detail', label: '详情', type: 'text', table: true, width: 260 }
    ] }
  };

  var order = ['project', 'task', 'risk', 'change', 'milestone', 'deliverable', 'member', 'diagram'];

  function tableColumns(key) {
    var e = entities[key];
    if (!e) return [];
    return e.fields.filter(function (f) { return f.table; });
  }

  function fieldOf(key, fkey) {
    var e = entities[key];
    if (!e) return null;
    for (var i = 0; i < e.fields.length; i++) if (e.fields[i].key === fkey) return e.fields[i];
    return null;
  }

  /* 供类图自动生成：把实体看成类，ref 字段看成关联 */
  /* 元模型 → 类图 spec。
     opt.methods: 是否画 CRUD 方法（默认 true；面板里的自动类图关掉更清爽）
     opt.maxAttrs: 每个类最多画多少属性，0/不传=全部 */
  function toClassSpec(opt) {
    opt = opt || {};
    var withMethods = opt.methods !== false;
    var maxAttrs = opt.maxAttrs > 0 ? opt.maxAttrs : 0;
    var classes = order.map(function (key) {
      var e = entities[key];
      var attrs = e.fields.filter(function (f) { return !f.hidden; }).map(function (f) {
        var t = f.type === 'ref' ? (entities[f.ref] ? entities[f.ref].label : 'ref') : f.type;
        return { name: f.key, type: t + (f.type === 'tags' ? '[]' : ''), visibility: '-' };
      });
      if (maxAttrs && attrs.length > maxAttrs) {
        attrs = attrs.slice(0, maxAttrs);
        attrs.push({ name: '…', type: '共 ' + e.fields.filter(function (f) { return !f.hidden; }).length + ' 项', visibility: '' });
      }
      return {
        id: key,
        name: e.label,
        stereotype: 'entity',
        attrs: attrs,
        methods: withMethods
          ? ['create', 'update', 'remove', 'list'].map(function (m) { return { name: m, params: '', ret: '', visibility: '+' }; })
          : []
      };
    });
    var relations = [];
    var relLabelMode = opt.relationLabels || 'label';
    order.forEach(function (key) {
      entities[key].fields.forEach(function (f) {
        if (f.type !== 'ref') return;
        /* 紧凑模式用字段名（projectId / owner / reviewer…）当关系名：短、互不相同，
           不会出现一串重复的「所属项目」把连线区挤满 */
        relations.push({
          from: key, to: f.ref, kind: 'assoc',
          label: relLabelMode === 'key' ? f.key : f.label,
          fromMult: '0..*', toMult: '1'
        });
      });
    });
    // 成员被引用体现聚合（项目由成员负责）
    return { classes: classes, relations: relations };
  }

  global.PLM = global.PLM || {};
  global.PLM.schema = {
    stages: stages,
    stage: stageMap,
    stageIndex: function (id) { var s = stageMap[id]; return s ? s.order : -1; },
    nextStage: function (id) {
      var s = stageMap[id];
      if (!s) return null;
      return stages.find(function (x) { return x.order === s.order + 1; }) || null;
    },
    entities: entities,
    order: order,
    tableColumns: tableColumns,
    fieldOf: fieldOf,
    toClassSpec: toClassSpec,
    taskStatus: [
      { value: 'todo', label: '待开始', color: '#94a3b8' },
      { value: 'doing', label: '进行中', color: '#38bdf8' },
      { value: 'review', label: '待验收', color: '#fbbf24' },
      { value: 'done', label: '已完成', color: '#34d399' }
    ]
  };
})(typeof window !== 'undefined' ? window : globalThis);
