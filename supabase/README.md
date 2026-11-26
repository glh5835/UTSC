# Supabase 开发目录

此目录维护六张个人表、Auth 触发器、RLS 及账号自助删除的增量迁移。

按冻结计划管理 profiles、experiences、user_skills、favorites、
learning_paths、path_items。个人表以 user_id 隔离；管理员权限不能由
客户端自行设置。本地与云端的目标、迁移和验收方式见 [Cloudflare 正式交付与 Supabase 验收](../docs/cloud-release.md)。

不要提交 service_role、数据库口令、生产连接字符串或用户记录。
