# Cloudflare 正式交付与 Supabase 验收

`npm run build:production` 生成完整账号应用。Cloudflare Workers Builds 使用受保护分支的提交与已批准数据包生成 `web/production-dist/`。原 Sites 演示和本机测试沿用各自的发布方式。发布命令中的目标、域名、项目和摘要都须与实际批准记录对应。

## GitHub 与 Cloudflare

1. 网站所有者在 `glh5835/UTSC` 为 `release/staging` 和 `release/production` 配置要求 PR、独立批准和必需检查的 Ruleset 或分支保护。Cloudflare Workers & Pages GitHub App 只需访问网站仓库。关闭 Preview Builds，避免未审查分支获得真实发布包及环境变量。记录 App 授权范围与保护规则。[GitHub 接入](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/) · [构建分支](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)
2. 所有者用已授权的 Cloudflare 账户连接两个独立 Worker，预生产和正式各用自己的分支和域名。Root directory 取仓库根。实际 `workers.dev` 或自有域名由所有者确认，Auth 回跳应使用相应站点的完整 HTTPS 地址。[Workers Builds 设置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)

| | 预生产 | 正式 |
| --- | --- | --- |
| Worker 名称 | `utsc-career-navigator-staging` | `utsc-career-navigator` |
| 构建分支 | `release/staging` | `release/production` |
| Build command | `python scripts/build_cloudflare_release.py staging` | `python scripts/build_cloudflare_release.py production` |
| Deploy command | `node scripts/deploy-cloudflare-release.mjs staging` | `node scripts/deploy-cloudflare-release.mjs production` |
| Wrangler 配置 | `web/wrangler.staging.jsonc` | `web/wrangler.production.jsonc` |

