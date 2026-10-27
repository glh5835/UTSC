# MVP-05 会话画像、技能对照与规则探索行动

日期：2026年10月21日（Asia/Shanghai）。执行者：Codex。状态：**T05.1–T05.6 完成；175 项程序测试、10 项真实浏览器检查通过，保存 7 张脱敏截图。范围为 SYNTHETIC 岗位/独立测试自述和现有 AGENT 内容核对资源下的内部会话验证，不代表真实市场、真人批准或完整功能验收通过。完成后停在 MVP-05。**

## 一 前置核实与范围

先读三份当前规划、数据契约和 MVP-03/04 记录，检查实际比较模块、资源/映射及证据。开始时有 89 个源码/规划/固定输入文件（不含环境、缓存和 artifacts），没有画像或行动程序。固定分析包、比较 DA 与 BI 的 Python +25pp、资源包完整性和实际状态再次通过，见[前置检查](<E:/AI Analyzer2.0/artifacts/mvp-05/preflight.json>)。

沿用原 sql/python、统计函数、不可变分析包及资源读取；没有安装依赖或重新联网核对资源。原目录仍为 15 门课程、6 个受阻入口、2 个独立练习，2 条官方/2 条练习映射和 1 条待审映射。状态是 AGENT_VERIFIED/PROJECT_AUTHORED，不是 HUMAN 或正式 APPROVED。

本阶段授权实现 session-exploration-1：仅消费当前有效的已核对内容，生成阅读/核实或可选本地练习，不自动升级审核，不生成报名或资格承诺。MVP-04 包内 action_generation_enabled=false 保留其原阶段“未实现行动生成”含义，原包没有改写；本轮行为由当前独立规则和授权约束。没有发布 release，内部结果绑定实际分析 ID、catalog_id、模式和 profile_revision，release_id=null。

## 二 任务到实现和验收

| 任务 | 实现与验证 | 限制/映射 |
| --- | --- | --- |
| T05.1 | 英文 My skills & next steps；目标角色、独立阶段、两技能自述/想练习、可选课程和经历；比较页按钮只带入一侧角色/阶段 | R08/A07；不自动带入已会技能，不解析自由文本 |
| T05.2 | 永久会话 profile 与临时控件分开；切页恢复；输入/模式/地区/分析包/资源状态变化标 dirty，隐藏旧结果直到重生成 | 改回原值或恢复原目录也不自行恢复旧行动；目标阶段与概览/比较选择互不覆盖 |
| T05.3 | 分别显示用户自述、样本 M/D/率与待探索技能；未填为 unknown，STUDIED 仍不表示掌握 | R08/R09/A07；D=0 为 N/A，不给综合分、录用概率或必需技能判断 |
| T05.4 | 当前规则稳定排序、按 resource_id 合并去重，最多 3；每条包含原因、首步、预期产出、来源、条件和状态 | 来源为实际 AGENT 核对内容；课程只读/核实，练习独立标 PROJECT DESIGNED |
| T05.5 | 空白新生、已有实践且想练习、无样本、D=0、无资源、未知资格、已知不符/关闭/待审/到期等有检查 | 无样本仅 GENERAL_EXPLORATION；无资源给 0 条及解释，不补三个 |
| T05.6 | Clear this profile and results 重置表单/结果、删除关联行动/对照/待导出，递增控件 epoch 并丢弃旧回调；新浏览器会话为空 | 个人文本只在内存；截图遮挡 textarea；无公共日志/文件保存；R11 下载留 MVP-06 |

## 三 确定性规则与实际结果

明确想练习时，以这些技能作为优先探索集合，允许有实践仍想练习；没有选择时，从样本 M>0 且用户未自述 PRACTICED 的技能开始。这仅描述探索偏好，不把未填或未自述实践写成不会。课程与经历文本最多各 4000 字符，只保存上下文，不用于排序、技能推断或行动原因。

技能按原始提及数降序、skill_id 排序；同技能资源按探索等级、独立本地练习优先于未知资格课程、固定 resource_id 排序。等级不是选课资格：未填/学过默认先 BEGINNER，再 INTERMEDIATE/ADVANCED；自述实践且想练习优先 INTERMEDIATE，仍保留条件。相同资源可合并多个目标技能，只输出一次，最多三个。已知 INELIGIBLE、CLOSED、CANCELLED、EXPIRED 或未核实/到期映射不列行动。

