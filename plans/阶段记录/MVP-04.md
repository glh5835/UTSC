# MVP-04 课程实践目录、技能映射与精选机会状态

日期：2026年10月21日（Asia/Shanghai）。执行者：Codex。状态：**T04.1–T04.6 的资源核对、目录和覆盖检查完成；151 项测试、10 项实际浏览器检查通过。15 门官方课程经 AGENT 内容核对；6 个入口和 1 条技能映射仍待核实。真实精选活动为 0。不进入 MVP-05 画像推荐。**

## 一 前置与范围

先读取当前主计划、首版需求规格、任务文档、数据契约和 MVP-02 记录，核对既有 sql/python ID、统计模块、MVP-03 页面与证据。开始时有 74 个源码/规划/固定输入文件（不含环境、缓存、artifacts），没有资源目录或 MVP-04 阶段记录。复用现有 Streamlit、Pandas、独立环境及来源/内容哈希模式，没有安装依赖。

课程内容由代理逐页读取公开官方网页后手动编写摘要；没有开发自动采集器，没有登录 ACORN/CLNx/Quercus，没有招聘/模型 API、Instagram、财务代码、部署或发布。原始附件、旧项目、既有 raw/输入/分析包及 MVP-00 至 03 记录保持只读。AGENT 核对不是 HUMAN 审核，也不伪造报名、当期开设或个人资格。

## 二 实际资源、映射与限制

| 内容 | 实际数量与结果 |
| --- | --- |
| 已核对官方课程 | **15 门**：公开 Academic Calendar 正文、列出先修/排除条件已读取，满足目标 15–25 和最低 10 条数量 |
| 已核实实践项目 | 0；实践入口正文未读到，不补数 |
| 待审官方候选入口 | 6：三个 Program Pathways 候选地址、Work Study、研究概览、CMS 暑期研究；返回 HTTP 403/不可访问，正文和条件未核实 |
| 本项目练习 | 2：Python 虚构 CSV 质量检查、SQL 唯一 ID/分组与空结果练习；独立于学校资源计数 |
| 总目录 | 23 条；默认显示 15 门课程加 2 个练习，待审入口须显式勾选 |
| 已核对官方技能关系 | 2：CSCA08 → python / INTRODUCES；CSCC43 → sql / TEACHES |
| 练习技能关系 | 2 条 PRACTICES；作者确认本练习内容，不冒充官方或真人审核 |
| 待审技能关系 | 1：CSCB20 → sql；当前日历写数据库查询但未命名 SQL，不进入技能筛选结果 |
| 其余课程 | 12 门没有映射记录；不把机器学习课名、R/SAS 或先修里的 Python 当成 Python 教学证据 |
| 真实精选活动 | **0**；完整空状态和官方查找入口可读，不编造开放活动 |
| 当前开设/开放/个人资格 | 全部课程 offered_term=null，offered_status/availability_status=UNKNOWN；个人资格未评估 |

逐条描述、适用对象、先修/排除、来源 URL、核对方法/时间、复查日与证据见[资源核对与覆盖报告](<E:/AI Analyzer2.0/plans/资源核对与覆盖.md>)以及 [resources.json](<E:/AI Analyzer2.0/data/resources/utsc-resources-v1/resources.json>)、[sources.json](<E:/AI Analyzer2.0/data/resources/utsc-resources-v1/sources.json>)。

