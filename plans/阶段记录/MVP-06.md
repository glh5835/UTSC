# MVP-06 本地审核、完整发布回退与下载

日期：2026年10月21日（Asia/Shanghai）。执行者：Codex。状态：**T06.1–T06.6 完成；221 项程序测试、19 项实际浏览器检查通过，实际下载并解析 9 个文件，保存 8 张遮挡文本框的截图。仅为独立 SYNTHETIC / LOCAL_MAINTENANCE 的本机验证，A08/A09 按下述子项通过，不代表真人审核、真实市场或最终交付验收。只完成至 MVP-06，MVP-07 未开始。**

## 一 前置与本次范围

先读当前项目计划、首版需求规格、MVP 任务、数据契约及 MVP-02 至 MVP-05 记录，核对实际模块、固定分析和资源。开始时有 95 个源码/说明/固定输入文件，不含环境、缓存和 artifacts；没有审核库、发布指针、完整 release 或 R11 下载模块。复用已有导入、清洗分类、技能匹配、纯统计、只读质量、市场比较、资源与会话行动代码。

原固定分析仍是 `synthetic-analysis-c7459431a5c4655471e84a71`，源输入 12 行，F10/D8，DA F6/D4 对 BI F4/D4，Python 差 +25pp。当前函数复算与源包统计相等，包成员/内容身份通过校验。资源源包仍为 `resource-catalog-c92c792137f0ef547e0960e0`：15 门官方课程 AGENT 核对、6 个待审入口、2 个项目练习，2 官方/2 练习已核对映射及 1 条待审映射，零真实活动。见[前置核对](<E:/AI Analyzer2.0/artifacts/mvp-06/preflight.json>)。

沿用既有独立环境与锁定依赖，未安装新依赖，未重新访问官方网页。没有招聘/模型 API、Instagram、自动采集、财务、多人账号、部署、仓库发布或 fork。raw、全部既有固定输入/资源/分析包、chat file、旧财务项目及 MVP-00 至 05 记录只读。

## 二 T06 到实际实现

| 任务 | 已实现与检查 | 边界 |
| --- | --- | --- |
| T06.1 | 默认学生只读；显式 `--maintenance` 开本地维护；分类、资源、映射、活动四类编辑；对象/待审筛选；理由、标识、时刻与内容哈希 | 启动开关不是账号、认证或安全权限机制；仅可信本机、127.0.0.1 |
| T06.2 | SQLite 追加审核，保留旧/新值与 supersedes；关闭/重开后恢复；草稿 revision 防止过期写入；原提议与有效分类分开 | LOCAL_MAINTENANCE 不标 HUMAN；个人画像不传入公共保存/发布模块 |
| T06.3 | Save draft sources / Save review 不发布；完整包全部成员、模式、词典、证据、审核、提及、统计验证后切指针；完整回退 | current 与历史同事务；学生一个 bundle、一次显式重载；失败不逐表回落 |
| T06.4 | 实际比较 CSV 与个人行动 Markdown 下载；模式、各版本、日期精度/采集区间、M/D、来源和自述；公式防护 | 统计 CSV 含技能和岗位来源行；个人自由文本只在主动 Markdown 下载内 |
| T06.5 | dirty/签名/已载入发布变化阻断旧行动导出；相同角色无比较下载；坏 JSON/字段类型、源/包损坏、保存/包写入/指针事务故障保护 | 坏新包不替换完整旧内存；失败编辑保留；无自动补数据/补三个行动 |
| T06.6 | 在 artifacts 独立数据上实际保存、重开、发布、坏输入/事务失败恢复、整包回退、两个服务重启和原标签页重载、下载解析 | 全部招聘及测试自述是 SYNTHETIC，活动异常卡为 TEST FIXTURE；不替代学生试用或完整最终断网演示 |

## 三 审核和完整版本规则

公共库分模式记录 draft、reviews、current 和 history。审核字段沿用契约：review_id、对象/内容哈希、old_value/new_value、reason、reviewer_id、review_method、reviewed_at、status、rule_version、supersedes_review_id。方法固定 LOCAL_MAINTENANCE；审核身份是本机标签，不校验真实人员身份。表单只接收白名单公共字段；提示维护人员不粘贴学生信息。

