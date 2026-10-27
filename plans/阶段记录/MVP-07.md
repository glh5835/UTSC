# MVP-07 最终本地验收与交付

日期：2026年10月21日（Asia/Shanghai）。执行者：Codex。结论：**T07.1–T07.6 的本机内部演示验收与交付完成。221 项程序回归、26 项完整断网浏览器检查通过；干净交付目录与 ZIP 本机解压副本另经双视口实际启动和下载验证。交付性质为 SYNTHETIC 内部交互成果，真实历史批次和 A04 真人分类复核未取得/开展，不能宣称 A01–A10 无条件全部通过。完成本轮后停止。**

## 一 前置核实与保留

先读三份当前规划、数据契约、MVP-00 至 MVP-06 阶段记录及当前验收追踪，核对实际应用/模块/锁定依赖、原始来源基线和已保存证据。开始时有102个源码/文档/固定数据文件，不含 artifacts、环境和缓存；没有 MVP-07 记录或正式交付目录，源码根目录也没有默认公共发布。既有实现可复用，无须重建应用。

固定输入仍为独立人工12行、10个唯一岗位，F10/D8；sql4/8=50%，python3/8=37.5%；DA6/4、BI4/4，Python差+25pp。原分析包 `synthetic-analysis-c7459431a5c4655471e84a71`、资源包 `resource-catalog-c92c792137f0ef547e0960e0` 的所有文件/内容身份校验通过，原统计可复算，10个独立答案继续由程序回归核对。方法是代理编写样例及自动检查，不是独立真人标注。

资源沿用15门官方课程AGENT核对、6个受阻待审入口、2个PROJECT DESIGNED练习、2官方/2练习已核对技能映射及1条待审映射，零真实活动。没有联网重新核对来源、开设、名额或个人资格。只复核本地已保存证据/时效与实际页面，不将网页存在等同于当前可报名。

原 data（含 raw、输入、词典、目录和旧分析）、chat file、MVP-00–06记录、历史规划和旧财务项目只读。未调用招聘/模型或其他业务API，未安装新依赖、fork、采集Instagram、登录校内系统、部署或发布仓库。所有测试修改、故障和独立自述只在 artifacts 隔离副本。

## 二 T07 逐项结果

| 任务 | 实际完成 | 证据/边界 |
| --- | --- | --- |
| T07.1 | 对照R01–R12、A01–A10逐项判定；复用221项回归，核对真实输入缺口 | 真人A04未执行；不填一致率或真实岗位计数。没有发现需要改变业务算法的阻断问题 |
| T07.2 | 实际启动器运行隔离应用；市场筛选/图表/来源、比较、空白/有经历/无样本/无资源画像、课程、清空、四类审核、发布/回退和下载 | 26项完整浏览器检查，使用SYNTHETIC及LOCAL_MAINTENANCE |
| T07.3 | Python子进程loopback-only保护和浏览器非本机HTTP阻断；重复完整流程，主动外链失败后继续本地操作 | 10个实际Python进程激活保护，30次保留地址探针在联网前拒绝，其他应用外连尝试0；非整机物理断网 |
| T07.4 | 未清空独立中文画像时实际停止/重启维护和学生服务；原标签页重新载入及新会话为空，公共审核/发布保留；缺文件/坏文件/少样本/无活动检查 | 缺源拒绝保存、坏包拒绝重载、SQLite指针/历史事务失败恢复、整包回退及未知/过期活动都有实际证据 |
| T07.5 | 1440×1000与390×844实测；中文输入、跨页、标准控件、来源/技能片段、图表数值、真实下载、日志/公共数据/交付内容检查 | 完整流程13张遮挡截图、12个下载；正式目录与ZIP各再双视口/4下载/2截图，合计20下载、17截图 |
| T07.6 | 唯一正式目录及同名传输ZIP；安装/启动条件、数据说明、7分钟演示、清单、依赖与完整性文件、限制成文 | 本机复用既有环境；无Python/venv/wheels，不保证异机离线安装，学生试用未开展 |

本轮应用改动仅将 app/run_local 的阶段标识同步至MVP-07；未变更统计/分类/匹配、画像或审核业务规则。为首次演示建立独立干净完整发布，补充源码白名单打包、等效断网和交付入口核验脚本；没有将测试改动合并进正式基线。

## 三 A01–A10 最终判定

