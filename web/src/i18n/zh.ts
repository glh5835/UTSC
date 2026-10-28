import type { Dictionary } from './en'

/**
 * Chinese dictionary. Must cover every English key (enforced by the
 * Dictionary type). Interpolation placeholders match en.ts exactly.
 */

const zh: Dictionary = {
  'app.title': 'UTSC 职业与实践导航',
  'app.tagline': '比较数据职业方向、确认自己的技能，找到课程与社团实践机会。',
  'app.syntheticBanner':
    '开发预览（A0–A2）：页面展示的全部数据为 SYNTHETIC 人工样例（合同 fixtures 与网站侧演示包），不是真实市场或活动数据。',
  'app.skipToContent': '跳到主内容',
  'app.languageSwitch': '切换语言',
  'app.primaryNav': '主导航',

  'nav.home': '首页',
  'nav.sample': '样例数据（只读）',
  'nav.account': '账户',
  'nav.market': '市场概览',
  'nav.compare': '方向比较',
  'nav.courses': '课程与技能',
  'nav.opportunities': '实践机会',
  'nav.profile': '个人画像',

  'home.title': '首页',
  'home.intro':
    '本网站面向 UTSC 学生，正在开发中。A0–A2 已交付项目基础、共同数据合同、运行时校验、只读样例、真实 Supabase 账户（A1），以及公开的市场概览与方向比较页（A2）。',
  'home.workingTitle': '当前已实现',
  'home.workingItem1':
    '基础导航与全局中英文切换；规范 ID、筛选条件和当前页面不随语言改变。',
  'home.workingItem2':
    '只读样例数据展示：从共同合同 fixtures 经运行时校验层加载。',
  'home.workingItem3':
    '加载、错误、空数据和旧数据提示；损坏数据包整体拒收，不会被暗中替换。',
  'home.sampleCta': '打开样例数据展示',
  'home.pendingTitle': '尚未实现（计划阶段）',
  'home.pendingA1': 'A1 — 数据库、权限与最小账户页已实现（见"账户"）；完整的画像/收藏/路径管理仍在 A4/A6。',
  'home.pendingA2': 'A2 —— 公开市场概览与方向比较已实现并完成本地验收（见“市场”“比较”页）；D4 固定案例已在未合并候选的隔离检查中一致，正式 1.1 合同／数据包发布仍待双方决定。',
  'home.pendingA3': 'A3 — 课程—技能映射与经历候选技能提取。',
  'home.pendingA4': 'A4 — 推荐与学习路径。',
  'home.pendingA5': 'A5 — 机会浏览、分类筛选与日历导出。',
  'home.pendingA6': 'A6 — 个人画像、收藏与路径进度（依赖 A1 账户）。',
  'home.pendingA7': 'A7 — 发布适配器与 ICS 日历导出。',
  'home.pendingA8': 'A8 — 部署与端到端验收。',
  'home.honestyNote':
    '登录与账户使用真实 Supabase Auth（A1）；收藏、提交或发布尚未实现，也没有模拟这些功能。本站任何内容都不应被理解为已正式发布的招聘数据、开课或真实活动信息。',

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

  'market.intro':
    '基于版本化合同数据包的正式市场统计：八个规范角色、地区／阶段／发布日期筛选与技能提及率。公开页面，无需登录。',
  'market.upstreamNote':
    '合同 schema 为上游提交 {commit} 的按字节原样副本。数据包来源记录见 public/contracts/。',
  'market.datasetLegend': '选择数据包',
  'market.dataset.demo.label': 'A2 演示包',
  'market.dataset.demo.note':
    '网站侧人工构造的 SYNTHETIC 样例，用于开发与人工预期值测试。符合合同，但不是上游数据，也不是真实市场快照。',
  'market.dataset.websiteSide': '网站侧构造',
  'market.loading': '正在加载并校验数据…',
  'market.errorMessage': '数据包无法获取。请确认本地服务正在运行后重试。',
  'market.datasetHeading': '数据集',
  'market.runStatusCaveat': '运行不完整',
  'market.timesNote':
    '生成、采集与发布时间分别标注，按包内原始值显示，不以构建或查看时间替代。',
  'market.partialBanner': '该数据包标记为“部分”：采集运行未完成，计数可能低估市场。',
  'market.filterHeading': '筛选',
  'market.filterSemanticsNote':
    '未勾选的维度表示不限制（全部）；同一维度内多选为 OR；不同维度之间为 AND。',
  'market.orSemantics': '维度内 OR',
  'market.dimension.role': '角色',
  'market.dimension.area': '地区',
  'market.dimension.level': '职业阶段',
  'market.dimension.date': '发布日期',
  'market.allRoles': '全部角色',
  'market.allAreas': '全部地区',
  'market.allLevels': '全部阶段',
  'market.allDates': '全部日期',
  'market.inclusiveBounds': '边界日期当天含在内',
  'market.dateFrom': '发布起始',
  'market.dateTo': '发布截止',
  'market.dateNote':
    '筛选匹配合同 posted_date，边界日期当天含在内。发布日期未知的岗位不会被视为满足任何生效的日期条件。',
  'market.dateDraftNote':
    '日期修改会保留在输入框中，只有应用合法范围后才影响结果；范围不完整或起止颠倒时不会改变当前结果。',
  'market.dateApply': '应用日期范围',
  'market.dateRangeInvalid': '请输入有效的日历日期后再应用；当前输入已保留。',
  'market.dateRangeReversed': '起始日期不能晚于截止日期；当前输入已保留，请修正后重新应用。',
  'market.clearFilters': '清空全部筛选',
  'market.filterActive': '筛选已生效——当前筛选集已写入网址，可刷新或前进后退恢复。',
  'market.summaryHeading': '样本与描述覆盖',
  'market.formalSample': 'F —— 符合口径且满足筛选的岗位数',
  'market.formalOutOfFormal': '（包内符合口径岗位共 {total}）',
  'market.analyzableDescriptions': 'D —— 描述可分析的岗位数（D/F）',
  'market.notAnalyzable': '未纳入描述分析',
  'market.notAnalyzableSplit': '缺描述 {missing}，不可获取 {unavailable}，有描述但不可分析 {present}',
  'market.metricsNote':
    'F = 满足筛选的规范岗位数；D = F 中描述可分析者。以下所有技能提及率共用同一 D 作分母；每个岗位每项技能最多计一次。',
  'market.rolesHeading': '八个规范角色的样本分布',
  'market.roleDistributionNote':
    '本表有意忽略已选角色，以保留全部八类；地区、阶段和日期筛选仍然生效。因此，表中合计不一定等于上方当前筛选的 F。',
  'market.col.role': '角色',
  'market.col.skill': '技能（规范 ID）',
  'market.col.sample': '岗位数（F）',
  'market.col.analyzable': '可分析（D）',
  'market.col.jobsMentioning': '提及岗位（N/D）',
  'market.col.rate': '提及率（N/D）',
  'market.col.bar': '条形（与本表数值一致）',
  'market.exclusionsNote':
    '未计入上行统计：角色待复核 {roleReview}、范围外 {roleOutside}、阶段未知或待复核 {levelReview}。它们不会被打包成第九类角色。',
  'market.techSkills': '技术技能（{count}）',
  'market.softSkills': '软技能（{count}）',
  'market.noAnalyzableData': '暂无可分析数据：D = 0，因此不显示任何提及率（包括 0%）。',
  'market.noAnalyzableDataShort': '无可分析数据',
  'market.smallSampleHint':
    '样本较少：可分析描述仅 {d} 条（< {threshold}）。这只是产品提示阈值，不代表任何统计显著性。',
  'market.rateNote': '提及率 = N/D，其中 D = {d}。原始计算保留精度，仅在显示时舍入。',
  'market.subtypeLegend': '以下为 {role} 的子标签（role_subtype），不是新增类别：',
  'market.noMatchingJobs': '当前筛选下没有符合口径的岗位。请调整或清空筛选。',
  'market.failedTitle': '该数据包不可用',
  'market.failedRefusal':
    '数据包清单显示采集运行状态为 failed（失败）。不基于它计算任何统计——请选择其他数据包或重试。失败的运行不会当作数据展示。',
  'market.emptyPackage':
    '该数据包不含任何记录（空数据集），因此没有任何可统计内容。这与“当前筛选下无结果”是两种不同情况。',

  'market.scopeNote':
    '正式统计只纳入角色分类为 classified 且属于八个规范角色、阶段分类为 classified 且属于实习／应届／入门的岗位。待复核、范围外、未知与可能偏资深一律排除。',

  'compare.intro':
    '在相同地区、阶段、日期条件下比较八个规范方向中的若干角色。每个角色始终使用自己的样本数和可分析描述数作分母。',
  'compare.pickHeading': '选择要比较的角色',
  'compare.pickNote': '选择两个或更多角色。比较沿用下方共享的地区／阶段／日期筛选。',
  'compare.pickMore': '请至少选择两个角色再进行比较。',
  'compare.techHeading': '各角色技术技能提及率',
  'compare.softHeading': '各角色软技能提及率',
  'compare.smallSampleNote': '有一个或多个角色的可分析描述少于 {threshold} 条——产品提示，非统计结论。',
  'compare.col.metric': '指标／技能',
  'compare.row.sample': 'F（样本）',
  'compare.row.analyzable': 'D（可分析）',
  'compare.note': '每格为该角色自身分母下的 N/D；“—”表示该角色分母为零。',

  'account.intro':
    '使用真实 Supabase 账户登录后，可读取和保存自己的个人资料。无账户时公共样例页面照常可用；个人数据由数据库行级安全保护，不靠隐藏按钮。',
  'account.notConfiguredTitle': '尚未配置 Supabase',
  'account.notConfiguredBody':
    '本构建没有配置 Supabase 端点，账户功能不可用。公共样例页面仍可浏览。页面不展示任何假用户、假 token 或模拟登录成功。',
  'account.notConfiguredNote': '设置以下两个环境变量（不含任何私密密钥）后重新启动开发服务器或重新构建：',
  'account.loadingSession': '正在检查会话……',
  'account.signInTitle': '登录',
  'account.signUpTitle': '注册账户',
  'account.emailLabel': '邮箱',
  'account.passwordLabel': '密码（至少 8 个字符）',
  'account.signIn': '登录',
  'account.signUp': '注册',
  'account.working': '处理中……',
  'account.switchToSignUp': '还没有账户？注册',
  'account.switchToSignIn': '已注册？登录',
  'account.confirmationRequired':
    '注册已受理。本项目要求邮箱确认：请查收邮件（本地测试邮件工具 Mailpit：http://127.0.0.1:55424），确认后才能登录。当前并未登录。',
  'account.errorGeneric': '操作未成功，请重试。',
  'account.signedInAs': '当前登录',
  'account.loadingProfile': '正在加载个人资料……',
  'account.profileLoadFailed': '个人资料加载失败：',
  'account.displayName': '显示名称',
  'account.courseIds': '已完成课程 ID',
  'account.courseIdsPlaceholder': 'course_a, course_b',
  'account.courseIdsHint':
    '逗号分隔的课程 ID，保存到您自己的 profiles 行（合同字段 completed_course_ids）。行级安全按所有者限制。',
  'account.save': '保存资料',
  'account.saving': '保存中……',
  'account.saved': '已保存到您自己的行。',
  'account.saveFailed': '保存失败：',
  'account.saveStale': '已保存，但保存期间登录账号发生了切换——现在显示的是新账号。',
  'account.signOut': '退出登录',
  'account.scopeNote':
    'A1 范围：仅个人资料读取/保存。收藏、路径与技能提取尚无界面；候选技能不会被自动确认。',

  'ph.courses.desc': '将展示 UTSC 课程与学习资源到技能的映射，以及候选技能确认（任务 A3）。',
  'ph.opportunities.desc': '将浏览已批准的社团活动与持续机会，并支持筛选（任务 A5）。',
  'ph.profile.desc': '账户功能已就绪（见“账户”页）；个人画像、收藏与路径将随任务 A4/A6 提供。',

  'notfound.title': '页面不存在',
  'notfound.message': '该地址不匹配本站任何页面。',
  'notfound.back': '返回首页',

  'errorBoundary.title': '页面渲染出现错误',
  'errorBoundary.message': '发生了意外错误。出错前展示的数据未受影响，可以返回或重新加载。',
  'errorBoundary.reload': '重新加载页面',

  'footer.preview': '开发预览（A0–A2），不是已部署产品。',
  'footer.contract': '合同按字节原样同步自上游提交 {commit}。',
  'footer.dataRepo': '数据仓库（Seraphina）',
  'footer.websiteRepo': '网站仓库',
  'footer.provenance': '来源记录',
  'footer.langNote': '语言切换只影响界面文字；ID、筛选条件和当前页面保持不变。',
}

export default zh