保存不改变学生版本。DRAFT 不应用；以最新非 DRAFT 决定处理。APPROVED 才应用修改，REJECTED / NEEDS_RECHECK 暂停正式分类或资源关系。分类保留原 extraction proposal，通过 effective 标签计算正式统计与岗位明细，并重算提及、F/Q/E 和 M/D。源国家、日期、重复冲突等阻断事实不能靠改角色标签变成合格。真人分类复核仍 NOT_PERFORMED，复核条数、角色/阶段一致率均为 null。

资源/映射/活动只有既有已核对依据才允许本地批准，记录 LOCAL_VERIFIED，保留原 verified_at 和原 90/7 日复查时限。不将受阻来源或待审 SQL 映射靠点击批准变为核实；本轮没有新增内容核验。资源内容改动会使旧映射 NEEDS_RECHECK；必须在最新资源编辑之后重新审核映射，较早批准不能复用。源对象哈希变化时原有效审核阻断发布，须新的审核替代；旧记录仍保留。

每个不可变完整包包含岗位/提及/质量/统计/规则、词典、资源/映射/来源/活动、离线练习、全部公共审核、校验记录和清单。清单包含 release_id、模式、contract、分析/资源/映射/审核/词典/规则版本、所有文件 SHA-256/字节数、前版本、发布 UTC 时刻、LOCAL_ONLY 及行动策略。嵌套源包保留原阶段 NOT_PUBLISHED / action_generation_enabled=false 的历史字段，学生采用外层发布身份与 session-exploration-1；没有改写原资源包。

先写本次私有 `.building-*`、全包校验、原子换名，再通过 SQLite 事务同时更新 current 与带原因的发布历史。失败事务回滚；完成但未激活的包和失败临时目录可留诊断，不自动成为 current。回退重新验证曾发布的同模式包，只切完整指针并追加历史，不删新审核、不覆盖旧包。该机制验证正常程序写入/损坏拒绝，不是对有本机文件权限人员的防篡改认证，也未做断电/磁盘硬件故障实验。

学生会话只保存一个完整 bundle。已打开页面发现 current 改变时显示可用更新，仍读完整旧版本；点击 **Reload published version** 成功后一次切换岗位、资源、映射、审核。失败保留旧完整内存版本。所有统计和行动键包含 release_id；同分析内容再次发布为另一版本也不能复用旧行动。目录不会每次重跑偷读维护源；时间有效性仍按当前时刻计算，不能冻结活动有效期。无完整发布时只显示缺版本，不回落散装目录或另一招聘模式。

## 四 独立预期与实际结果

| 情景 | 独立预期与实际 |
| --- | --- |
| 基线完整包 | F10/D8；DA6/4、BI4/4；Python2/4 对1/4，+25pp；真实活动0 |
| 保存三条审核但未发布 | SYN:01 排除、PROJECT-SQL 关闭、其 SQL 映射明确重审均持久化；学生仍 F10/D8 和原 release |
| 联合发布后尚未重载 | 学生比较 CSV 仍全部标旧 release，旧完整目录/行动保留，并有更新提示 |
| 显式重载 | F9/D7；DA5/3、BI4/4；Python2/3 对1/4，差 +41.666666…pp；SQL1/3 对2/4，差 −16.666666…pp；同次重载切资源/映射/审核 |
| 想练习 SQL | 原有2个行动；关闭本地练习后重载使旧行动/下载隐藏；重生成只剩 CSCC43 条件阅读/核实，1个，不写可报名 |
| Montreal 零分母 | 两侧 D0，CSV 的率及百分点差为 N/A；不是假0% |
| 相同角色/模式切换 | 无比较下载；HISTORICAL 无版本明确显示，无 SYNTHETIC 结果遗留 |
| 坏审核输入 | 无效 JSON 和数组代替分类字段均拒绝，当前编辑保留，已存审核/发布不变 |
| 坏源/发布写入失败 | 改隔离源字节后拒绝发布；SQLite history 注入真实写入故障，指针与历史一起回滚，审核和原因不丢；移除注入后重试成功 |
| 坏发布成员 | 篡改隔离新包 reviews.json 后拒绝全包载入，学生继续导出原完整版本；恢复该测试成员后可回退 |
| 回退 | 恢复整个基线 release：F10/D8、原资源/映射/审核版本；新审核和发布历史仍保留 |
| 未清空自述后重启 | 保留独立测试文本及行动时停止两个服务，重启后在原标签页重新载入：个人表单为空且无旧下载；公共草稿/审核/current 仍可重开 |
| 活动审核 | 另一个隔离资源包中2个明确 TEST FIXTURE：缺年份为 DATE_UNKNOWN、历史结束为 EXPIRED，审核后仍无报名动作；回退后恢复0个真实活动 |

