# MVP-03 市场概览与两个方向比较

日期：2026年10月21日（Asia/Shanghai）。执行者：Codex。状态：**T03.1–T03.6 的独立 SYNTHETIC 路线完成；116 项测试和 18 项实际浏览器检查通过。只完成本阶段，不继续 MVP-04；不代表真实市场、真人复核、发布或完整功能验收通过。**

## 一 授权与前置核实

本次仅实施英文市场概览和两个方向比较。先核对当前主计划、首版需求规格、任务文档、数据契约、MVP-02 记录及实际源码。开始时有 68 个源码/规划/输入文件（不含环境、缓存和 artifacts）；没有 MVP-03 记录或市场/比较模块。复用原导入、处理、统计、快照存储和只读质量视图，沿用既有独立环境，没有安装依赖。

`read_snapshot` 已核验默认分析包的全部成员哈希、字节数、派生内容及身份；再用原 `statistics` 重算并与包内结果逐项相等，见[前置检查](<E:/AI Analyzer2.0/artifacts/mvp-03/preflight.json>)。最终单元回归再次覆盖 MVP-02 的导入、处理、统计和存储测试。固定分析 ID 保持 `synthetic-analysis-c7459431a5c4655471e84a71`，没有改输入、算法配置或统计口径。

只使用 `data/synthetic/inputs/mvp02-v1/` 及其已有分析包。raw、chat file、旧财务项目、早期样例/预期和 MVP-00/01/02 记录保持只读。没有 fork、招聘或模型 API、Instagram、实时采集、财务代码、推荐、个人画像、资源目录、审核发布、部署或仓库发布。

## 二 逐项完成与验收映射

| 任务 | 实现与实际验证 | 需求/验收与限制 |
| --- | --- | --- |
| T03.1 | 英文主界面；角色、地区、阶段筛选；默认 Toronto GTA；切页保留选择；重置为 Toronto GTA / All stages / All roles | R04、R05 / A05；区域和角色仅沿用契约；没有新增未知城市归组 |
| T03.2 | F、D、缺正文卡片，角色分布和技能率图；可读数量表与 M/D 文本；图表实际 trace 数值在浏览器读取核对 | R04 / A05；图、表、计数读取同一个概览结果；不是市场总体估计 |
| T03.3 | 两个不同角色共享模式、分析包、地区和阶段；每侧独立 F/D；共同/单侧检出及原精度百分点差；交换角色差值变号 | R05 / A05；同角色提示更换并清除旧图；零分母不造比例/差值 |
| T03.4 | 岗位标题、机构、地区、阶段、发布日期、纳入状态表；来源 URL、原采集时点、raw SHA/行号、观察去向、匹配片段/Unicode 位置可展开 | R03、R04 / A03、A05；URL 为 example.invalid，原日期为人工时钟；真人复核仍未开展 |
| T03.5 | 零岗位、全缺正文、单侧 D=0、正分母零检出、同角色、模式和新快照替换均有检查；改变筛选清除旧结果后同步重算 | R04、R05 / A05；HISTORICAL 没有文件时明确缺数据，不复用 SYNTHETIC 结果 |
| T03.6 | 真实本机 Chromium，1440×1000 与独立 390×844 会话；操作下拉框、切页、侧栏、模式和来源展开；保存 15 张截图 | R12 / A10 局部；不代替画像/资源/导出完整流程、真人试用或完整断网验收 |

## 三 当前固定样例与口径

| 数据或比较项 | 实际结果 |
| --- | --- |
| 模式、输入 | SYNTHETIC；12 行、10 个纳入岗位、8 份可分析正文，缺/短正文 2 个 |
| 默认 Toronto GTA / All stages / All roles | SQL 4/8=50.0%，Python 3/8=37.5% |
| Data Analyst | F=6、D=4；SQL 2/4=50.0%，Python 2/4=50.0% |
| Business Intelligence | F=4、D=4；SQL 2/4=50.0%，Python 1/4=25.0% |
| 左 Data Analyst 减右 BI | SQL +0.0 pp，Python +25.0 pp；交换为 Python −25.0 pp |
| 基线覆盖 | 仅 Toronto、Entry Level、上述两个角色；其他地区/阶段/角色显示空样本，不补数 |
| 少样本 | F 或 D <20 明确显示探索性及实际 F/D；19/20 边界有测试 |
| 零分母 | D=0 的率及依赖差值为 null → N/A；有分母无检出才为 0.0% |
| 人工审核、发布 | NOT_PERFORMED；真人复核数、角色/阶段一致率仍为 null；NOT PUBLISHED，没有 release_id |