| 独立验证情景 | 预期与实际 |
| --- | --- |
| 空白自述、默认 DA / Toronto | F6/D4；Python、SQL 各 2/4；依次 PROJECT-PYTHON、CSCA08H3、PROJECT-SQL，共 3 条 |
| SQL 有实践且想练习 | 自述 PRACTICED 与 wants_practice 同时保留；依次 PROJECT-SQL、CSCC43H3，共 2 条 |
| 目标 Data Engineer 无样本 | F0/D0、率 N/A；标 GENERAL_EXPLORATION，不计算市场差距；仍可浏览适用的核对资源 |
| 没有载入分析包或 D=0 | 样本不可用而非假 0%；仅通用探索。无快照和零正文分别有测试 |
| 关闭本地 SQL 练习 | 在隔离测试资源包改变状态并重算绑定；旧行动隐藏，重生成只余 CSCC43 的条件核实，1 条 |
| 资源集合为空/全到期/无匹配 | 0 条及明确缺口说明，不生成假来源或凑数 |
| 自述两技能都已实践、未想练习 | 不强制补探索行动；提示可选择自己仍想练习的技能 |
| 课程/经历包含技能词 | 自述和行动集合不由文本改变；只使旧结果需显式更新 |

官方课程的 eligibility_status=UNKNOWN，首步为读说明并核实先修/课表；预期产出是待确认清单，不是完成课程、获得学分或已掌握技能。本地练习只提供可选实践，资格为 NOT_ASSESSED，不冒充学校课程。没有活动报名行动、自动投递或模型调用。

## 四 会话、失效与隐私

画像只在当前 st.session_state，地区与公共筛选同步并保存在 profile.market_area；个人目标阶段单独保存。签名覆盖完整当前画像（只在内存求哈希）、模式/地区、分析 ID、资源包 ID、当前资源和映射状态；dirty 后旧对照及行动隐藏。每次渲染/Refresh resource status 按当前时刻加载并校验资源，不自动联网。

清空会重置目标和自述、课程/经历、结果及待导出关联项；共享公共地区不删除。旧 pf_ 控件被删除，epoch 增加，旧版本延迟回调即使到达也被丢弃和清理，不能回填。重新进入页面才从永久会话 profile 恢复控件，不在每次打字重置。独立新浏览器会话不恢复旧画像；完整服务器重启/公共审核验收仍留后续。

应用不写个人数据库、文件、公共缓存或日志，不把自由文本复制到行动。测试只用独立合成自述；浏览器每张自动截图都 mask textarea，无整页 HTML 转储。[最终浏览器结果](<E:/AI Analyzer2.0/artifacts/mvp-05/browser-runs/contract-verified/browser-check.json>)中 personal_text_artifact_leaks=[]，表示两条特定浏览器测试哨兵未出现在该测试的日志、JSON/CSV/说明等文本产物。此检查不等于对操作系统内存或浏览器全部内部行为做安全认证。

## 五 实际检查与证据

| 检查 | 实际结果 |
| --- | --- |
| 全部程序回归 | **175 passed in 3.80s**，保留原 151 项及新增 24 项画像、排序、资源排除、未知状态、去重、签名、跨页恢复与清空回调测试；[JUnit](<E:/AI Analyzer2.0/artifacts/mvp-05/pytest-contract.xml>) |
| 真实浏览器 | **10 项检查通过**；Chromium 156.0.8078.4，1440×1000 与独立 390×844；[结果与截图清单](<E:/AI Analyzer2.0/artifacts/mvp-05/browser-runs/contract-verified/browser-check.json>) |
| 实际操作 | 比较带入、空白生成、独立合成课程/经历输入、切页保留、练习偏好改变、无样本、资源关闭/空集合/恢复、模式切换、清空、新会话与窄屏操作 |
| 资源故障隔离 | 只修改 artifacts 内复制的资源包，重算内容及映射绑定；原始资源包不改，测试结束复制包恢复；不伪装成真实学校状态改变 |
| 外网与错误 | 最终 external_page_requests=[]、page_errors=[]；测试对非本机 HTTP(S) 请求设阻断，未声称全机网络抓包或完整 A01 断网验收 |
| 隐私与布局 | 自由文本在全部自动截图遮挡；两条浏览器哨兵扫描无泄漏；窄屏无整页横向溢出；已查看桌面行动与窄屏代表截图 |
| 环境与内容 | 无新增依赖；[runtime.json](<E:/AI Analyzer2.0/artifacts/mvp-05/runtime.json>) 保存实际版本、规则、代码哈希与固定包 ID |