| 验收 | 本轮判定 | 已核实结果与剩余条件 |
| --- | --- | --- |
| A01 启动/断网 | 本机内部流程通过 | 实际run_local与正式批处理启动、只监听127.0.0.1；受限网络下完整本地流程/下载可用；外链被阻断仍可读保存内容。新机安装未测 |
| A02 来源/模式 | SYNTHETIC子项通过；真实历史条件未满足 | 每屏/下载可查完整release、原发布/采集日期；HISTORICAL缺版本明确无回落。真实批次、使用范围、上游适配仍未取得 |
| A03 统计/空状态 | 独立样例子项通过 | 10条独立答案、去重/别名/短正文/零分母及完整UI值核对；无真实岗位复核结果 |
| A04 真人分类 | NOT_PERFORMED，不标通过 | 无真实候选或真人基准，reviewed_records、role_agreement、stage_agreement仍null；不以代理测试代替50条或不足全审门槛 |
| A05 比较 | 本机SYNTHETIC通过 | 同完整版本/筛选，DA6/4对BI4/4，+25pp；审核后5/3对4/4、+41.666666…pp；同角色/筛选/零分母/切页/回退/下载均有证据 |
| A06 资源/活动 | 既有AGENT内容及本机联调子项通过 | 15课程超过10条内容门槛，6入口与1映射继续待审；课程存在不保证当前开设/资格；0真实活动，隔离日期异常卡不作报名。无真人正式批准或完整培养方案 |
| A07 画像/行动 | 本机内部情景通过 | 空白3条、SQL有实践且想练习2条、无样本通用探索、无资源0条；中文/跨页/未知资格/过期提示/清空通过；无总分、概率、自由文本推断 |
| A08 审核/发布 | 本机SYNTHETIC通过 | 原始数据不写；四类审核可重开，保存不发布，完整包显式切换/失败保护/回退；本地开关不是账号安全机制 |
| A09 导出/重启 | 本机通过 | CSV/Markdown实际下载解析，模式/版本/日期/M/D/来源/自述/条件及公式防护可查；未清空个人会话后重启为空，公共审核保留；个人测试下载不入交付 |
| A10 浏览器/交付 | 本机内部交付通过 | 桌面/窄屏标准控件与读取/下载、正式启动器、ZIP本机新路径验证、说明/脚本/清单及哈希齐备；未在另一台电脑安装或做学生试用 |

这不是“真实历史数据演示通过”或“十项无条件全部通过”。DEP-01–03的使用范围/真实批次/上游配置，DEP-05真人标签仍待提供；资源核对责任、正式批准、当前资格未自动补足。学生试用0次，不能把开发代理演示写成学生反馈。

## 四 实测证据与网络边界

程序回归：[pytest-final.xml](<E:/AI Analyzer2.0/artifacts/mvp-07/pytest-final.xml>)，**221 passed in 11.41s**，覆盖既有导入、清洗、分类、技能、目录/日期、会话、公共审核/发布/失败/回退和导出。锁文件49项版本全部匹配，66条生效依赖约束满足；[dependency-check.json](<E:/AI Analyzer2.0/artifacts/mvp-07/dependency-check.json>)。当前既有环境没有pip，`pip check`不可用；改用importlib.metadata与packaging实际核对，没有为此安装pip。

完整浏览器：[browser-check.json](<E:/AI Analyzer2.0/artifacts/mvp-07/browser-runs/acceptance-initial/browser-check.json>)，Chromium156.0.8078.4，26项检查、13截图、12个实际下载。图表trace角色[6,0,4,0,0]、Python37.5/SQL50与原统计相等；左右独立计数与未舍入pp另通过真实CSV解析。所有自动截图mask textarea，无整页HTML转储；公共库/包/服务日志独立个人哨兵泄漏=[]，page_errors=[]，无非预期外部页面请求。

隔离方式是QA专用 `scripts/offline_guard/sitecustomize.py`，仅通过子进程PYTHONPATH启用，不装入系统或产品默认环境。拦截Python socket connect/connect_ex/sendto、DNS及async连接，允许numeric loopback/localhost；清除测试进程代理配置。每个启动器与Streamlit子进程都记录guard_active，并用203.0.113.1/2和offline-probe.invalid探针验证在实际连接/解析前拒绝。主流程[python-network.jsonl](<E:/AI Analyzer2.0/artifacts/mvp-07/browser-runs/acceptance-initial/python-network.jsonl>)记录10个进程、30次预设拒绝，unexpected_outbound_attempts=[]。浏览器另拦非本机HTTP(S)，主动导航官方来源URL被阻断，原页面资源阅读、生成和下载仍正常。

没有修改系统防火墙或关闭全机网卡；不将Python/浏览器等效隔离说成内核防火墙、全机抓包或原生扩展网络安全认证。现有应用源码无招聘/模型/自动资源远程客户端，运行页面和已核对内容都来自本地。外部网站本身、校内受限系统和首次依赖安装不在离线可用范围。

实际重启测试在未清空独立文本/行动时停止两个自有进程树，重启后原标签页重载为空，另开会话也为空；公共草稿/审核/current仍能重开。损坏源和发布成员只改隔离副本，恢复后校验；SQLite注入history写入失败后事务回滚，编辑与审核保留，移除注入后发布成功，再整包回退。另一个隔离完整包验证零资源产生0行动；两个TEST FIXTURE活动缺年/过期在审核后仍无报名。正式交付不含这些故障或审核。