地区选项为 Toronto GTA、Montreal Metro、Other Canada、All Canada；后者只是快照中已映射加拿大组的合计。All stages 加契约三阶段，All roles 加五方向。比较角色单独保留，概览角色不覆盖比较对，不连接个人目标或推荐。

`market.py` 对概览统一组装总统计、角色统计和明细；比较对每侧各调用一次既有纯统计函数。返回对象供指标、Plotly、表格和文字共同读取，百分点差使用原始率后再格式化。岗位明细数量及可用正文与统计不一致时拒绝输出。结果键包含模式、分析 ID、角色/地区/阶段；模式、成功导入、构建或筛选变化清除已有派生结果，同角色不输出重复比较。

“Both samples / Left sample only / Right sample only / Neither sample” 都是当前样本和词典检出标签，不表示职业独有；D=0 不构成技能不存在的证据。岗位数和技能提及不表示实时招聘、必需技能、竞争程度或推荐。

## 四 实际验证与证据

| 检查 | 结果与证据 |
| --- | --- |
| 单元与回归 | **116 passed in 3.65s**：保留原 95 项，新增 21 项概览、比较、同角色、零分母、键变化、只读、阈值和舍入规则检查；[JUnit XML](<E:/AI Analyzer2.0/artifacts/mvp-03/pytest-final.xml>) |
| 正常样例 | 核对独立算术答案、岗位集合与角色分布；比较每侧只调用一次统计；D=3 与 D=4 的单元情景核对原精度百分点差 |
| 浏览器 | **18 项检查通过**；Chromium 156.0.8078.4；[最终结果](<E:/AI Analyzer2.0/artifacts/mvp-03/browser-runs/acceptance/browser-check.json>) |
| 真实交互 | 实际操作全部地区与阶段选项、概览角色、两侧角色、同角色、交换、重置、切页、来源和匹配文本展开、模式切换 |
| 独立故障输入 | 在 artifacts 内复制并单独声明：全缺正文 F10/D0、左侧缺正文 F6/D0 对 F4/D4、BI 移除 Python 后右侧 Python 0/4 与差 +50pp、空文件；不改基线、不将预期答案写入算法 |
| 图表一致 | 浏览器读取 Plotly trace：角色 [6,0,4,0,0]、技能 [37.5,50]；比较左 [50,50]、右 [25,50]，与可读计数/分母及预期相符 |
| 桌面/窄屏 | 1440×1000、390×844；真实导入、构建、筛选、切页及比较可操作，无整页横向溢出；宽表在组件内滚动，关键率和 pp 同时用可换行文本呈现 |
| 页面网络与错误 | 外部页面请求 []、page_errors []；浏览器对非本机 HTTP(S) 请求设阻断规则。这只是已实现页面的检查，不声称 Python 进程网络抓包或完整产品断网验收 |
| 测试输入只读 | 浏览器前后，原输入及隔离测试输入 SHA-256 相同；所有新分析与截图位于 artifacts 的隔离目录 |
| 环境/代码 | [runtime.json](<E:/AI Analyzer2.0/artifacts/mvp-03/runtime.json>) 保存实际版本与代码哈希；没有新增依赖 |

实际浏览器入口为 `scripts/browser_market_check.py`，自行占用显式空闲本机端口，服务只监听 127.0.0.1；结束自动关闭自己的进程。中间失败记录保留：先修正重复技能文本定位与滚动后下拉框展开，再发现并修复 All 筛选重置标签空白；最终以 acceptance 为准。没有注入页面业务状态来代替控件操作。

截图包括[桌面概览](<E:/AI Analyzer2.0/artifacts/mvp-03/browser-runs/acceptance/overview-desktop.png>)、[桌面比较图](<E:/AI Analyzer2.0/artifacts/mvp-03/browser-runs/acceptance/comparison-skills-desktop.png>)、[来源与匹配文本](<E:/AI Analyzer2.0/artifacts/mvp-03/browser-runs/acceptance/source-and-matches-desktop.png>)、[窄屏概览数量](<E:/AI Analyzer2.0/artifacts/mvp-03/browser-runs/acceptance/overview-counts-narrow.png>)及[窄屏比较数量](<E:/AI Analyzer2.0/artifacts/mvp-03/browser-runs/acceptance/comparison-counts-narrow.png>)。已查看桌面与窄屏的代表性概览、比较图和数值摘要，确认文字和图表可读；完整 15 张清单在浏览器结果中。

