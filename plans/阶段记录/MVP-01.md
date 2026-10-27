# MVP-01 本地启动骨架与固定数据只读导入

日期：2026年10月21日（Asia/Shanghai）。执行者：Codex。状态：**独立 SYNTHETIC 路线的 T01.1–T01.6 已完成本阶段验证；MVP-02 未开始。** A01、A02 仅启动与导入子项有证据，不能记为 A01–A10 整体通过。

## 一 授权、前置与实际输入

本次只完成本机入口、独立环境、固定文件导入、模式与日期、来源哈希和明确错误状态。先读当前三份规划、MVP-00 三份交付与来源基线，确认工作区开始时只有 21 个文件，没有应用、环境或既有 MVP-01 产物。保留 MVP-00 契约规则、阶段记录、原始附件、来源评估和历史计划。

只使用本项目独立编写的 SYNTHETIC 原始输入，未取得、下载或导入朋友的真实招聘批次、代码或词典。没有 fork、招聘/模型 API、Instagram、财务升级、公开部署或仓库发布。外部访问仅用于官方文档、依赖包和浏览器组件安装；应用导入不访问外网。

## 二 交付与任务对应

| 任务 | 实际完成 | 边界 |
| --- | --- | --- |
| T01.1 | 新建 `.venv`，固定完整依赖；独立样例与实际框架兼容已验证 | 未复制旧环境；上游代码未取得及未引入，其语法/依赖兼容尚未验证，留待获准接入 |
| T01.2 | `run_local.py`、英文最小页面、Windows bat；配置与命令行只绑定 127.0.0.1，禁用遥测 | 无 key 可启动；未创建市场、比较、画像或推荐页面 |
| T01.3 | 固定 JSONL 与 manifest 读取；校验 SHA-256、字节数、版本引用、必要字段与模式；在内存附来源行号 | raw 及附件不回写，输入重复和缺失保留；不做去重、清洗或分类 |
| T01.4 | SYNTHETIC/HISTORICAL 显式选择；切换清除旧导入及派生状态；历史缺失给空状态 | 未创建假历史目录或历史 manifest，实际历史导入未验证 |
| T01.5 | 缺文件、坏 JSON、缺字段、模式/ID 不符、哈希或计数错误、路径越界均有定位信息 | 同模式失败保留上次有效内存导入，不能称为已实现发布回退 |
| T01.6 | 启动/安装说明、19 项导入测试、15 项实际浏览器检查、桌面与窄屏截图；入口单独真实启动核对 | 测试服务结束已停止，不继续 MVP-02 |

主要文件：`app.py`、`run_local.py`、`utsc_nav/importer.py`、`.streamlit/config.toml`、`启动 UTSC 职业导航.bat`、三份 requirements 文件、`scripts/build_synthetic_fixture.py`、`scripts/browser_check.py`、`tests/test_importer.py`、`pytest.ini` 和 `.gitignore`。没有创建 Git 仓库或未来业务模块。

## 三 独立运行环境与启动

本机新环境解释器为 CPython 3.10.11，基于 `C:\Users\LEGION\AppData\Local\Programs\Python\Python310\python.exe`。默认 `python` 实际指向 LibreOffice 内置 3.13，不用于应用环境。采用 `uv venv` 新建 `.venv`，未复制旧财务项目 `.venv`；`include-system-site-packages=false`。环境创建和执行通过本机工具授权完成，没有修改系统权限或旧项目。

| 依赖 | 实际版本 | 用途 |
| --- | --- | --- |
| Streamlit | 1.65.0 | 本地输入页面 |
| Pandas | 2.3.3 | 只读原始行预览 |
| Plotly | 6.9.0 | 按规划安装，本阶段未绘图 |
| pytest | 9.1.1 | 导入边界验证 |
| Playwright | 1.64.0 | 实际 Chromium 浏览器检查 |
| Chromium Headless Shell | 156.0.8078.4 | 独立测试浏览器，无用户登录资料 |

`requirements-lock.txt` 固定全部 49 项运行与验证依赖。uv 缓存和浏览器放在本项目 `.cache/`，没有复制旧缓存。组件下载曾发生连接重置，工具切换官方镜像后成功；未关闭 TLS 校验。其他 Python/浏览器版本、其他电脑和上游环境未测试。

当前启动：

```powershell
Set-Location 'E:\AI Analyzer2.0'
& '.\.venv\Scripts\python.exe' -X utf8 run_local.py
```