基线雇主字段另放 `= + - @` 四种公式前缀、逗号、引号和中文，仅在隔离人工输入内；实际 CSV 下载后用 csv.DictReader 核对前置单引号及原字符。单元另覆盖前导空白、控制字符、BOM 和负数差值。统计 CSV 中 N/A 与有依据的0分开；不从缺正文推定技能未出现。

## 五 A08/A09 子项与证据

| 验收子项 | 结果与证据 |
| --- | --- |
| A08 本地维护/审核持久化 | 通过；四类公共对象、原因/旧新值/哈希/标识/时刻/替代链；实际重开和服务重启；[浏览器记录](<E:/AI Analyzer2.0/artifacts/mvp-06/browser-runs/complete-verified/browser-check.json>) |
| A08 保存与发布分离 | 通过；未发布时学生统计与完整版本不变，发布后给更新提示，显式重载一次切全部成员 |
| A08 完整包校验/失败/回退 | 通过；实际坏源、坏发布成员、SQLite 指针/历史事务失败、重试及整包回退；单元另覆盖成员损坏、审核保存失败、包写入失败、过期审核/映射批准顺序 |
| A09 CSV/Markdown 真实下载 | 通过；9次实际下载并逐次解析关键断言，文件 bytes/SHA 列在浏览器记录；[比较基线](<E:/AI Analyzer2.0/artifacts/mvp-06/browser-runs/complete-verified/downloads/comparison-baseline.csv>)、[重载后比较](<E:/AI Analyzer2.0/artifacts/mvp-06/browser-runs/complete-verified/downloads/comparison-after-reload.csv>)、[零分母](<E:/AI Analyzer2.0/artifacts/mvp-06/browser-runs/complete-verified/downloads/comparison-zero-denominator.csv>) |
| A09 个人摘要/过期阻断 | 通过；[主动下载的合成自述 Markdown](<E:/AI Analyzer2.0/artifacts/mvp-06/browser-runs/complete-verified/downloads/actions-personal-explicit.md>)含目标、自述、M/D、日期、版本、资源链接/条件；改输入/载入版本后隐藏旧下载，重新计算后再提供 |
| A09 重启/隐私 | 通过本机子项；未清空独立画像后实际重启、原标签页重载和独立新会话均不恢复自述，公共审核和包保留；公共 DB/发布文件/服务日志测试哨兵泄漏为空；不对系统内存或浏览器内部行为作安全认证 |
| A10 桌面/窄屏局部 | 1440×1000 与独立390×844实际控件、下载、切页；8张截图，全部 mask textarea；不代替最终完整断网/异机交付或学生试用 |
| 全部程序回归 | **221 passed in 13.15s**：保留原175项，加46项发布/审核/导出及边界测试；[最终 JUnit](<E:/AI Analyzer2.0/artifacts/mvp-06/pytest-final-ordering.xml>) |

浏览器为 Chromium 156.0.8078.4；最终19项检查、9个文件、8张截图。代表截图：[新版本比较](<E:/AI Analyzer2.0/artifacts/mvp-06/browser-runs/complete-verified/comparison-new-version.png>)、[坏包重载保留旧完整版本](<E:/AI Analyzer2.0/artifacts/mvp-06/browser-runs/complete-verified/failed-reload-preserves-complete-version.png>)、[审核后合成活动](<E:/AI Analyzer2.0/artifacts/mvp-06/browser-runs/complete-verified/reviewed-test-opportunities.png>)、[窄屏行动](<E:/AI Analyzer2.0/artifacts/mvp-06/browser-runs/complete-verified/actions-narrow-masked.png>)。已查看代表桌面/窄屏截图，关键计数、来源版本、提示与条件可读；宽表在组件内滚动，无整页横向溢出。