## 五 使用、改动与保留检查

启动沿用原独立环境和批处理入口：先 Import snapshot，再 Build analysis snapshot。默认 Market overview；Compare directions 自动按共享地区/阶段及两侧角色更新；Data & quality 保留原五个只读标签页，其质量和审计数据明确标为整个快照，不受探索页筛选影响。

```powershell
Set-Location 'E:\AI Analyzer2.0'
& '.\.venv\Scripts\python.exe' -X utf8 run_local.py
& '.\.venv\Scripts\python.exe' -m pytest -q
& '.\.venv\Scripts\python.exe' -X utf8 scripts\browser_market_check.py --base-url http://127.0.0.1:8511 --run-name another-new-run
```

新增 `utsc_nav/market.py`、`market_ui.py`、`data_ui.py`、`tests/test_market.py` 和当前浏览器脚本。`app.py` 接入页面、过滤和会话失效，旧数据/质量页面抽取复用；`run_local.py` 仅同步阶段名。更新 README、三份当前规划、契约补记、验收追踪及本记录；原处理、导入、快照存储、质量模块和全部既有数据不改。

[保留基线](<E:/AI Analyzer2.0/artifacts/mvp-03/preservation-before.json>)与[结束核对](<E:/AI Analyzer2.0/artifacts/mvp-03/preservation-after.json>)记录既有源码、数据、附件、旧项目 49 个已纳入来源基线的文件及旧 HEAD/status；检查范围不包含旧项目环境或缓存。[最终一致性检查](<E:/AI Analyzer2.0/artifacts/mvp-03/final-check.json>)记录链接、任务/prompt 保留、测试、截图及测试端口状态。

## 六 限制与下一阶段输入

真实招聘批次、使用范围、上游实际地区映射和真人标签仍未取得；不能给出真实样本量、角色/阶段准确率或学生试用结果。词典只有 SQL 和 Python，分类只验证显式人工标题。SYNTHETIC 通过仅证明当前规则和交互行为，A04 真人复核、完整 A01/A10、资源/画像/审核/发布/导出验收仍未完成。

未来阶段可使用已验证的五角色枚举、词典、当前分析包、共享筛选和独立比较结果接口。MVP-04 如另获授权，才核对真实课程/实践资源、技能映射、条件与活动日期；目前没有资源库，也未提前抓取内容。**本次在 MVP-03 停止，测试服务已关闭，不自动执行 MVP-04。**


## 七 同阶段重复授权复核（recheck-20261021-205231）

本次重新读取当前主计划、需求规格、任务清单、契约和 MVP-02 记录，确认已有 T03.1–T03.6 实现及证据有效，故复用应用代码与统计口径。应用/统计/导入/快照存储/测试脚本的当前哈希与原 runtime.json 一致，没有重建应用或新增依赖。原阶段说明和 acceptance 证据保留，本次证据单独保存。

固定分析包再次通过全部成员与内容身份检查，重算统计与包内相等，仍为 SYNTHETIC F10/D8。**116 项测试通过（3.28s）；18 项真实浏览器检查通过，15 张新截图已保存。** 在 1440×1000 和独立 390×844 会话实际操作筛选、比较、切页、侧栏、相同角色和模式切换；图表计数、两侧 F/D 与百分点差保持一致；缺正文、零分母、单侧检出和探索性提示符合原任务要求。新桌面比较图和窄屏数值摘要已查看，宽表仍在组件内横向滚动，无整页横向溢出。

证据：[快照前置检查](<E:/AI Analyzer2.0/artifacts/mvp-03/rechecks/recheck-20261021-205231/preflight.json>)、[116 项测试](<E:/AI Analyzer2.0/artifacts/mvp-03/rechecks/recheck-20261021-205231/pytest.xml>)、[18 项浏览器检查与截图清单](<E:/AI Analyzer2.0/artifacts/mvp-03/browser-runs/recheck-20261021-205231/browser-check.json>)及[本次结束核对](<E:/AI Analyzer2.0/artifacts/mvp-03/rechecks/recheck-20261021-205231/result.json>)。

既有 raw、全部固定输入/分析包、chat file、MVP-00/01/02 记录和旧项目仍只读；应用代码未变，仅向本阶段记录追加本次复核。页面外部请求与脚本错误均为空，测试服务已停止。真实招聘批次和真人复核仍缺失，本次仍只证明 SYNTHETIC 计算与交互，未进行推荐、采集、模型、财务、部署或发布，未进入 MVP-04。