7 张截图包括[空白新生行动](<E:/AI Analyzer2.0/artifacts/mvp-05/browser-runs/contract-verified/blank-actions-desktop.png>)、[已有经历并想练习](<E:/AI Analyzer2.0/artifacts/mvp-05/browser-runs/contract-verified/experienced-actions.png>)、[无样本](<E:/AI Analyzer2.0/artifacts/mvp-05/browser-runs/contract-verified/no-sample-general.png>)、[无资源](<E:/AI Analyzer2.0/artifacts/mvp-05/browser-runs/contract-verified/no-resources.png>)、[清空](<E:/AI Analyzer2.0/artifacts/mvp-05/browser-runs/contract-verified/cleared-profile.png>)及[窄屏行动](<E:/AI Analyzer2.0/artifacts/mvp-05/browser-runs/contract-verified/actions-narrow.png>)。

中间浏览器诊断完整保留：发现清空后的旧回调和跨页控件空值，分别加入 epoch 隔离/旧键清理及重新进入时恢复；内存诊断只记录版本/布尔状态，没有输出文本值，最终应用不保留诊断打印。最终以 contract-verified 为准。Windows 关闭自有服务时日志可能出现连接重置的 asyncio 传输警告，页面脚本错误仍为零，自有服务已退出。

## 六 使用与保留

```powershell
Set-Location 'E:\AI Analyzer2.0'
& '.\.venv\Scripts\python.exe' -X utf8 run_local.py
& '.\.venv\Scripts\python.exe' -m pytest -q
& '.\.venv\Scripts\python.exe' -X utf8 scripts\browser_profile_check.py --base-url http://127.0.0.1:8511 --run-name another-new-run
```

启动后可直接打开 My skills & next steps，无分析包时提供通用探索；先 Import / Build 后可查看目标样本对照。填写或保持自述空白，点击 Generate next steps；改变选择后需重新生成；Clear this profile and results 清空个人状态。Refresh resource status 重新读取已保存资源的当前有效状态，不联网刷新内容。旧市场比较和资源目录保留，画像目标不会反向覆盖比较角色。

新增 next_steps.py、profile_session.py、profile_ui.py、画像测试和浏览器脚本；app 接入新页和比较带入，run_local 仅同步阶段名。README、三份当前规划、契约补记和验收表更新，原始数据/资源/词典/算法和所有旧阶段记录保持不变。[保留基线](<E:/AI Analyzer2.0/artifacts/mvp-05/preservation-before.json>)、[结束核对](<E:/AI Analyzer2.0/artifacts/mvp-05/preservation-after.json>)与[最终一致性检查](<E:/AI Analyzer2.0/artifacts/mvp-05/final-check.json>)记录来源与任务状态。

## 七 限制与退出

招聘仍只有 SYNTHETIC 样例，真人分类/资源批准未开展，官方课程当期开设和用户资格均未知；6 个入口、1 条映射继续待审。仅 sql/python 两个技能，不能当完整职业能力画像或完整培养路径。用户课程/经历只作上下文，不推断能力，不提供总分、概率或模型结论。

A07 的内部情景已验证；A06 未知资格仍只给核实阅读，完整 A01–A10 不整体通过。没有审核库、正式发布、R11 下载、完整重启演示或学生试用，不把行动输出当作这些验收的替代。未 fork、实时采集、招聘/模型 API、Instagram、财务升级、公开部署或仓库发布；原附件与旧财务项目只读。

未来另获授权时，可使用当前会话对象、规则版本、结果来源绑定和失效/清空测试作为 MVP-06 输入；仍须解决正式审核/发布和导出边界。本次测试服务已关闭，**只完成 MVP-05，不自动进入 MVP-06**。
