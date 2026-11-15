# DDL Board（ddl-desktop）

一个独立、离线、便携的 DDL 月历桌面应用。使用 **Rust + Tauri 2 + 原生 HTML/CSS/JavaScript**，不依赖 Super Productivity，也不需要安装插件或启动其他服务。

## 当前功能

- 月历视图，周一开始，固定显示六周
- 上个月、下个月、回到今月，今天高亮
- 在任意日期格中新建 DDL
- 编辑标题、截止日期与可选时间
- 全天 DDL、按时排序、过期未完成标红
- 完成 / 取消完成，已完成任务置灰并显示删除线
- 删除前二次确认
- 待办与已完成任务分别配色
- 浅色、深色、跟随系统三种主题
- 所有修改直接保存到本地 JSON 文件
- 关于面板手动检查更新，启动时自动检查更新
- 自动下载 GitHub Release 便携包并校验 SHA-256，重启后完成替换

这是首个聚焦核心流程的版本，暂不支持周视图、拖拽改期、重复任务、云同步或 Super Productivity 数据导入。

## 下载与使用

从 [Releases](https://github.com/zhanghu-god/ddl-desktop/releases) 下载：

`ddl-desktop_0.2.0_x64-portable.zip`

1. 将 ZIP 完整解压到一个有写入权限的目录。
2. 双击 `ddl-desktop.exe`。
3. 需要移动或备份应用时，关闭程序后复制整个文件夹即可。

无需安装，也不需要管理员权限。Windows 10/11 需要系统提供 **Microsoft Edge WebView2 Runtime**；较新的 Windows 通常已内置，应用不会自行安装运行时或修改系统配置。

### 便携目录

```text
DDL Board\
├─ ddl-desktop.exe       # 主程序
├─ README.md             # 使用与构建说明
└─ data\
   ├─ tasks.json         # 全部 DDL，可读 JSON
   ├─ config.json        # 主题与配色
   ├─ cache\webview2\    # 首次运行后生成的界面缓存
   └─ update\            # 自动更新下载暂存，更新完成后可自动清理
```

- 数据、配置和 WebView2 缓存始终以 exe 所在目录为基准，**不会回退到 `%APPDATA%` 或其他系统应用目录**。
- 不要在运行程序时替换 JSON 文件。
- 备份任务只需复制 `data\tasks.json`；迁移整个应用则复制整个文件夹。
- `data\cache` 可在程序关闭后删除，任务与配置不受影响。
- 删除整个文件夹即可移除应用及其数据；如有需要，请先备份。

## 自动更新

- 启动时会自动检查 GitHub 最新 Release；也可以在“关于”面板点击“检查更新”。
- 发现新版本后，自动下载便携 ZIP，校验大小和 SHA-256，并解压暂存到 `data\update`。
- 更新就绪后弹出提示，选择“现在重启”会退出当前程序，由后台脚本替换 exe 和 README，然后重新启动。
- 选择“稍后”会保留已下载更新，下次启动时继续提示。
- 更新只替换程序文件，不覆盖 `data\tasks.json`、`data\config.json` 等用户数据。
- 更新检查需要访问 GitHub API；网络失败时不影响本地任务管理。

## 数据格式

`tasks.json` 是任务数组。每条记录包含：

- `id`：UUID
- `title`：标题，最长 200 字符
- `dueDate`：本地日期 `YYYY-MM-DD`
- `dueTime`：本地时间 `HH:MM`，`null` 表示全天
- `isDone`：是否完成
- `createdAt` / `updatedAt`：UTC 时间戳

Rust 后端会校验标题、日期、时间、主题和配色；文件损坏时会报告错误，不会自动清空原数据。

## 本地开发

环境要求：

- Windows + Rust MSVC 工具链（`stable-x86_64-pc-windows-msvc`）
- Visual Studio Build Tools 的 C++ 工作负载
- Node.js（仅用于运行 Tauri CLI）
- Microsoft Edge WebView2 Runtime

前端没有 npm 依赖，也不需要执行 `npm install`。

```powershell
# 在项目根目录执行；仅对当前 PowerShell 会话选择 MSVC 工具链
$env:RUSTUP_TOOLCHAIN = "stable-x86_64-pc-windows-msvc"

# 开发运行
npx --yes @tauri-apps/cli dev

# 运行 Rust 单元测试
cargo test --manifest-path src-tauri/Cargo.toml

# 检查前端元素引用、JavaScript 语法与 Tauri 命令注册
node --check src/main.js
node scripts/check-frontend.mjs

# 只编译 release exe，不生成安装包
cargo build --release --manifest-path src-tauri/Cargo.toml
```

开发模式的 exe 和数据位于 `src-tauri\target\debug\`；release 模式的 exe 和数据位于 `src-tauri\target\release\`。两种模式不会共用任务或配置。

## 打包便携 ZIP

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-portable.ps1
```

脚本会自动：

1. 使用 MSVC 工具链编译 release。
2. 创建全新的临时打包目录，避免混入开发数据。
3. 放入 exe、README 和初始 JSON 文件。
4. 生成 `release\ddl-desktop_<版本>_x64-portable.zip` 及 SHA-256 校验值。

`src-tauri\tauri.conf.json` 中已关闭安装包生成（`bundle.active = false`）。

## 项目结构

```text
src\                       # 月历界面与交互，无框架、零前端构建
src-tauri\src\models.rs    # 任务、配置的数据模型
src-tauri\src\storage.rs   # 校验、CRUD、JSON 持久化与便携路径
src-tauri\src\commands.rs  # 前端可调用的 Tauri 命令
src-tauri\src\lib.rs       # 应用入口与命令注册
scripts\package-portable.ps1  # 便携打包
scripts\check-frontend.mjs    # 前端静态检查
assets\                    # 图标源文件
```

## 版本与发布

当前版本：`0.2.0`。版本号同时维护在 `src-tauri\Cargo.toml` 和 `src-tauri\tauri.conf.json`。发布时创建同名 Git tag，并将便携 ZIP 上传到 GitHub Release。