或双击 bat，再手动打开 [本机地址](http://127.0.0.1:8510)。点击 Import snapshot 才导入，启动不自动读入隐藏样例。端口占用时报告并退出，不停止其他服务；正常运行按 Ctrl+C 关闭。安装/重建条件见 [README](<E:/AI Analyzer2.0/README.md>)；当前环境已建立，不需要重新安装。

另行真实启动 `run_local.py --port 8512`，在浏览器完成原始数据导入；`Get-NetTCPConnection` 观察到监听为 **127.0.0.1:8512**。该会话已用 Ctrl+C 停止。bat 已核对 UTF-8 无 BOM、CRLF；未冒充已人工双击 Windows GUI 验收。

## 四 人工输入、日期与契约适配

| 文件 | 实际用途 |
| --- | --- |
| `data/synthetic/raw/jobs-v1.jsonl` | 12 行独立人工原始观察；包含同一 SYN:01 的较早观察及重复命中，保留缺正文和 99/100 字符边界 |
| `data/synthetic/snapshots/syn-mvp01-v1/manifest.json` | 模式、批次、fixture 日期、构建时刻、原始文件/配置 SHA-256、字节数和使用说明 |
| `data/synthetic/config/declared-policy.json` | MVP-00 默认规则及单城市测试映射，仅声明未执行，不是上游真实配置 |
| `data/synthetic/config/skills.json` | 独立 sql/python 测试词典，仅输入，不运行匹配 |
| `data/synthetic/expected-mvp02.json` | 人工写定的未来独立预期；不用于当前程序生成统计 |

模式为 **SYNTHETIC**，输入快照 ID 为 **syn-mvp01-v1**，批次为 **syn-input-v1**。没有分析快照或 `release_id`；页面明确 Not published。真实岗位数量、正式岗位数量、可分析正文分母、提及率、分类一致率及真实资源核对数均未计算/未开展，不补零。

fixture 的岗位发布日期为 2026-09-30，观察时钟为 2026-10-01 11:00–12:00 UTC；manifest 构建时刻是实际制作 UTC 时刻，不能把 fixture 当真实采集。组织全部为 Fictional organization，URL 使用 example.invalid。样例使用说明只适用于本项目独立内容，不代替朋友代码/数据的许可。

`utsc-job-input-1` 是本阶段冻结的原始输入适配格式：包含 contract_version、data_mode、namespace/ID、batch_id、岗位原始内容及日期字段。目标 job 中的 `raw_ref` 与 `source_occurrences` 在导入内存附加（路径、SHA-256、1 起始行号），避免把文件自身 SHA 写入文件造成自引用。`description_clean=null` 表示未清洗，`fixture_expected_role/stage` 只是人工预期，不能作为已执行分类。必要键缺失和类型错误拒绝导入；已有键的 null 原值保留，内容纳入/排除规则留到 MVP-02。

manifest 的 input_rows=12 与实际解析行数核对；candidate_jobs、formal_jobs、analyzable_descriptions、pending_jobs、excluded_jobs 均为 null。不显示未来预期中的 C=10、D=8 或技能百分比作为本阶段结果。此适配只细化读入边界，不改变 utsc-contract-1.0 的统计、日期或审核规则。

## 五 实际验证与证据

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 导入单元测试 | **19 passed**，包含哈希、字节数、缺字段/坏 JSON、重复键、模式和 ID、使用状态、输入行数、路径越界、历史缺失和合法空文件 | `tests/test_importer.py`；实际命令见下；执行输出记录 0.52 秒 |
| 真实浏览器 | **15 项检查通过**，初始空状态、正常导入、来源预览、8 种错误、历史模式清除及不回落、合法空输入和窄屏 | [最终 browser-check.json](<E:/AI Analyzer2.0/artifacts/mvp-01/browser-runs/release-check/browser-check.json>) |
| 桌面视觉检查 | 1440×1000，模式、12 输入行、未运行分析及日期可见 | [桌面截图](<E:/AI Analyzer2.0/artifacts/mvp-01/browser-runs/release-check/desktop-import.png>) |
| 窄屏视觉检查 | 独立 390×844 会话，原生 Enter 折叠侧栏后等待动画结束，正文可读、无页面水平溢出 | [窄屏截图](<E:/AI Analyzer2.0/artifacts/mvp-01/browser-runs/release-check/narrow-import.png>)；[真实启动入口窄屏](<E:/AI Analyzer2.0/artifacts/mvp-01/launcher-narrow.png>) |
| 页面网络与错误 | 测试路由阻断外部页面请求，实际外部页面请求列表为空，page_errors 为空 | 最终 browser-check.json；这不是完整产品断网验收 |
| 读取不写源 | 随包样例与隔离测试输入前后所有文件哈希不变 | 最终 browser-check.json 的 source_files_unchanged / isolated_inputs_unchanged |
| 原始附件/旧项目 | 三附件及旧项目 49 文件哈希、旧 HEAD 与 Git 状态均不变，MVP-00 记录不变 | [开始基线](<E:/AI Analyzer2.0/artifacts/mvp-01/preservation-before.json>)；`artifacts/mvp-01/preservation-after.json` |

实际命令：

```powershell
& '.\.venv\Scripts\python.exe' -m pytest -q --basetemp 'E:\AI Analyzer2.0\artifacts\mvp-01\pytest-tmp'
& '.\.venv\Scripts\python.exe' -X utf8 scripts\browser_check.py --base-url http://127.0.0.1:8511 --run-name release-check
```

浏览器脚本用独占空闲测试端口，自行创建 artifacts 下独立输入并启动/停止服务；移除三个常见招聘/模型 key 环境变量，代码本身不读取或调用这些服务。测试失败不伪装通过：中间运行的定位器、模式切换同步和窗口缩放检查记录保留在 artifacts；以 **release-check** 为本阶段最终证据。原生标签、键盘操作及等待真实侧栏状态替代了不稳定定位，没有向页面注入业务状态。

## 六 当前验收状态与依赖

| 项目 | 状态 |
| --- | --- |
| A01 | 本机启动、无 key 和最小输入页面已验证；筛选、比较、画像、资源和导出的完整断网流程尚未实现 |
| A02 | 独立样例、日期/哈希、模式切换与历史缺失子项已验证；真实批次及全页/导出验收未执行 |
| A03–A10 | 不标整体通过；只读错误恢复及窄屏截图不代替去重统计、人工复核、完整资源、画像、审核发布或交付验收 |
| DEP-01–03 | 真实代码/数据复用、真实批次、上游字段/词典/城市表继续未取得；上游兼容未测试 |
| DEP-04–05 | 逐条资源核对与真人分类基准未开展；无学生试用 |
| DEP-06 | 独立样例环境已解决；真实上游兼容部分仍待获准接入 |

下一阶段如另获授权，输入为本阶段实际导入器、人工 raw/manifest/词典、独立未来预期和 MVP-00 契约，才实施 T02 清洗、去重、分类与统计。当前不实施这些任务，也不为缺真实数据自动下载、调用 API 或生成真实数据结论。

## 七 收尾检查

| 收尾项 | 实际结果 |
| --- | --- |
| 原文件保留 | 开始时的 21 文件中仅六份当前规划/入口文档同步状态；原附件、来源评估、来源基线、历史计划及 MVP-00 记录不变。旧项目基线覆盖的 49 文件、HEAD 和 Git 状态均不变；不扩大为旧缓存和虚拟环境全量哈希校验 |
| 文档一致性 | 当前非历史文档检查 70 个本地链接，缺失、表格列数及代码围栏错误为 0；12 个 R、48 个 T 和八段 prompt 保留；仅 T00、T01 共 12 项勾选，T02–T07 的 36 项未勾选 |
| 环境与测试证据 | `artifacts/mvp-01/environment-and-tests.json` 保存实际解释器、包版本及本轮已执行的 19 passed 结果；完整锁定 49 项。最终浏览器为 release-check 的 15 项 PASS，不删除或掩盖中间失败记录 |
| 启动器格式 | bat 为 UTF-8 无 BOM、CRLF，原旧项目启动器未修改 |
| 服务停止 | 本地 socket 检查 8510、8511、8512 均无监听；自有测试服务及真实入口测试会话已关闭 |
| 授权边界 | 只创建本阶段代码、样例、依赖与证据；无真实招聘批次、无外部业务 API、无 fork/采集/发布；MVP-02 未开始 |

收尾检查保存于 `artifacts/mvp-01/final-check.json` 与 `preservation-after.json`。当前阶段结束，测试服务已停止，不自动继续 MVP-02。