例如 [CSCC43](https://utsc.calendar.utoronto.ca/course/cscc43h3) 明确涉及 SQL，但要求 CSCB09、CSCB63 和 GPA/POSt 条件；[CSCA08](https://utsc.calendar.utoronto.ca/course/csca08h3) 只把 Python 作为示例语言，不保证当前学期采用。课程存在不代表当前开设或新生可选。官方入口不可读取时只保留候选地址和失败记录，没有拿搜索摘要补具体条件。

## 三 T04.1–T04.6 与验收映射

| 任务 | 完成与验证 | 依赖和限制 |
| --- | --- | --- |
| T04.1 | 逐页读取 15 门官方课程；每条保存代理摘要、原 URL、适用对象、先修/排除及 UTC 核对时间 | Program Pathways/实践入口 6 条仍待审；不计入门槛。R06/A06 内容子项，不是完整路径联调 |
| T04.2 | 固定 sql/python 及原词典哈希；资源、来源和映射各有内容哈希，映射绑定资源与证据；分开存在、开设、开放、资格和核对状态 | 只有 2 条官方直接技能证据，1 条提议映射未通过；AGENT_VERIFIED 不等于 HUMAN 或正式 APPROVED |
| T04.3 | 两份 PROJECT DESIGNED 入门说明和独立虚构 CSV，包含条件、首步、预期产出和自查 | 不是官方课程、活动、学分或评测；本应用不安装/执行外部练习工具 |
| T04.4 | 新英文 Courses & practice 页面；技能、类型、学习等级筛选；未知/待审开关及空结果；无需先导入岗位即可离线读 | 学习等级是浏览标签，不替代官方先修或岗位阶段；目录与招聘模式独立 |
| T04.5 | 真实活动空状态；Toronto 日期、精度、报名状态分离；20 个独立日期向量、7 天复查与 4 张合成活动 UI 检查 | 异常活动仅在 tests/artifacts；缺年份/时区/过期不作当前报名行动，本阶段不生成报名按钮 |
| T04.6 | 五方向共享 Python/SQL 基础与概念背景逐项审计；桌面/窄屏目录交互、来源和条件可读，保存截图 | 不是五条完整培养方案；官方 Program Pathways 未核实，不生成个性化画像或行动。R07/A06/A10 仅已实现子项 |

五方向覆盖说明把数据分析/商业分析/BI/数据科学/数据工程分别连接到可阅读的统计、需求、数据库、系统或学习理论背景，并列出共同本地练习；每项标为本项目编辑的背景说明。高级课程仍有先修、GPA/POSt 条件；不能据此承诺适合某个学生或职业必备。

## 四 固定包与状态规则

资源包为 `data/resources/utsc-resources-v1/`，catalog_id=`resource-catalog-c92c792137f0ef547e0960e0`；[清单](<E:/AI Analyzer2.0/data/resources/utsc-resources-v1/manifest.json>)含 resources、mappings、sources、opportunities、两份练习及 sample.csv 的字节数和 SHA-256。它独立于 SYNTHETIC 招聘模式：OFFICIAL 是真实网页核对摘要，PROJECT_DESIGNED 是本项目练习，招聘仍没有 HISTORICAL 批次。没有 release 或发布指针。

资源包与原技能词典哈希不一致、成员变化、记录哈希不符、映射资源/证据绑定失效或新技能 ID 注入时拒绝加载，不回落假目录。读取时保存已校验的练习文本和 CSV，运行时没有网页请求。

普通资源按 America/Toronto 的核对当地日计算 90 日复查上限，超过复查日标 NEEDS_RECHECK；可显式读到过期说明，但已过期映射不满足技能筛选。待审资源 verified_at=null，checked_at 保存失败尝试时间，不虚填已核实。

活动用实际当前时刻及来源时区重算，原历史岗位快照不冻结活动。DATE 只有日历日：同日标 TIME_UNCONFIRMED，今天晚于明确截止/结束日才过期，不补 23:59；DATETIME 要有可解释偏移，缺年份、无效日期、时区未知及未消解夏令时为 DATE_UNKNOWN。取消、过期、未来和报名状态分别保留，未来不等于报名开放。本阶段 registration_action_available 始终 false，没有注册或推荐动作。

## 五 实际检查与证据

| 验证 | 结果 |
| --- | --- |
| 全部程序测试 | **151 passed in 3.63s**；包括原 116 项及新增 35 项资源/映射、复查、校验和活动状态测试；[JUnit](<E:/AI Analyzer2.0/artifacts/mvp-04/pytest-initial.xml>) |
| 内容审计 | [content-report.json](<E:/AI Analyzer2.0/artifacts/mvp-04/content-report.json>)：15 门课程、0 个已核实实践项目、6 待审入口、2 练习、2 官方/2 练习/1 待审技能映射、0 真实活动 |
| 真实目录浏览器 | **9 项检查通过**，1440×1000 和独立 390×844，Chromium 156.0.8078.4；[结果](<E:/AI Analyzer2.0/artifacts/mvp-04/browser-runs/verified/browser-check.json>) |
| 异常活动浏览器 | **1 项检查通过**，1440×1000 的 4 张 TEST FIXTURE 卡：EXPIRED、DATE_UNKNOWN、UPCOMING 且 CLOSED、TIME_UNCONFIRMED，无报名动作；[结果](<E:/AI Analyzer2.0/artifacts/mvp-04/browser-runs/event-states/browser-check.json>) |
| 时间边界 | 20 个预先给定的独立情景，另测 Toronto 午夜、90/7 天复查、夏令时歧义/不存在时刻及明确偏移；不是现实活动核验 |
| 原功能回归 | 实际导入/构建原 SYNTHETIC 基线，概览 F10/D8、比较 F6/D4 对 F4/D4、Python 差 +25pp；切 HISTORICAL 清除招聘结果，资源仍独立可读 |
| 外网与错误 | 两组浏览器外部页面请求和 page_errors 均为空；非本机 HTTP(S) 请求设为阻断。证明已实现目录本地可读可筛，不声称全机断网抓包或完整 A01 验收 |
| 只读与环境 | 源输入、隔离资源包前后哈希不变；没有新增依赖；实际版本/代码哈希见[runtime.json](<E:/AI Analyzer2.0/artifacts/mvp-04/runtime.json>) |

共保存 **9 张截图**，包括[桌面目录](<E:/AI Analyzer2.0/artifacts/mvp-04/browser-runs/verified/catalog-desktop.png>)、[课程条件](<E:/AI Analyzer2.0/artifacts/mvp-04/browser-runs/verified/sql-course-evidence.png>)、[待审入口](<E:/AI Analyzer2.0/artifacts/mvp-04/browser-runs/verified/pending-entry.png>)、[窄屏条件](<E:/AI Analyzer2.0/artifacts/mvp-04/browser-runs/verified/conditions-narrow.png>)、[独立练习](<E:/AI Analyzer2.0/artifacts/mvp-04/browser-runs/verified/exercise-narrow.png>)和[当天活动状态](<E:/AI Analyzer2.0/artifacts/mvp-04/browser-runs/event-states/synthetic-same-day.png>)。已查看桌面和窄屏代表截图，文字、条件及来源标签可读；宽表在组件内滚动，无整页横向溢出。

初次浏览器检查因下拉重绘及隐藏原生复选框定位中断，已保留诊断；最终用稳定后的可见选项和原生键盘操作，没有注入业务状态。活动分支只执行桌面，其结果原先继承了通用双视口元数据，现已改为实际桌面记录；主目录独立验证了两种视口。

## 六 使用、文件与保留

启动仍使用原批处理或 `run_local.py`；可直接选 **Courses & practice**，无需导入岗位。默认显示已核对课程与独立练习；按 Resource skill / Resource type / Learning level 筛选，选择 Inspect resource 查看条件和证据。待审勾选只展示未知内容，不把它变成已核实。

```powershell
Set-Location 'E:\AI Analyzer2.0'
& '.\.venv\Scripts\python.exe' -X utf8 run_local.py
& '.\.venv\Scripts\python.exe' -m pytest -q
& '.\.venv\Scripts\python.exe' -X utf8 scripts\browser_resources_check.py --base-url http://127.0.0.1:8511 --run-name another-new-run
# 仅测试产物内建立带明显 TEST FIXTURE 标识的异常活动
& '.\.venv\Scripts\python.exe' -X utf8 scripts\browser_resources_check.py --base-url http://127.0.0.1:8512 --run-name another-event-run --event-fixtures
```

新增 resources/resource_ui 模块、固定资源包、独立日期答案、测试、浏览器脚本、资源覆盖报告和本记录；app 增加目录路由，run_local 只更新阶段标识。当前 README、三份规划、契约及验收表同步状态，原处理/统计/导入/存储和旧阶段证据未改。[保留基线](<E:/AI Analyzer2.0/artifacts/mvp-04/preservation-before.json>)、[结束来源核对](<E:/AI Analyzer2.0/artifacts/mvp-04/preservation-after.json>)及[最终一致性检查](<E:/AI Analyzer2.0/artifacts/mvp-04/final-check.json>)记录受保护文件、文档链接、任务状态、测试和服务退出。

## 七 尚未核实项与退出

6 个 Program Pathways/实践候选入口受访问限制；CSCB20 的 SQL 映射缺直接依据；15 门课程本学期开设、名额、个人资格均未查明。当前课程目录仅覆盖两技能的共享基础，不能声称完整职业培养方案。真人资源审核、真实招聘批次、学生试用、画像推荐、审核发布及 R11 导出均未开展。本阶段达到内容与目录子项门槛，A06 的画像行动联调及完整 A01–A10 仍不标通过。

下一阶段如另获授权，可使用本资源包、原技能 ID、已核对/待审状态、两条独立练习和覆盖限制；需继续保留未知资格，不把受阻入口或代理核对自动升级为真人批准。本次测试服务已停止，**仅完成 MVP-04，不自动进入 MVP-05**。
