# UTSC web — React＋TypeScript＋Vite（A0–A3）

A0 交付基础导航、共同合同 fixtures 的只读样例展示、运行时数据校验层和
全局中英文切换；A1 接入真实 Supabase Auth、六张个人表迁移与 RLS、账户页
资料读写；A2 增加公开市场概览与方向比较；A3 接通课程与个人经历：课程
完成属于用户自述，英文经历在本地确定性抽取候选技能，只有用户明确确认后
才写入个人技能；主语、否定与计划按局部子句关联，第三人称技能不能借用
本人证据。公开市场／课程样例仍带 SYNTHETIC 标记；私有经历与已确认技能是
真实账户数据。A4–A8 未实现，也不模拟收藏、提交或发布。

## 启动

前置条件：Node.js ≥ 22.12（Vite 7 官方要求；开发时用 v24.19 验证）。
首次安装需要 npm 包源网络，无需任何 API key 或生产凭据。

```powershell
cd web
npm ci          # 按 package-lock.json 精确安装
npm run dev     # 开发服务器，默认 http://localhost:5173
```

其他命令：

```powershell
npm run typecheck   # tsc --noEmit
npm run test        # vitest run（校验层、标签、旧数据、账户隔离、A2 统计与筛选）
npm run build       # tsc --noEmit + vite build，产物在 dist/
npm run preview     # 本地预览构建产物
```

## 结构

| 路径 | 用途 |
| --- | --- |
| `public/contracts/` | 数据侧合同 v1 的原样副本（schemas + 三组 bundle fixtures），`PROVENANCE.md` 记录上游提交、路径与 SHA-256 |
| `src/data/` | 数据加载与运行时校验层（ajv + Draft 2020-12 上游 schema，加交叉引用/重复 ID/sample_count/时间顺序/公开边界检查）、fixture 来源配置、枚举显示标签、快照旧数据判断 |
| `src/i18n/` | 英文/中文字典与语言上下文；URL `?lang=` 与 localStorage 同步 |
| `src/pages/`、`src/components/` | 首页、只读样例数据页、账户页、市场／比较入口、待开发占位页、布局与状态组件 |
| `src/features/market/` | 市场筛选、canonical 八角色、F／D／N 统计、角色分布说明、比较页和 1.0 数据加载；候选 1.1 校验只在隔离测试副本 |
| `src/features/profile/` | 课程浏览／完成自述、经历增删改、账号与 generation 隔离的个人数据控制器、候选确认和已确认技能来源展示 |
| `src/lib/skillExtraction.ts` | 按 1.0.0 英文规则本地确定性抽取；输出 canonical skill、原文证据、rule_id 与四类解释 |
| `public/contracts/rules/` | 上游 `b828553f` 的抽取规则按字节同步副本；不包含私有用户样例 |
| `tests/` | 校验层、A1 账户隔离、A2 市场回归、A3 抽取／跨账号迟到响应，以及 A1+A3 真实 RLS 独立验收 |

## 数据边界

- 样例标记在 `src/data/sources.ts`（前端来源配置）中声明 `synthetic: true`，
  冻结合同文件本身未被改动。
- 任何校验问题都会让整个数据包被拒收，不会部分展示或暗中替换为其他包。
- `user-record.schema.json`、`private_user_record.json` 等私有接口文件
  有意未同步进 `public/contracts/`（见 PROVENANCE.md 的范围说明）。
- 旧 Streamlit Demo（根目录 `app.py`、`utsc_nav/`、`data/`、`tests/`）与
  本目录无关，保持不动。

## Supabase（A1/A3：本地栈已实现）

A1 实现了真实 Supabase Auth、六张个人表的数据库迁移与 RLS；A3 在同一
六表上增加经历长度限制、技能来源引用校验与原子清理触发器，没有新增合同
字段或枚举。浏览器只使用公开的 publishable/anon key；service_role 仅限
本地测试准备与清理，且只通过被 Git 忽略的环境文件提供，不进入前端构建、
仓库或测试报告。

本地栈（隔离实例 `utsc-a1-local`，见 `supabase/config.toml`，需要 Docker）：

```powershell
# 仓库根目录
npx supabase start        # 首次需拉取镜像；启动时自动重放迁移
npx supabase status -o env  # 打印本地 URL / anon / service_role 等
npx supabase db reset     # 从零重放迁移（仅作用于本地隔离实例）
npx supabase stop         # 停止
```

网页端连接本地栈：复制 `web/.env.example` 为 `web/.env`（已被 Git 忽略），
填入本地 URL 与 publishable/anon key（本地栈使用 legacy JWT anon key，
作用等同 publishable key，见 supabase.com/docs/guides/getting-started/api-keys），
然后 `npm run dev`。未配置时账户页明确显示"尚未配置"，公共样例照常可用。

本地测试邮件工具：注册确认邮件进入 Mailpit（http://127.0.0.1:55424，CLI 2.122 本地栈自带），
不发送真实外部邮件。

真实隔离验收（需要本地栈运行中）：独立验收命令运行完整 A1 权限矩阵
（两真实账号双向六表隔离、未登录、metadata 提权、路径绑定、删号级联），
并追加 A3 来源完整性矩阵（课程不自动确认、显式确认幂等、多来源独立、
非法来源拒绝、经历编辑／删除清理、未知课程保留、文本上限）。缺少凭据、
栈不可达或任何失败都非零退出，跳过不会伪装成通过：

```powershell
# 仓库根目录；key 只来自本地栈，不提交
npm run test:rls-acceptance   # 独立验收（报告写入 artifacts/）
UTSC_SUPABASE_PUBLISHABLE_KEY=... UTSC_SUPABASE_SERVICE_ROLE_KEY=... \
  npm run test:rls            # 同一矩阵的 vitest 包装（无凭据时跳过）
```

迁移：`supabase/migrations/20261027000000_a1_personal_tables.sql`——
profiles、experiences、user_skills、favorites、learning_paths、path_items，
含主键/外键/唯一/检查约束、复合外键保证 path_items 只能挂到本人路径、
`handle_new_user` 触发器自动建 profile、最小 grants（anon 零权限）与
六表 RLS 策略（SELECT/INSERT/UPDATE/DELETE 全部 owner-scoped，UPDATE
同时检查原行与新行防止转移 user_id）。合同字段映射见迁移文件内注释与
`plans/阶段记录/A1.md`。

A3 迁移：`supabase/migrations/20261028000000_a3_skill_sources.sql`。
`user_skills` 的 course 来源必须指向本人已标记完成课程，experience 来源
必须指向本人经历，manual 来源不得带 `source_id`；经历文本变化／删除和
课程撤回由数据库触发器原子清理对应来源确认，其他来源不受影响。现有本地
栈应使用 `npx supabase migration up --local` 增量迁移，不能 reset。

A3 合同同步：抽取规则 `public/contracts/rules/experience-skill-extraction.json`
与测试目录中的 extraction schema／四类样例均来自上游
`b828553f91cf6cd6ae5b0766e7fbf4c6b1822535`，只读来源、路径、SHA-256 见
`public/contracts/PROVENANCE.md`。私有用户记录 schema 与样例未进入 public。