3. 分别设置 Build variables。`SKIP_DEPENDENCY_INSTALL=1` 由适配器按网站锁文件安装依赖，`NODE_VERSION=24.22.1` 和 `PYTHON_VERSION=3.14.8` 固定构建运行时。各 Worker 设置自己的 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY`。构建核对受保护发布 pin 中的两个项目端点 `supabaseOrigins` 彼此不同且匹配各自目标。生产账号测试密钥、SMTP、原始招聘数据与社媒会话由各自的受控环境保管。[Workers 构建环境](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
4. `web/deployment/production-release.json` 绑定数据版本、bundle 与清单摘要、合同提交、批准记录及两个 Supabase origin。Workers Builds 另要求 `archiveSha256` 覆盖整个 ZIP。只有实际签认明确覆盖 ZIP 的每一项内容（包括证据和签认副本）且授权对外公开时，才能在数据仓库使用 GitHub Release 附件。此方式在 pin 中填 `githubReleaseAssetId` 为该数字 ID，构建从固定仓库读取，无需额外服务或账号密钥。将私密审查材料保存在原受控位置，供有权人核对；公开证据和签认副本必须避免披露其内容及个人标识。若 ZIP 不能公开，采用已授权的受限 HTTPS 存储，将文件放在 `/approved/<datasetVersion>/<inventorySha256>.zip` 并配置 Build variable `UTSC_RELEASE_ARTIFACT_ORIGIN`（HTTPS origin）和加密 Build secret `UTSC_RELEASE_ARTIFACT_TOKEN`（只读 Bearer token）。云构建拒绝超限、路径型 ZIP 成员、非预期重定向及摘要不符的包。两种方式的站点产物都经过网站白名单验证。本机回放可提供 `--local-zip <已批准下载包>`。[GitHub Release 附件读取](https://docs.github.com/en/rest/releases/assets#get-a-release-asset)
5. 预生产和正式使用同一批准数据版本。各自记录源代码 SHA、数据合同 SHA、数据版本、bundle SHA-256、清单 SHA-256、审批记录、Cloudflare Build ID 和 Worker version ID。核对 `/deployment.json`、公开包和界面显示对应记录。Cloudflare 应用静态目录 `_headers` 中的安全与缓存策略。[静态资源头部](https://developers.cloudflare.com/workers/static-assets/headers/)

## Supabase 账号、迁移与备份

1. 所有者确认预生产和正式的两个独立项目 ref、角色和操作范围。分别启用邮箱密码注册及邮箱确认，关闭匿名 Auth 注册。URL Configuration 中将 Site URL 与 Redirect URLs 设置为该站点的精确根地址 `https://<实际站点>/`。邮箱回跳的 token hash 放进片段，由网页验证。正式环境只允许已批准的精确地址。[Supabase Auth URL 配置](https://supabase.com/docs/guides/auth/redirect-urls)
2. 启用已授权的 SMTP 配置和发信地址，核对发信域名验证、配额和实际送达。关闭邮件服务商改写验证链接的点击跟踪。专用邮箱实测后记录消息 ID、模板版本、时间及结果，遮盖邮件地址和 token。[Supabase 自定义 SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

确认邮件中的链接使用以下格式。

```html
<a href="{{ .RedirectTo }}#auth=email&amp;token_hash={{ .TokenHash }}">Confirm email / 验证邮箱</a>
```

找回密码邮件中的链接使用以下格式。

```html
<a href="{{ .RedirectTo }}#auth=recovery&amp;token_hash={{ .TokenHash }}">Reset password / 重设密码</a>
```

3. 确认各项目的备份恢复方式与保留期，记录可用备份和迁移前基线。使用已获授权的自动备份或受控逻辑备份。包含 Auth 和学生账号的备份留在相应受限存储。先在预生产审阅增量 SQL 并演练恢复。执行 `supabase link --project-ref <已确认项目>`，用 `supabase migration list --linked` 和 `supabase db push --linked --dry-run` 核对目标与增量，授权后用 `supabase db push --linked` 迁移并检查历史。[Supabase 迁移流程](https://supabase.com/docs/guides/local-development/cli-workflows) · [数据库备份](https://supabase.com/docs/guides/platform/backups)
4. 账号自助删除 RPC `delete_own_account` 取当前验证身份，并要求仍有效且在五分钟内创建的密码登录会话。Auth 账号行、六张个人表、会话与刷新凭据在删除时级联处理。备份按项目约定的保留政策管理。实时删除验收覆盖 Auth 和应用六表。[Supabase 用户数据管理](https://supabase.com/docs/guides/auth/managing-user-data)

## 云端账号及权限验收

在受控终端配置经授权的同项目 `UTSC_CLOUD_QA_PUBLISHABLE_KEY`、`UTSC_CLOUD_QA_SECRET_KEY` 和支持加号别名的专用邮箱 `UTSC_CLOUD_QA_MAILBOX`。配置三个不同的测试密码 `UTSC_CLOUD_QA_PASSWORD_A`、`UTSC_CLOUD_QA_PASSWORD_B`、`UTSC_CLOUD_QA_RECOVERED_PASSWORD_A`。使用干净的独立浏览器配置文件。确认专用别名、SMTP 测试邮件和帐号清理在当前授权范围内。每次运行使用新的报告路径。将样例命令中的参数换成已核实值。

```text
node web/tests/cloud-acceptance.mjs --target staging --project-ref <staging-ref> --other-project-ref <production-ref> --site https://<staging-host>/ --code-commit <40位网站提交> --inventory-sha <64位批准摘要> --out artifacts/cloud-staging/acceptance.json
```

正式验收使用 `--target production`、正式网址和同项目密钥，`--other-project-ref` 指明预生产项目。程序先查线上 `/deployment.json`，再创建两条独立测试别名。操作人按终端步骤在实际站点完成真实邮箱验证、刷新会话、退出、找回密码和删除；程序复核旧密码拒绝、邮箱确认状态、两账号六张个人表读写隔离、匿名禁用、本人删除、另一账号数据完整及清理结果。报告只含目标、数据摘要、时间、检查和测试运行号。操作人、确认时间和浏览器证据由本次受控验收记录关联。若进程被强制中止，在 Auth 管理面板按专用邮箱、运行号和项目精确查找该次 A/B 别名，确认后清理相应 QA 账号。

本机 `npm run test:rls-acceptance` 和 `scripts/verify-favorites.mjs` 的目标固定为 `http://127.0.0.1:55421`。本机和云端分别记录实际结果。

## 发布、回退与维护

1. 先在预生产确认一次人工数据更新。审批、包摘要、`/deployment.json`、界面版本与 Python/网站的复算结果应一致。再用错误摘要或不完整候选验证构建失败，确认线上继续提供最近一次批准版本。在同一 Worker 部署两个已批准版本后演练回退，核对数据版本、活动、手机布局、中英切换和账号记录。保留 Build、Version ID、实际 HTTP 响应与验收记录。
2. 汇总真实数据签认、预生产验收、真人验收和学生体验记录。获准上线后经过受保护的 PR 更新 `release/production`。记录实际网址、Build 和 Worker version ID，核对匿名 HTTP、数据白名单、市场筛选和比较、课程资源与活动、ICS、手机布局及语言。正式项目再运行独立账号验收，核实该环境的邮件和会话流程。如有已授权的访问控制，可用正式域名受控验收，通过后再开放学生访问。
3. 使用当前 Worker 的上一个已批准版本回退。Dashboard 进入 Deployments 选择 Rollback，或使用 `wrangler rollback <previous-version-id> --config web/wrangler.production.jsonc`。重新核查正式域名和数据摘要，然后通过 PR 将发布分支恢复到该批准版本，避免重试覆盖回退。首次发布失败且无上一个获准版本时，按所有者预定方式撤下正式入口。用户数据库事故通过独立的备份审查与恢复流程处理。[Cloudflare Worker 回退](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
4. 通过人工更新与失败回退演练后，数据侧再启用已获准时间和预算内的定时采集。采集结果进入候选流程，由有权人审核。网站通过保护分支更新数据 pin。每个生效版本对应一个可核对的人工批准记录和包摘要。
