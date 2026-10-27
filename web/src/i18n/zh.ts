import type { Dictionary } from './en'

/**
 * Chinese dictionary. Must cover every English key (enforced by the
 * Dictionary type). Interpolation placeholders match en.ts exactly.
 */

const zh: Dictionary = {
  'app.title': 'UTSC 职业与实践导航',
  'app.tagline': '比较数据职业方向、确认自己的技能，找到课程与社团实践机会。',
  'app.syntheticBanner':
    '开发预览（A0）：页面展示的全部数据是 SYNTHETIC 人工合同样例，不是真实市场或活动数据。',
  'app.skipToContent': '跳到主内容',
  'app.languageSwitch': '切换语言',
  'app.primaryNav': '主导航',

  'nav.home': '首页',
  'nav.sample': '样例数据（只读）',
  'nav.market': '市场概览',
  'nav.compare': '方向比较',
  'nav.courses': '课程与技能',
  'nav.opportunities': '实践机会',
  'nav.profile': '个人画像',

  'home.title': '首页',
  'home.intro':
    '本网站面向 UTSC 学生，正在开发中。A0（本次发布）交付项目基础：React＋TypeScript＋Vite 骨架、共同数据合同、运行时校验，以及一个只读样例数据展示入口。',
  'home.workingTitle': '当前已实现',
  'home.workingItem1':
    '基础导航与全局中英文切换；规范 ID、筛选条件和当前页面不随语言改变。',
  'home.workingItem2':
    '只读样例数据展示：从共同合同 fixtures 经运行时校验层加载。',
  'home.workingItem3':
    '加载、错误、空数据和旧数据提示；损坏数据包整体拒收，不会被暗中替换。',
  'home.sampleCta': '打开样例数据展示',
  'home.pendingTitle': '尚未实现（计划阶段）',
  'home.pendingA1': 'A1 — 账户、数据库与权限（Supabase Auth＋Postgres RLS）。目前没有登录功能。',
  'home.pendingA2': 'A2 — 市场概览与方向比较页面，含筛选与技能提及图表。',
  'home.pendingA3': 'A3 — 课程—技能映射与经历候选技能提取。',
  'home.pendingA4': 'A4 — 推荐与学习路径。',
  'home.pendingA5': 'A5 — 机会浏览、分类筛选与日历导出。',
  'home.pendingA6': 'A6 — 个人画像、收藏与路径进度（依赖 A1 账户）。',
  'home.pendingA7': 'A7 — 发布适配器与 ICS 日历导出。',
  'home.pendingA8': 'A8 — 部署与端到端验收。',
  'home.honestyNote':
    'A0 未实现登录、收藏、提交或发布，也没有模拟这些功能。本站任何内容都不应被理解为真实招聘、开课或活动信息。',

  'sample.title': '样例数据（只读）',
  'sample.intro':
    '加载三组共同确认的合同 fixtures 之一。每个数据包都会先经上游 Schema 和交叉记录检查的运行时校验；发现任何问题的数据包整体拒收，不展示其中任何内容。',
  'sample.selectorLegend': '选择数据包',
  'fixture.valid.label': '有效包',
  'fixture.valid.description': '人工样例：1 条岗位、技能、课程、资源和机会。',
  'fixture.empty.label': '空包',
  'fixture.empty.description': '结构有效但记录数为 0，展示空状态。',
  'fixture.invalid.label': '损坏包',
  'fixture.invalid.description': '故意违反合同，必须被明确拒收。',
  'sample.syntheticBadge': 'SYNTHETIC 模拟',
  'sample.loading': '正在加载并校验数据……',
  'sample.errorTitle': '数据文件加载失败',
  'sample.errorMessage': '无法获取数据包。请确认本地服务正在运行后重试。',
  'sample.retry': '重试',
  'sample.rejectedTitle': '该数据包已被拒收',
  'sample.rejectedMessage':
    '校验发现问题，此数据包的全部内容都不展示。不会暗中替换为之前或其他的包——请选择其他数据包或重试。',
  'sample.loadedOk': '数据包已加载并通过校验。',
  'sample.provenanceHeading': '数据来源',
  'sample.provenanceLine':
    '从数据侧合同按字节原样同步（上游提交 {commit}）。来源记录见 public/contracts/ 下的 PROVENANCE.md。',
  'sample.issueHeading': '校验问题：',

  'manifest.title': '数据包清单（manifest）',
  'manifest.schemaVersion': '合同（schema）版本',
  'manifest.datasetVersion': '数据集版本',
  'manifest.generatedAt': '生成时间（UTC）',
  'manifest.collectedFrom': '采集开始（UTC）',
  'manifest.collectedTo': '采集结束（UTC）',
  'manifest.postingFrom': '发布日期起',
  'manifest.postingTo': '发布日期止',
  'manifest.queryConfigVersion': '查询配置版本',
  'manifest.runStatus': '运行状态',
  'manifest.sampleCount': '样本数（岗位）',
  'manifest.timesNote':
    '时间按数据包中的原始值展示（UTC 精确时间与仅日期值），不使用构建或查看时间替代。',

  'stale.banner': '该快照已较旧：生成于 {days} 天前（阈值 {threshold} 天），数据可能过期。',

  'section.skills': '技能（{count}）',
  'section.jobs': '市场岗位（{count}）',
  'section.courses': '课程（{count}）',
  'section.resources': '学习资源（{count}）',
  'section.opportunities': '已批准机会（{count}）',

  'empty.bundle': '该数据包没有任何记录，下方各节展示对应空状态。',
  'empty.skills': '此包中没有技能。',
  'empty.jobs': '此包中没有市场岗位。',
  'empty.courses': '此包中没有课程。',
  'empty.resources': '此包中没有学习资源。',
  'empty.opportunities': '此包中没有已批准机会。',

  'skill.id': 'skill_id',
  'skill.label': '名称',
  'skill.category': '类别',
  'skill.aliases': '别名',

  'field.employer': '雇主',
  'field.source': '来源',
  'field.sourceJobId': '来源岗位 ID',
  'field.role': '职业方向（role_id）',
  'field.roleSubtype': '方向子类',
  'field.classification': '分类状态',
  'field.careerLevel': '职业阶段',
  'field.marketArea': '地区',
  'field.posted': '发布时间',
  'field.firstSeen': '首次发现（UTC）',
  'field.lastSeen': '最近发现（UTC）',
  'field.technicalSkills': '技术技能',
  'field.softSkills': '软技能',
  'field.descriptionStatus': '描述状态',
  'field.analyzable': '描述可分析',
  'field.yes': '是',
  'field.no': '否',
  'field.notSet': '未设置',
  'field.noRoleId': '不计入主类（待复核）',
  'field.timezone': '时区',
  'field.sourceUrl': '原始来源',
  'field.officialUrl': '官方页面',
  'field.calendarYear': '学年',
  'field.candidateSkills': '候选技能',
  'field.evidence': '依据（原文）',
  'field.verifiedAt': '核实时间（UTC）',
  'field.prerequisiteNote': '先修说明',
  'field.resourceType': '类型',
  'field.level': '难度级别',
  'field.eligibilityNote': '参与资格',
  'field.kind': '形式',
  'field.activityTypes': '活动类型',
  'field.topics': '主题',
  'field.skills': '技能',
  'field.beginnerLevel': '门槛',
  'field.format': '参与方式',
  'field.location': '地点',
  'field.start': '开始',
  'field.end': '结束',
  'field.deadline': '截止',
  'field.reviewStatus': '审核状态',
  'field.reasons': '分类依据（原文）',
  'field.registrationUrl': '报名链接',
  'field.changePending': '有待复核的变更',
  'field.originalNote':
    '官方名称与来源证据保留原文；规范 ID 不做翻译。',

  'ph.title': '{page} — 尚未实现',
  'ph.planRef': '对应计划任务：{ref}',
  'ph.noFake':
    '此页面刻意没有内容：不模拟登录、收藏、提交或任何结果。保留导航入口是为了让站点结构可见。',

  'ph.market.desc': '将展示岗位规模、八类角色／地区／阶段／日期筛选及技能提及率（任务 A2）。',
  'ph.compare.desc': '将比较两个职业方向的技能提及率与共同分母（任务 A2）。',
  'ph.courses.desc': '将展示 UTSC 课程与学习资源到技能的映射，以及候选技能确认（任务 A3）。',
  'ph.opportunities.desc': '将浏览已批准的社团活动与持续机会，并支持筛选（任务 A5）。',
  'ph.profile.desc': '将在真实账户就绪后提供个人画像、收藏与进度（任务 A1／A4／A6）。',

  'notfound.title': '页面不存在',
  'notfound.message': '该地址不匹配本站任何页面。',
  'notfound.back': '返回首页',

  'errorBoundary.title': '页面渲染出现错误',
  'errorBoundary.message': '发生了意外错误。出错前展示的数据未受影响，可以返回或重新加载。',
  'errorBoundary.reload': '重新加载页面',

  'footer.preview': '开发预览（A0），不是已部署产品。',
  'footer.contract': '合同按字节原样同步自上游提交 {commit}。',
  'footer.dataRepo': '数据仓库（Seraphina）',
  'footer.websiteRepo': '网站仓库',
  'footer.provenance': '来源记录',
  'footer.langNote': '语言切换只影响界面文字；ID、筛选条件和当前页面保持不变。',
}

export default zh
