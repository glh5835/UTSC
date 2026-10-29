# 网站与数据侧协作边界

网站仓库：[glh5835/UTSC](https://github.com/glh5835/UTSC)。
数据仓库：[Canadian Early-Career Data Analytics Job Market](https://github.com/wangzhuxirou-svg/Canadian-Early-Career-Data-Analytics-Job-Market)。

用户负责网站、登录、存储、权限和部署；Seraphina 负责 Python 数据采集、
清洗、分类、规则、合同与导出。本次初始化只写网站仓库，不向数据仓库
提交或推送，也不把对方的 pipeline、真实 JSONL、原始响应或聊天附件
复制进网站仓库。

共同接口以[数据侧 v1 合同](https://github.com/wangzhuxirou-svg/Canadian-Early-Career-Data-Analytics-Job-Market/blob/b828553f91cf6cd6ae5b0766e7fbf4c6b1822535/contracts/README.md)为参考。
核对时 main 为 `b828553f91cf6cd6ae5b0766e7fbf4c6b1822535`。
**2026-10-27（A0）已从该提交按字节原样同步**：bundle 引用闭包内的 8 个
schema 与 valid／empty／invalid 三组 bundle fixtures，复制到
`web/public/contracts/`，上游提交、文件路径与 SHA-256 见
`web/public/contracts/PROVENANCE.md`。`user-record.schema.json`、
`private_user_record.json`、Instagram 采集/审核 fixtures 与 `rules/` 有意
未同步（A0 不消费，且私有接口不得进入前端公开资源）。后续实施前仍需
重新核对版本；合同修改仍需双方协调，不能在网站端另造不兼容的正式 Schema。

新合同覆盖八方向、小写枚举、版本化包、来源与原始时间、描述可分析
标记、资源及已批准机会。Schema 存在不代表数据管线已导出正式包。
合同 fixtures 仍是人工样例，不能展示为真实市场或活动。

根目录旧 Demo 采用独立的五方向模拟契约。`data/synthetic/` 是本项目
的人工输入；`data/resources/` 是带来源和核对日期的旧资源摘要。
它们没有接入新的真实招聘记录，也不能直接当作 S0 v1 的正式包。

A2 已在 `web/` 增加市场概览和方向比较，并只读复核了数据侧未合并 PR 的
固定提交：D4 `f8d2950`、D7 `60bcba3`。隔离重建包为 419 条岗位、316 条
可分析描述，manifest 为 `run_status=partial`，不含原始描述或私有记录；
网页与 D4 三个固定统计案例的 F、D、N、比率一致。该结果只证明本地联调，
不是合同合并、人工分类验收、正式发布或实时市场。

候选 D7 把 `schema_version` 定为 1.1.0，并新增必填 `organizers` 以及
机会的 responsibilities／time_commitment／compensation_status／ccr_status、
资源的可选 mapping_evidence。现有 1.0.0 契约副本与默认数据源保持不变；
候选 schema 只在隔离副本以其独立校验器加载。正式升级需双方明确决定并
重新同步、迁移消费代码，不能删除字段、放宽 `additionalProperties` 或改
版本号冒充旧合同。网站运行时校验层继续检查跨记录引用、唯一性、时间顺序、
sample_count 与公开数据边界；公开包不得包含学生记录、凭据、Instagram
会话或未经授权的原始招聘响应。A1 的真实 Supabase Auth、迁移与 RLS 已
实装，详见 `web/README.md` 和 A1 记录。

A3 继续使用已批准的 1.0.0 合同与同一上游提交 `b828553f`，没有采用候选
1.1.0。网站按字节同步了 `contracts/rules/experience-skill-extraction.json`，
并将提取 schema 与 `valid_experience_skill_candidates.json` 仅放在测试目录；
路径与 SHA-256 见 `web/public/contracts/PROVENANCE.md`。私有
`user-record.schema.json` 和 `private_user_record.json` 仍未进入 public。
课程映射和经历抽取只产生候选，用户明确确认后才写入 `user_skills`；课程、
经历、手动三种来源及其清理关系由网站迁移维护，不改变共享合同枚举。

## D7 接入准备（2026-10-29，仅本地联调）

2026-10-29 只读复核时，上游 D7 PR #8 仍开放，head 已从 A2 记录的
`60bcba3` 变为 `aa13bbbab82bc0b58b3f1cf205953cf38407a2e1`；新增提交只记录，
不自动吸收。正式合同仍以 `b828553f` 的 1.0.0 为准，`web/public/contracts/`
未改字节。候选 1.1.0 只在被忽略的本地副本验证：独立 Ajv registry 加载
organizer 引用闭包，`run_status=partial` 的本地包可联调，但空白发布确认、
组织核实缺失和可信来源绑定仍是正式发布阻塞。

网站新增受版本控制的 `demo / integration / published` 数据模式配置。默认
构建仍是 SYNTHETIC 演示；候选构建只在忽略目录中把同一完整 bundle 提供给
市场、比较、课程和技能目录，不读取旁路 provenance 或确认文件。候选页面
标明内部联调、partial、历史样本与人工复核限制。技能统计先合并技术/软技能
数组并按 canonical ID 去重，再按目录分类展示。公开演示站仍是历史 Sites
版本，账户服务未连接；真实数据未公开发布。