测试浏览器阻断非本机 HTTP(S)，external_page_requests 与 page_errors 均为空；不等于全机抓包或 MVP-07 的完整断网验收。初次截图定位因页面标签与标题同名而中断，保留诊断；后续修正控件定位、强化字段类型/审核顺序和“未清空即重启”情景，最终以 complete-verified 为准，不覆盖中间记录。所有自有服务结束后停止。

## 六 运行、文件与来源保留

```powershell
Set-Location 'E:\AI Analyzer2.0'
# 学生只读；首次需维护人员明确创建完整版本
& '.\.venv\Scripts\python.exe' -X utf8 run_local.py
# 停止学生服务后，在可信本机启用公共维护
& '.\.venv\Scripts\python.exe' -X utf8 run_local.py --maintenance
& '.\.venv\Scripts\python.exe' -m pytest -q
# 两个相邻空闲端口，产物独立且 run-name 不能重复
& '.\.venv\Scripts\python.exe' -X utf8 scripts\browser_release_check.py --port 8511 --run-name another-new-run
```

默认公共位置为 `state/local/`；本次没有替用户在默认库发布测试修改，实际审核/发布/回退全部在 `artifacts/mvp-06/browser-runs/<run>/state/`。默认首次学生启动会显示缺版本，README 给出 Save draft sources → 公共审核 → Publish complete version → Reload published version 的具体操作。旧批处理沿用，不修改旧财务启动器；迁移和最终交付未在本阶段实施。

新增 releases.py、exports.py、maintenance_ui.py、审核/导出测试、浏览器脚本及收尾核对脚本；app/run_local 接入完整发布、维护开关和下载。已有分析/市场只改有效分类取值与 release 绑定；资源/画像 UI 接收已载入完整目录，资源增加诚实的 LOCAL_VERIFIED 状态及包内词典读取。README、当前三计划、契约补记和验收追踪同步；历史记录与固定内容保留。

[开始基线](<E:/AI Analyzer2.0/artifacts/mvp-06/preservation-before.json>)、[结束哈希核对](<E:/AI Analyzer2.0/artifacts/mvp-06/preservation-after.json>)、[版本/代码记录](<E:/AI Analyzer2.0/artifacts/mvp-06/runtime.json>)及[文档/来源/任务/服务收尾](<E:/AI Analyzer2.0/artifacts/mvp-06/final-check.json>)列明95个原文件的变化、受保护输入与历史不变、旧财务项目既有49文件和 HEAD/Git 状态不变、文档链接/围栏/表格、T00–06共42项勾选及T07六项未勾选。

## 七 限制与阶段退出

仍无真实招聘批次和真人标签/资源正式批准；仅 sql/python，不能视为完整能力画像。6个官方入口受阻、CSCB20 SQL 映射待审，课程当前开设、名额及个人资格未知。真实活动0；两个异常活动仅隔离 TEST FIXTURE，不计真实覆盖。LOCAL_VERIFIED 仅表示本地决定，不延长原核对时效；未知条件只给阅读/核实，不给报名承诺。

维护 UI 支持既有公共对象的受控审核，不提供校内登录或自动官方内容采集，也不以编辑理由创建新的已核实来源。完整包不嵌入全部原始 raw 文件，保存已规范化岗位正文、来源哈希/行号/观察与规则；需要检查原始字节时仍查只读源文件。个人 Markdown 中本地材料链接指向该本机发布包，迁移到其他电脑要同时提供包或调整路径。个人主动下载会包含用户自述，应由下载者自行保存；本应用不作公共保存或自动截图记录。

A08/A09 仅上述可复核本机子项通过，A01–A10 不整体标通过。没有打最终交付包、异机环境验证、完整最终断网演示或学生试用；没有远程账号或公开发布。下一阶段如另获授权，可使用当前契约、完整包机制、真实下载与失败证据；本次停止在 MVP-06，**不自动进入 MVP-07 最终交付**。
