# D7 跨仓库兼容性审核（2026-11-03，北京时间）

## 审核结论与固定基线

**D7 PR #8：请求修改，暂不批准合并。合同 1.1.0 正式升级与正式市场数据发布未通过验收。**

**UTSC PR #5：网站侧准备与防御性修复通过下述技术验收，可单独合并。**
这不代表 D7 数据已上线，也不代表生产 Auth/RLS 或全部活动来源已经验收。

| 对象 | 本次实际核对的提交／状态 |
| --- | --- |
| [数据 PR #8](https://github.com/wangzhuxirou-svg/Canadian-Early-Career-Data-Analytics-Job-Market/pull/8) | `aa13bbbab82bc0b58b3f1cf205953cf38407a2e1`，审核前 open、未合并，作者 wangzhuxirou-svg，请求 glh5835 审核 |
| 数据 main／网站正式合同依据 | `b828553f91cf6cd6ae5b0766e7fbf4c6b1822535` |
| UTSC main（本次变更前） | `aa04d5ae373d945abf07ae10c7790bbcdcac74b7` |
| [网站 PR #5](https://github.com/glh5835/UTSC/pull/5) 原始 head | `027b16c5274d812451883e1f1b73b0eddddd084c`；实际已不是草稿，不能继续沿用历史草稿状态 |
| 网站回滚分支 | `backup/main-before-d7-review-20261103` 指向上述原 main |

本次未改动数据仓库的代码、原始数据、采集状态或人工审核账本。离线复现
通过临时目录重定向输出，并阻止网络连接；未调用 JSearch 或 Instagram。
用户要求的数据管线修改前云端 Codex 备份条件没有被触发。不能把本次临时
checkout 宣称为已经完成该项持久备份。

## 1.0.0 与 1.1.0 的实质差异

| 合同部分 | 正式 1.0.0 → D7 1.1.0 | 网站影响 |
| --- | --- | --- |
| `manifest.schema.json` | `schema_version.const` 从 `1.0.0` 改为 `1.1.0` | 原正式校验器会拒收 D7；不能只改数据版本号或放宽校验 |
| `bundle.schema.json` | 根对象新增必填 `organizers`；保持 `additionalProperties:false` | Schema 引用闭包由 8 个变为 9 个文件 |
| `opportunity.schema.json` | 新必填 `responsibilities`、`time_commitment`、`compensation_status`、`ccr_status` | 前两项允许 null，后两项必须使用合同枚举，不能从缺失值推断薪酬或 CCR |
| `resource.schema.json` | 新增可选、可为 null 的 `mapping_evidence` | 旧资源省略该字段仍合法；D7 有技能映射的维护记录应保留官方证据 |
| `organizer.schema.json` | 原上游已存在，1.1 bundle 开始引用 | PR #5 增加组织类型、唯一性与引用检查；正式网站原闭包没有分发它 |
| `common`／`market-job`／`course`／`skill` | 本次核对按字节一致 | 八角色、岗位字段、课程字段和规范技能 ID 未被重命名 |
| `market-statistics`、映射规则与 draft/review schema | 统计参考与采集审核接口扩展 | 统计参考文件还需要语义一致性校验；私有采集／人工审核文件不进入网站 public |

两版复用了相同的 `/contracts/v1/…` `$id`。PR #5 使用独立 Ajv registry，
本次固定上游副本测试确认两版只能通过各自的 registry；禁止混装覆盖。
候选副本仅放在 `web/tests/fixtures/d7-1.1/`，含来源提交与逐文件 SHA-256。
构建产物没有这些候选测试文件。正式 `web/public/contracts/` 没有被替换。

共同正式 1.0 fixture 仅改 manifest 版本会因缺少新必填字段被拒收，这是
正确的拒收行为，不是要求删除字段或放宽 Schema 的理由。D7 的
`--upgrade-legacy-manifest` 只适合内部旧 D4 中已经具备新增形状的包；
`f8d2950` 的内部 D4 已携带 `organizers:[]`，虽然 manifest 仍写 1.0.0。
它与共同正式 1.0 fixture 不能混为一谈。对外移交须明确来源提交、完整
Schema 闭包与适配范围，不能宣称是任意正式 1.0 包的通用迁移器。

## 必须修复的问题

### P1：校验没有要求完整的 SHA-256 覆盖与配套文件集合

位置：数据侧 `src/export_bundle.py:232–253`、`357–395`。

`_verify_checksums()` 只要求清单包含 `bundle.json`；`validate_package()`
只在配套文件存在时比较内容。实际复现：从一个由 D7 自身写出的有效包中，
保留 SHA 清单的 bundle 一行，删去其他覆盖条目，将 provenance 中的
`auto_candidate` 改为 `human_approved`，不重新计算任何摘要，
`validate_package(require_provenance=True)` 仍通过。随后删除 manifest、
各数据配套文件和参考统计，只剩 bundle、provenance 与 SHA 清单，仍通过。

影响：缺失文件或未被校验覆盖的审核来源信息可被当作合格移交包，违反
文档中 provenance 受校验和保护、可按配套文件加载的保证。SHA-256 本身
不认证人工审核身份；这里的问题是连约定的完整覆盖也没有强制执行。

最小修复：区分旧 D4 输入与 D7 成品的文件集合。D7 成品应要求全部约定
文件存在且每个文件都有唯一 SHA 条目，特别是 `dataset_provenance.json`、
`reference_statistics.json` 与数据配套文件；缺失、未覆盖、重复或不安全
路径均拒收。为删除校验条目、删除配套文件、篡改未覆盖来源增加反例。
旧 D4 的 bundle-only 校验策略不要直接复用于 D7 成品发布。

### P2：参考统计即使与 bundle 矛盾也能通过完整包校验

位置：数据侧 `src/export_bundle.py:368–379`、`532–556`。

实际复现：有效 synthetic fixture 的真实岗位数为 1，将
`reference_statistics.json.job_count` 改为 999999，再使用 D7 自身的
`_write_checksums()` 生成正确摘要。`validate_package(require_provenance=True)`
仍通过。该函数没有读取并对照参考统计内容。

影响：前端自行计算的 F/D/N 与配套统计消费者可能给出矛盾结果；摘要正确
只能证明文件未发生后续字节变化，不能证明统计含义正确。

最小修复：校验 `market-statistics.schema.json`，重新调用
`calculate_market_statistics(bundle['market_jobs'])`，对照 job_count、
analyzable_description_count、去重后的技能集合、mention_count 和原始
mention_rate；增加“摘要正确但统计错误”的负例。

### P2：完整测试在当前日期下有一项时钟依赖失败

位置：数据侧 `tests/test_opportunity_events.py:164–173`；
`src/opportunities/review.py:113–140,318–321`。

原样全量运行：**289 passed，1 failed**，不同于 PR 描述的历史 286 项。
失败用例先按固定的 2026-10-28 重处理，再通过没有 now 参数的
`export_review()` 使用实际当前时间，已经截止的活动被正确排除，得到
0 行而不是预期 1 行。仅在外部诊断 harness 中给 assess 的默认时间固定到
同一个测试时间，该单项通过；没有改生产逻辑或系统时钟。

最小修复：给队列导出／加载入口注入 now 并沿调用链传递，测试用同一
固定时间；另外独立测试截止之后队列为空。不能让生产逻辑忽略真实到期。

## 网站端已修复与验证的能力

本次为 PR #5 增加 18 项固定 D7 候选合同／边界测试，并修复
`web/src/data/validation.ts`：

- UTC 时间改为比较实际整秒与任意精度的小数部分，避免 `...00Z` 与
  `...00.001Z` 文本排序颠倒；保留亚毫秒精度。
- 补充活动开始／结束日及精确 UTC 时间的顺序检查。
- 拒收同一 source_post_id 分配给多个机会。
- 拒收岗位 posted_at 与 UTC posted_date 自相矛盾的记录，包括 source ID
  为 null 的合法形状。
- 对候选 1.1 的组织引用、技能引用、sample_count、私有字段，以及
  两版 registry 隔离做实际 fetch → schema → cross-record 路径测试。

新增反例在修复前出现 6 项失败，修复后通过。正式默认配置仍为 demo、
schema 1.0.0、SYNTHETIC 数据，正式合同副本与数据库迁移未改变。

| 检查 | 实际结果／范围 |
| --- | --- |
| 原 PR #5 基线 | TypeScript、204 项单测、build 通过；3 项 RLS wrapper 跳过 |
| 修复后的 PR #5 | TypeScript、222 项单测、build、`git diff --check` 通过；3 项 RLS wrapper 跳过 |
| 离线真实岗位消费 | 额外 2 项隔离检查通过：候选 registry 下网站加载器完整接收；全部 F/D/N 与提及率逐项等于 Python 参考输出 |
| 实际浏览器 | 构建产物的首页／市场页、中英切换、SYNTHETIC 标记、损坏包整体拒收、键盘切换到空包后的恢复已观察通过 |
| 未执行 | 生产部署、真实 Auth/RLS、多账户数据库验收；本次未重新验收手机布局 |
| 已知构建提示 | 现有大 chunk 提示仍存在，无构建失败 |

两个提交的 GitHub check-runs 查询均为 0，不能把本次本地结果描述为
GitHub CI 已绿。网站 PR #5 的合并是代码与候选联调准备的验收，不是
正式 1.1 数据发布验收。合并执行记录与最终提交号见 PR 时间线。

## 实际数据、来源和活动有效期

读取上游 7 个归档文件中的 1308 行，在隔离目录重建出：

| 数据 | 本次核实 |
| --- | --- |
| 岗位 | 419，网站与 Python F=419、D=316 一致 |
| 技能目录 | 26，跨数据技能引用闭合 |
| 课程 | 15，其中 6 门有技能映射，映射项均有非空 evidence_text |
| 学习资源 | 33，其中 29 项有技能映射，映射项均有非空 mapping_evidence |
| 机会／组织 | 本次重建为 0／0；上游 Git 不含私有 D6 快照／审核材料，不能据此核实 PR 所称的 5／4 |
| 岗位采集窗口 | `2026-09-11T07:14:18.441000Z` 至 `2026-10-26T04:40:48.374000Z` |
| 岗位发布日期 | 2026-08-12 至 2026-10-24；不是今天仍开放岗位的数量 |
| 课程／资源核实时间 | 均保留来源记录中的 2026-10-28 时间，没有伪装成本次重新核实 |
| 状态 | `run_status=partial`；本次 publication 检查实际拒绝，原因是市场数据不完整 |

抽样读取 CSCA08H3 和 CSCA48H3 官方课程页，课程主题与记录方向一致；
CSCA08 官方正文明确提到 Python，CSCA48 正文列出数据结构等内容。
Bridge Excel 资源页在本次检索中返回 403，不能据此声称资源失效，也没有
完成全部 48 条记录的官方来源／开设与资格复核。

- https://utsc.calendar.utoronto.ca/course/csca08h3
- https://utsc.calendar.utoronto.ca/course/csca48h3
- https://www.utsc.utoronto.ca/thebridge/bridge-excel-learning-series

D7 已统一 D6／D7 的到期函数。现有通过用例覆盖精确截止瞬间、仅日期的
Toronto 日末边界和跨日活动，发布时也会重新检查有效期。但这不证明缺失
移交包中的 5 条活动在当前日期仍有效。必须取得原始的已脱敏完整移交包，
验证其全部摘要、来源版本／审核方式、组织核实和实际日期；不能捏造 5 条
活动来凑齐 PR 中的数量。

`review_status=approved` 在 D7 中包含 auto_candidate 与 human_approved。
网站消费者必须联合 provenance 表示真实审核来源，不能把前者都显示为
“人工复核”。仅加载 bundle 的现有 PR #5 尚未形成该完整发布链。

## 最小后续路径与回滚

1. 数据侧修复完整文件／摘要覆盖和参考统计语义校验，补充负例，并消除
   测试时钟依赖。本次只提交审查意见，不修改 Seraphina 管线。
2. 提供固定 dataset_version、bundle 摘要与完整配套文件的脱敏 D7 移交包。
   网站接入时保留真实时间和审核来源，复验活动有效期及浏览器消费流程。
3. 角色分类、课程技能证据与活动日期尚需真实复核；不得把 partial 改成
   complete 或把 attestation 全置 true 来通过门槛。用户授权发布不替代
   这些事实证据。全部验收满足后再批准正式 1.1、合并 D7 并发布市场数据。
4. 网站 PR #5 保留 merge commit，保留原 main 回滚分支，不删除原分支。
   如需回退，针对 PR 的实际合并提交创建 `git revert -m 1 <merge-sha>`
   并走新 PR，避免重写共享历史。此次没有部署或数据库变更需要回滚。

复验网站：`cd web && npm ci --ignore-scripts && npm run typecheck && npm run test && npm run build`。
数据原样测试：在隔离环境安装其 requirements 后运行 `python -m pytest tests -q`。
原始岗位响应、候选真实包、私有记录和临时 QA 文件没有加入本网站仓库。
