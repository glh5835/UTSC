# UTSC 公开演示预览部署

已发布：[公开演示](https://utsc-public-demo.rockycandy4096.chatgpt.site/)，Sites 版本 2。
2026-10-29 匿名 HTTP 验收 15/15、安全头实际生效，浏览器市场 F=22 / D=18、
中英文、课程／账户不可用状态、深链接刷新和损坏包拒收已验证。
TypeScript、141 项单元测试（另 3 项数据库相关跳过）、11 项产物／投递安全测试
通过。详见 [验收记录](verification/preview-20261029.json)。
这只是无数据库连接的演示发布，不代表真实账户生产验收。

## 审核结论与本次范围

基线为 main 合并提交 `aa04d5ae373d945abf07ae10c7790bbcdcac74b7`（PR #3，A0–A3）。
React 19 + TypeScript + Vite 7 输出纯静态文件；现有 HashRouter 使用 `#/market`
等路由，无需服务器端 SPA 回退。Supabase SDK 是浏览器客户端，不需要 Node
应用服务器。旧 Streamlit、Python 环境和数据库文件均不属于网站发布产物。

当前使用 **Sites 托管 + 只读文件投递 Worker**：账号已连接，可直接发布独立
演示地址。首次公网验证发现 Sites 静态模式未应用 `_headers`，因此改用受支持的
Worker ESM 交付形态，由极小适配层实际设置 HTTP 安全头。React 仍是静态网站，
没有新增业务后端、数据库绑定或写接口。构建根是 `web/`，Vite 产物在
`web/static-dist/`；经白名单校验后嵌入 `web/dist/server/index.js`。Sites 仅打包
`web/dist/`（Worker 与 hosting manifest），不携带独立静态资源。其他能执行
`_headers` 的静态主机可直接发布 `web/static-dist/`。
Sites 发布源是独立镜像；GitHub PR 合并不会自动更新站点。

本次先发布**不连接 Supabase 的公开演示**。市场概览、方向比较、样例校验、
课程浏览和中英文切换可用。账户、个人资料、经历和技能保存明确不可用，
无模拟登录、不导出个人数据。账户功能的实现仍保留，但接入目标数据库另行验收。
页面常驻 SYNTHETIC 与账户服务状态说明，课程卡保留合成样例／非当前开课说明。
不代表正式市场数据发布、人工课程核验、A4–A8 完成或完整生产验收。

## 可复现构建

Node >=22.12；本次使用 Node 24。在 `web/`：

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
npm run test:deployment
```

`build` 默认调用 `build:demo`，使用 Vite demo 模式并检查公开文件，再生成 Sites Worker。**两个 Supabase 环境变量必须
均为空**；包括 `.env.local` 和托管构建环境继承的值，存在时失败，避免误连已有库。
不要为让构建通过而把服务端密钥换个变量名放进前端。

浏览器变量只允许 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY`。
关闭 Vite 自动前缀注入，仅显式注入两项白名单值。其他 `VITE_` 变量使构建失败。
公钥允许 `sb_publishable_...` 或 payload 角色为 anon 的旧 JWT，拒绝 secret、
service_role 和任意其他 token；JWT 解码只校验类型，不代替 Supabase 签名认证。
托管构建必须是无凭据、无查询参数的 HTTPS origin，禁止 HTTP/loopback。
本机开发服务仍可使用 HTTP loopback。

检查输出只接受明确列出的公开合同和演示文件、打包的 JS/CSS、首页、robots
与安全头文件；拒绝未知文件、source map、符号链接以及可检测的服务端密钥。
这些检查不能代替凭据管理，但可拦截常见误打包。Sites 只上传生成的 `dist/`，其他静态主机只上传 `static-dist/`，
不要将仓库根、`.env*`、QA 产物、SQL、测试脚本或数据库作为静态目录。

## 安全响应与浏览器限制

构建生成 `_headers`，包含 CSP、DENY 嵌入、nosniff、no-referrer、禁用摄像头／
麦克风／定位、noindex 与 no-store。部署后必须核对实际响应，不能因文件存在
就声称托管已应用。HTML 同时包含 CSP、referrer 与 robots meta 作为浏览器保障；
frame-ancestors 必须由 HTTP 响应头执行。Sites Worker 从同一份 `_headers` 配置
设置所有响应（包括 404/405），只接受 GET/HEAD、精确匹配已批准公开路径；
未知路径不回退首页，不读取请求身份、cookie 或本机文件。noindex 只是索引提示，
不是访问控制。

CSP 限制脚本为本源、禁止内联脚本、禁止 frames/object/form 提交，连接限本源
及显式配置的 Supabase HTTPS origin。现有 Ajv 按冻结合同运行时编译 schema，
因此暂需 `script-src 'unsafe-eval'`；统计条形图的 React 内联样式需
`style-src 'unsafe-inline'`。移除这些例外需要单独改造，不能在预览中静默
关闭 schema 校验。未加入分析追踪、外部脚本、运行时模型或管理密钥。

## 连接账户服务的最后步骤

需要网站所有者指定**目标 Supabase 项目**并通过安全渠道配置访问。优先独立预览库，
不用现有真实用户库做公共演示。公开 URL 与 publishable key 可以在构建环境配置；
数据库密码、CLI access token、service_role/secret 只能用于受控管理／验收进程，
不能放进 VITE_、源代码、浏览器、聊天公开回复或网站归档。

1. 核对项目 ref、备份／恢复方案、当前 schema 与迁移历史。根目录 `npm ci`
   安装锁定的 Supabase CLI。由持有授权的操作者执行交互登录与关联：

   ```sh
   npx supabase login
   npx supabase link --project-ref <确认的项目ref>
   npx supabase migration list --linked
   npx supabase db push --linked --dry-run
   ```

2. 现有已完成 A1 的库应只剩
   `supabase/migrations/20261028000000_a3_skill_sources.sql` 待应用；
   新的空预览库按顺序应用 A1 和 A3。若历史缺失、漂移或 dry-run 计划超出预期，
   停止核对，不能盲目 `migration repair`、`--include-all` 或重复执行建表脚本。
   A3 会按既有设计清理被编辑／撤回来源的技能确认；应先评估现存数据及备份。

3. 确认 dry-run 计划后，增量执行 `npx supabase db push --linked`，再读迁移历史。
   **不得 reset、drop/recreate、自动导入 seed 或覆盖既有数据。** 本次未执行任何迁移。

4. Supabase Auth 配置邮箱确认、邮件发送／频率限制，Site URL 和 redirect allowlist
   使用将发布的准确 HTTPS 站点 origin，避免任意域名通配；不要把本地
   `supabase/config.toml` 当成托管项目 Auth 设置已生效的证据。

5. 在受控环境验收 RLS：六张个人表 anon 无权限，A/B 各自读写、越权读写拒绝、
   user_id 转移拒绝、路径与技能来源所有权约束有效。现有
   `npm run test:rls-acceptance` 会创建／删除专用测试账号及其行，
   仅在授权的预览库运行；管理密钥不进入浏览器。保存真实结果，不复用旧 49/49。

6. 在 `web/.env.local` 或托管构建环境填两项**公开值**，执行
   `npm run typecheck`、`npm test`、`npm run build:connected`，重新发布。
   连接构建强制要求两项公开值；默认 `build` 始终是断开账户服务的演示构建。
   Vite 在构建时嵌入值；Sites runtime env 更新不能改变已有静态 JS，必须重建。

7. 通过公开 HTTPS 地址验收真实邮件确认、登录／退出、刷新、A/B 账户隔离、
   课程自述／来源清理、浏览器无服务端密钥、请求不泄露私有数据、390px 与键盘。
   任一权限验收失败，保持公开演示断开账户服务。

## 发布与回退

`web/.openai/hosting.json` 保存此演示站点 ID；最终采用 Worker 模式（无 `static`
字段）。HashRouter 不需要所有路径回退首页。默认构建生成仅含
`dist/server/index.js` 与 `dist/.openai/hosting.json` 的受支持 Worker ESM 包。
Sites 源镜像只包含 `web/` 的代码／公开资源和必要构建文件，不包括本地 env、
node_modules、dist、static-dist、artifacts 或 GitHub 旧 Demo 状态。先构建和校验，再同步源并
保存匹配构建产物的版本，最后发布该版本。公开访问权限需明确设置为 public。

记录基线 SHA、变更 PR、源镜像提交、Sites 版本、实际 URL、访问与响应头结果。
回退选择已保存的上一个站点版本再部署；前端回退不撤销数据库迁移，
已存在数据库只做经审查的后续增量修复。暂停演示时可恢复站点私有权限。

## 官方依据

- [Vite 环境变量](https://vite.dev/guide/env-and-mode)：前端变量在构建时公开。
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)：
  浏览器使用 publishable，私有数据访问由 RLS 限制。
- [Supabase 迁移](https://supabase.com/docs/guides/deployment/database-migrations)
  与 [CLI 工作流](https://supabase.com/docs/guides/local-development/cli-workflows)：
  先核对迁移历史和 dry-run，再增量 push。
