# 网站与数据侧协作边界

网站仓库：[glh5835/UTSC](https://github.com/glh5835/UTSC)。
数据仓库：[Canadian Early-Career Data Analytics Job Market](https://github.com/wangzhuxirou-svg/Canadian-Early-Career-Data-Analytics-Job-Market)。

用户负责网站、登录、存储、权限和部署；Seraphina 负责 Python 数据采集、
清洗、分类、规则、合同与导出。本次初始化只写网站仓库，不向数据仓库
提交或推送，也不把对方的 pipeline、真实 JSONL、原始响应或聊天附件
复制进网站仓库。

共同接口以[数据侧 v1 合同](https://github.com/wangzhuxirou-svg/Canadian-Early-Career-Data-Analytics-Job-Market/blob/b828553f91cf6cd6ae5b0766e7fbf4c6b1822535/contracts/README.md)为参考。
核对时 main 为 `b828553f91cf6cd6ae5b0766e7fbf4c6b1822535`。
后续实施前需重新核对版本；合同修改仍需双方协调，不能在网站端另造
不兼容的正式 Schema。

新合同覆盖八方向、小写枚举、版本化包、来源与原始时间、描述可分析
标记、资源及已批准机会。Schema 存在不代表数据管线已导出正式包。
合同 fixtures 仍是人工样例，不能展示为真实市场或活动。

根目录旧 Demo 采用独立的五方向模拟契约。`data/synthetic/` 是本项目
的人工输入；`data/resources/` 是带来源和核对日期的旧资源摘要。
它们没有接入新的真实招聘记录，也不能直接当作 S0 v1 的正式包。

下一阶段应在 `web/` 增加明确的数据加载／适配层，从共同 fixtures
开发，再消费数据负责人交付并验证的公开包。公开包不得包含学生记录、
凭据、Instagram 会话或未经授权的原始招聘响应。
