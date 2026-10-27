# UTSC Demo 启动与开发说明

当前可运行的是根目录 Streamlit 中英文模拟 Demo，已在 Windows 与
Python 3.12.14 验证。React、Supabase、真实登录和生产部署尚未实现。

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

在 `web/` 执行 A0：React＋TypeScript＋Vite、只读共同合同 fixtures、
导航和空／错／加载状态，沿用中英文切换。Supabase Auth、数据库迁移与
RLS 属于后续 A1，必须用两账号和未登录状态验证，不能拿本机维护替代。
