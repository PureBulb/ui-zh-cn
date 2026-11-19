# Antigravity 界面汉化插件 (`ui-zh-cn`)

**零侵入、不修改 `app.asar`、无需管理员权限** 的 Antigravity 2.0 实时简体中文界面汉化插件，内置 **600+ 条**官方界面词库与动态正则，全面覆盖左侧栏、系统设置（常规/应用程序/外观与主题/模型/项目管理/快捷键）、斜杠 `/` 快捷指令与内置技能说明。

## ✨ 核心功能

1. **全界面实时汉化**：自动翻译导航栏、菜单、设置项标题与说明、权限弹窗、斜杠 `/` 菜单与时间提示，同时严格跳过代码块（`pre`/`code`）、输入框（`input`/`textarea`/`contenteditable`）与对话正文（`.prose`），绝不误伤代码或聊天内容。
2. **真·热插拔还原**：在侧边栏开关一键关闭汉化（或在插件管理页禁用插件）时，通过 `WeakMap` 瞬间把所有 DOM 节点还原回原始英文，无需重启。
3. **内置自定义词库编辑器**：在侧边栏面板里随时添加/删除自己的中英对照词条，保存后毫秒级热生效，持久化存储在侧边栏独立数据目录中。

---

## ⚙️ 实现原理（零侵入原生 CDP 直连）

Antigravity 2.0 桌面端启动时会原生开放本地 Chrome DevTools Protocol 通道，并将动态端口写入用户配置目录的 `DevToolsActivePort` 文件：
- Linux：`~/.config/Antigravity/DevToolsActivePort`
- macOS：`~/Library/Application Support/Antigravity/DevToolsActivePort`
- Windows：`%APPDATA%\Antigravity\DevToolsActivePort`

插件的官方 Sidecar 后端（`sidecars/panel/main.mjs`）利用 Antigravity 内置 Node.js 24 的原生 `fetch` 和 `WebSocket`：
1. 自动读取 `DevToolsActivePort`，查询 `http://127.0.0.1:<port>/json` 定位主窗口页面；
2. 通过 `Runtime.evaluate` 注入幂等的 `MutationObserver + TreeWalker` 汉化引擎（使用 `requestAnimationFrame` 合批刷新，性能零卡顿）；
3. 每 4 秒做一次极轻量的存活检测，窗口刷新或新建窗口后自动重新挂载；
4. 收到 `SIGTERM`/`SIGINT`（禁用或卸载插件）时自动执行还原脚本，不留任何残留。

---

## 🚀 安装方法

### 方式一：一键脚本（推荐）
在仓库根目录执行：
- Linux / macOS：`./install.sh ui-zh-cn`
- Windows：`.\install.ps1 ui-zh-cn`

### 方式二：手动复制
将整个 `ui-zh-cn` 文件夹复制到：
- **Linux / macOS**：`~/.gemini/config/plugins/ui-zh-cn`
- **Windows**：`%USERPROFILE%\.gemini\config\plugins\ui-zh-cn`

安装后**重启一次 Antigravity** 即可自动完成界面汉化。打开右上角 **⋮** → **Extensions** → **界面汉化设置** 可随时开关或新增自定义词条。

---

## 📝 扩充词库
- 直接在侧边栏面板中添加（推荐，跨版本更新不丢失）；
- 或直接编辑插件目录下的 `dict.json`（`exact` 为精确匹配表，`patterns` 为正则替换表）。
