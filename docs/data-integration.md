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

下一阶段应增加市场／比较等消费页面（A2 起），从已同步的共同 fixtures
继续开发，再切换到数据负责人交付并验证的公开包。网站端的运行时校验层
（`web/src/data/validation.ts`）按合同 README 要求实现了 schema 之外的
交叉引用、唯一性、时间顺序、sample_count 与公开数据边界检查；损坏包
整体拒收。公开包不得包含学生记录、凭据、Instagram 会话或未经授权的
原始招聘响应。A1 的 Supabase 接入方案记录在 `web/README.md`：仅方案，
无代码、迁移或 RLS 实现。
