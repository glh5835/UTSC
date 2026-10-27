# UTSC web — React＋TypeScript＋Vite（A0）

冻结计划 A0 的项目骨架：基础导航、共同合同 fixtures 的只读样例展示、
运行时数据校验层和全局中英文切换。**当前所有数据都是 SYNTHETIC 人工
合同样例**，不是真实市场或活动数据；A1（账户/数据库）、A2（市场页面）
尚未实现，页面上已明确标注，不模拟任何登录、收藏或发布。

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
npm run test        # vitest run（校验层/标签覆盖/旧数据判断）
npm run build       # tsc --noEmit + vite build，产物在 dist/
npm run preview     # 本地预览构建产物
```

## 结构

| 路径 | 用途 |
| --- | --- |
| `public/contracts/` | 数据侧合同 v1 的原样副本（schemas + 三组 bundle fixtures），`PROVENANCE.md` 记录上游提交、路径与 SHA-256 |
| `src/data/` | 数据加载与运行时校验层（ajv + Draft 2020-12 上游 schema，加交叉引用/重复 ID/sample_count/时间顺序/公开边界检查）、fixture 来源配置、枚举显示标签、快照旧数据判断 |
| `src/i18n/` | 英文/中文字典与语言上下文；URL `?lang=` 与 localStorage 同步 |
| `src/pages/`、`src/components/` | 首页、只读样例数据页、待开发占位页、布局与状态组件 |
| `tests/` | 针对实际行为的检查：直接读取 `public/contracts/` 下发货文件做校验层测试；标签覆盖对照上游 schema 枚举 |

## 数据边界

- 样例标记在 `src/data/sources.ts`（前端来源配置）中声明 `synthetic: true`，
  冻结合同文件本身未被改动。
- 任何校验问题都会让整个数据包被拒收，不会部分展示或暗中替换为其他包。
- `user-record.schema.json`、`private_user_record.json` 等私有接口文件
  有意未同步进 `public/contracts/`（见 PROVENANCE.md 的范围说明）。
- 旧 Streamlit Demo（根目录 `app.py`、`utsc_nav/`、`data/`、`tests/`）与
  本目录无关，保持不动。

## Supabase（本轮未接入）

A0 只记录接入方案：A1 将使用 Supabase Auth + Postgres RLS（profiles、
experiences、user_skills、favorites、learning_paths、path_items；个人表
按 user_id 授权，公开资源只读；service_role 不进前端）。迁移文件将放在
仓库根 `supabase/migrations/`。本轮无任何 Supabase 代码、连接或凭据。
