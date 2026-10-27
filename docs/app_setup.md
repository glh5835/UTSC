# UTSC Demo 启动与开发说明

当前仓库有两个可运行部分：根目录 Streamlit 中英文模拟 Demo（已在
Windows 与 Python 3.12.14 验证），以及 `web/` 下的 React＋TypeScript＋Vite
网站骨架（A0，已在 Windows 与 Node v24.19 验证）。Supabase、真实登录和
生产部署尚未实现。

## 新 checkout

准备自己的 Python 3.12。以下以 Windows PowerShell 和系统已配置的
Python Launcher 为例：

```powershell
git clone https://github.com/glh5835/UTSC.git
Set-Location UTSC
py -3.12 -m venv .venv
& .\.venv\Scripts\python.exe -m pip install --only-binary=:all: -r requirements-lock.txt
& .\.venv\Scripts\python.exe -X utf8 scripts/prepare_demo.py
& .\.venv\Scripts\python.exe -X utf8 run_local.py
```

也可在环境准备好后双击根目录 `启动 UTSC 职业导航.bat`。恢复原电脑时，
启动器优先复用 `.venv-recovery`；其他 checkout 使用 `.venv`。不随仓库
打包 Python、虚拟环境或离线安装包。首次安装需要包源网络，不需要招聘
或模型 API key。

打开控制台给出的本机地址，默认 `http://127.0.0.1:8510`。侧栏顶部
**English / 中文** 一键切换全站界面，`lang` 网址参数保留语言；当前会话
的筛选和个人自述不因切换语言而改变。手机可先展开侧栏。

`prepare_demo.py` 只读仓库中的固定模拟输入，显式生成被 Git 忽略的
`state/local`。若已存在有效模拟发布则直接复用；若有其他未发布状态则
停止，避免覆盖维护记录。首次准备后，默认岗位 F=10、可分析描述 D=8；
SQL 4/8，Python 3/8。课程与活动状态会随实际复核期限变化。

HISTORICAL 没有真实发布时保持空状态，不以模拟数据替代。当前真实精选
活动为 0，15 条官方课程摘要是代理在 2026-10-21 的来源检查，不保证
当期开课、名额或个人资格。

## React 网站（A0，web/）

A0 在 `web/` 建立 React＋TypeScript＋Vite 项目：基础导航、共同合同
fixtures 的只读样例展示、运行时数据校验和全局中英文切换（默认英文，
`?lang=zh` 或页面右上角切换；规范 ID、筛选与当前页不随语言改变）。
所有样例数据带 SYNTHETIC 标记。

前置条件：Node.js ≥ 22.12（Vite 7 官方要求；实际验证用 v24.19）。
首次安装需要 npm 包源网络，不需要任何 API key 或生产凭据。

```powershell
cd web
npm ci          # 按 package-lock.json 精确安装依赖
npm run dev     # 开发服务器，默认 http://localhost:5173
```

```powershell
npm run typecheck   # TypeScript 严格检查
npm run test        # vitest：校验层、标签覆盖、旧数据判断（34 项）
npm run build       # tsc --noEmit + vite build（生产构建验证）
npm run preview     # 预览 dist/ 构建产物
```

样例数据页可加载三组合同 fixtures：有效包展示全部内容；空包展示各分区
空状态；损坏包被运行时校验层整体拒收并逐条列出问题，可重试或切换其他包，
不会暗中替换为有效包。清单中的生成/采集/发布时间按包内原始值显示，不用
构建时间冒充采集时间；快照超过阈值（默认 180 天）显示旧数据提示。

账户页（A1）使用真实 Supabase Auth：邮箱密码注册、登录、退出、刷新恢复
会话，并保存/读取本人 profiles 行。需要本地 Supabase 栈（仓库根
`npx supabase start`，详见 `web/README.md`）或已配置的项目端点，通过
`web/.env`（被忽略，示例见 `web/.env.example`）的
`VITE_SUPABASE_URL` 与 `VITE_SUPABASE_PUBLISHABLE_KEY` 提供。注册后若
项目要求邮箱确认，页面明确显示"已受理、未登录"；本地确认邮件进 Mailpit
（http://127.0.0.1:55424）。未配置时账户页明确提示，公共样例页面不受
影响；页面不展示任何假用户或模拟登录。

合同文件（schemas 与 fixtures）是上游 `b828553f` 的按字节原样副本，
来源与 SHA-256 记录见 `web/public/contracts/PROVENANCE.md`。A1 的
Supabase 接入方案记录在 `web/README.md`，本轮无任何 Supabase 代码。

浏览器验收（导航、中英文切换、键盘操作、390px 手机布局、损坏包拒收与
错误恢复）已于 2026-10-27 实际执行，截图证据在被忽略的
`artifacts/qa-a0/`；该检查不代表生产部署或多账号验收。

## 端口和维护

```powershell
& .\.venv\Scripts\python.exe -X utf8 run_local.py --port 8514
& .\.venv\Scripts\python.exe -X utf8 run_local.py --maintenance
```

不要停止占用端口的未知程序，改用未占用端口。维护仅限可信本机，
不是账户认证、管理员权限或多人服务。公共审核和个人会话分开，
不要把学生自述粘贴到公共审核理由。按 Ctrl+C 停止自己启动的服务。

## 检查

```powershell
& .\.venv\Scripts\python.exe -m pytest tests -q
```

2026-10-27 语言切换版本实际通过 231 项程序测试和 15 组浏览器检查。
结果范围见验证摘要；不代表新电脑首次安装、真实账户或生产验收。
本次 GitHub 整理还用实际暂存文件生成了干净副本：显式准备得到 F10／D8，
再次准备直接复用，副本的 231 项测试及中英文页面检查通过。该检查使用
既有 Python 环境，不冒充另一台电脑首次安装。

浏览器检查使用已锁定的 Playwright。首次需要安装其 Chromium：

```powershell
& .\.venv\Scripts\python.exe -m playwright install chromium
# 先按上文启动 8510 学生模式，再运行：
& .\.venv\Scripts\python.exe -X utf8 scripts/browser_i18n_check.py --run local-check
```

需要检查维护页时，用另一个终端在未占用端口启动维护模式，指向隔离的
运行状态，再增加 `--maintenance-url http://127.0.0.1:端口`。
默认浏览器检查不会保存或发布审核修改，证据写入 `artifacts/`。

## 下一阶段

A0 已完成 `web/` 骨架、只读共同合同 fixtures、导航和空／错／加载／旧
数据状态，以及中英文切换。A1 再接入真实 Supabase Auth、数据库迁移与
RLS，必须用两账号和未登录状态验证越权读写均失败，不能拿本机维护替代。