代表截图：[来源/匹配](<E:/AI Analyzer2.0/artifacts/mvp-07/browser-runs/acceptance-initial/source-and-skill-evidence.png>)、[课程条件](<E:/AI Analyzer2.0/artifacts/mvp-07/browser-runs/acceptance-initial/resource-conditions-desktop.png>)、[窄屏行动](<E:/AI Analyzer2.0/artifacts/mvp-07/browser-runs/acceptance-initial/actions-narrow-masked.png>)、[零资源](<E:/AI Analyzer2.0/artifacts/mvp-07/browser-runs/acceptance-initial/no-resources.png>)。已查看代表截图，文字、条件、来源和控件可读；宽表在组件内滚动，无整页横向溢出。

## 五 正式交付及再次验证

唯一目录：[UTSC-Career-Navigator-MVP07](<E:/AI Analyzer2.0/deliverables/UTSC-Career-Navigator-MVP07/README.md>)。同名[ZIP](<E:/AI Analyzer2.0/deliverables/UTSC-Career-Navigator-MVP07.zip>)只是传输副本。可双击[本机启动.bat](<E:/AI Analyzer2.0/deliverables/UTSC-Career-Navigator-MVP07/本机启动.bat>)，默认8510；明确复用`E:\AI Analyzer2.0\.venv\Scripts\python.exe`，没有打包或复制虚拟环境。标准启动器留给包内已安装环境，新的Python3.10首次安装条件已列明。

干净发布ID：`synthetic-release-c38c0cb34f80511488153c68`。由原固定分析与资源构建，原始文件未变；发布审核空、初始草稿空、无个人会话、真实活动0，HISTORICAL无版本。构建完成后仅清除新建初始编辑草稿并VACUUM该新数据库，避免构建机路径留在初始编辑区；已发布包/历史保留。首次维护显式保存当前包的源目录，不能将测试审核或已关闭练习带入基线。

[正式目录启动验证](<E:/AI Analyzer2.0/artifacts/mvp-07/package-smoke/verification.json>)通过实际批处理执行，1440/390两视口F10/D8、空白3行动、15课程/0真实活动，各真实下载CSV/Markdown并解析，离线练习链接均指向当前包，运行前后交付文件哈希不变。[ZIP解压验证](<E:/AI Analyzer2.0/artifacts/mvp-07/archive-smoke/verification.json>)在本机新的含中文/空格路径，先校验CRC及全部文件哈希，再重复实际启动器/双视口/4个下载及链接校验；不把同机重定位写成异机安装。两个核验也启用进程和浏览器网络隔离，结束停止自有服务。

启动/环境/版本与隐私见[本地交付说明](<E:/AI Analyzer2.0/plans/本地交付说明.md>)，5–8分钟步骤见[7分钟脚本](<E:/AI Analyzer2.0/plans/演示脚本.md>)，文件范围见[交付清单](<E:/AI Analyzer2.0/plans/交付清单.md>)。包内DELIVERY-MANIFEST.json为文件集合、bytes/SHA-256，ZIP哈希及字节数见[交付回执](<E:/AI Analyzer2.0/artifacts/mvp-07/delivery-receipt.json>)。包内排除个人Markdown测试下载、服务器日志、原始chat附件、旧财务资料、密钥/凭据、开发环境/浏览器资料/缓存及故障包；保留结构化QA报告、网络日志、遮挡截图和干净统计CSV证据。

## 六 来源/文档收尾与停止

[开始基线](<E:/AI Analyzer2.0/artifacts/mvp-07/preservation-before.json>)、[结束核对](<E:/AI Analyzer2.0/artifacts/mvp-07/preservation-after.json>)和[最终检查](<E:/AI Analyzer2.0/artifacts/mvp-07/final-check.json>)逐项核对102个原文件的范围；所有旧阶段、原data和附件哈希不变，旧财务项目基线覆盖49文件及HEAD/Git状态不变，不扩大为旧环境/缓存全量校验。当前文档链接、表格/围栏、48任务/8段历史prompt、唯一交付及来源一致；T00–07共48任务勾选，但A04和真实数据缺口仍明确保留。

真实招聘尚未取得，0真实导入不能据此描述市场规模；真人复核未开展用null/NOT_PERFORMED，不造计数或百分数。仅两技能、6入口/1映射待审、课程当前开设/资格未知，不作完整职业路径或资格承诺。活动仍真实0，测试卡不计覆盖。未做异机首次安装、学生试用、多人账号、实时采集、模型、财务、部署或仓库发布。

本轮本地内部交付完成，自有测试/核验服务均停止；没有未来提醒或后台采集。**在MVP-07停止，不自动开启后续产品开发。**
