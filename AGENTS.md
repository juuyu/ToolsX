# AGENTS.md · Tools-X 开发规范（面向 AI）

本文件是给后续 AI 开发使用的操作手册。开始改动前先读完本文件；改完代码后按第 10 节同步更新本文件与 README.md。

## 0. 项目定位与硬性约束

Tools-X 是 Chrome Extension（Manifest V3），纯浏览器运行，**没有后端、没有构建步骤、无 npm 依赖**。

不可破坏的约束：

1. 不得引入后端服务、打包工具、框架（React/Vue 等）或运行时依赖；所有代码是直接可加载的原生 HTML/CSS/JS。
2. `app.html` 运行在 MV3 `sandbox` 中，**拿不到 `chrome.*` API**。任何需要扩展能力（存储、剪贴板、下载、跨域请求）的操作必须走 `postMessage` 交给宿主页 `app-window.html`。
3. 工具页面只允许在**新标签页**打开（`popup.js` → `chrome.tabs.create` / `tabs.update`），禁止 `chrome.windows.create`。
4. 禁止原生 `<select>`，必须用 `.csel*` 自定义下拉。
5. 禁止远程字体/外链 CSS（会阻塞渲染），只用系统字体栈。
6. 保持一致 UI：新增弹窗、按钮、下拉、空状态一律复用 `core/` 中的既有组件与 class。

## 1. 运行架构（三层 + 后台）

```
popup.html / popup.js          插件浮窗，列出工具，打开 app-window.html#/<tool>
        ↓ chrome.tabs
app-window.html / app-window.js  宿主页：读写 chrome.storage.local、剪贴板、下载、fetch 代理
        ↓ <iframe sandbox>
app.html + core/+tools/      工具主界面（无 chrome API，仅 postMessage）

background.js                  MV3 service worker：Todo 提醒调度（chrome.alarms + chrome.notifications）
widget/todo-widget.js          content script：所有 http/https 网页的悬浮 Todo 面板，直接读写 chrome.storage.local
```

`preview/` 是独立的 content script，注入到用户用浏览器打开的本地 `file://` 页面（`all_frames:false`），与上面三层无耦合。`widget/` 同样独立，只与 `chrome.storage.local` 中的 `toolsx.todo.*` 数据耦合。

### postMessage 协议（只允许使用这些 type）

| 方向 | type | 说明 |
| --- | --- | --- |
| iframe → 宿主 | `TOOLSX_READY` | 脚本就绪，请求全量数据 |
| 宿主 → iframe | `TOOLSX_INIT` | 下发 `keys`（所有 `toolsx.*` key 的完整对象） |
| iframe → 宿主 | `TOOLSX_PATCH` | `patch`：按 key 覆盖写入 |
| iframe → 宿主 | `TOOLSX_REMOVE` | `keys`：删除 |
| iframe → 宿主 | `TOOLSX_COPY` | `text` |
| iframe → 宿主 | `TOOLSX_DOWNLOAD` | `filename` / `text` / `mime` |
| iframe → 宿主 | `TOOLSX_HTTP` / `TOOLSX_HTTP_ABORT` | Postman 请求与取消 |
| 宿主 → iframe | `TOOLSX_HTTP_RES` | 请求结果 |
| 宿主 → iframe | `TOOLSX_VIEW` | 复用标签页时切换工具 |
| 宿主 → iframe | `TOOLSX_STORE_SYNC` | `keys`：外部（悬浮面板 / 后台）写入的存储变更，由 `core.js` 的 `onStoreSync` 分发 |

新增能力必须同时改 `app-window.js`（处理并入 `switch` 链）与 `core/core.js` 的封装函数；不要在其他文件直接裸发 postMessage。

## 2. 目录与文件职责

```
manifest.json        MV3 配置；改动 content_scripts / sandbox / host_permissions / background 时注意顺序
app.html             主界面骨架 + 视图容器（#view-todo / #view-docs / #view-json / #view-api / #view-prompt）+ 弹窗、toast 节点
core/theme.css       仅设计变量（:root 浅色 / :root[data-theme="dark"]），无视觉规则 → 可全局注入
core/core.css        通用组件：reset、body、滚动条、topbar/search、btn/icon-btn、page-head/toolbar/chip、
                     field、seg、csel*（自定义下拉）、modal/overlay/toast、docs-tools/mini、tree*、hide
core/markdown.css    Markdown 渲染（.md 与 .tx-md 合并选择器）、代码高亮 .ck-*、.toc-item
core/md-core.js      esc/unesc/hiCode/mdRender/mdOutline/tocHtml
core/core.js         EMBEDDED 判定、STORE key 表、get/patch/removeKeys、onStoreSync（外部存储变更）、
                     旧数据迁移、prefs/主题、uid/toast/copy/openModal/closeModal、节点工具、ICO_* 图标、formatBytes/byteLen
core/ui.js           cselToggle/cselClose/cselValue/cselSelect、promptText/submitPromptText、downloadText
core/json-view.js    jsonHi/jTree/jToggle（JSON 工具、Docs JSON 文档、Postman 响应共用）
core/app.js          视图路由、全局搜索、flushAll、boot()（最后加载）
tools/todo/todo.{css,js}      Todo：智能列表、任务行、任务详情、步骤、日期/提醒、悬浮按钮开关；todoInit()/renderTodo()/flushTodo()
tools/docs/docs.{css,js}      Docs：目录树、编辑器、块级编辑、TOC；docsInit()
tools/json/json.{css,js}      JSON 工具；renderJson()/setJdMode()/jdCompare()（JSON 结构 + 纯文本逐行双模式）
tools/postman/postman.{css,js} Postman；apiInit()/renderApi()
tools/prompt/prompt.{css,js}  Prompt：分类侧栏、卡片列表、{{参数}} 模板与使用弹窗、收藏/常用、使用统计、右上角手柄拖动排序、导入导出勾选弹窗；promptInit()/renderPrompt()
widget/todo-widget.js        所有网页的 Todo 悬浮面板（content script，Shadow DOM；直接读写 chrome.storage.local）
background.js                MV3 service worker：Todo 提醒排期（chrome.alarms）、系统通知（chrome.notifications）、打开 Todo 页
preview/shell.css    预览页视觉（必须限定在 html[data-toolsx-preview] / body.tx-body）
preview/shell.js     window.TXShell：主题、readSource、stats、toast、copyText、setMode、pageBar
preview/md-page.js   本地 .md 渲染页（content script）
preview/json-page.js 本地 .json/.jsonc 渲染页（content script，含 JSONC 解析与折叠）
preview/json-page.css JSON 预览专属样式
tests/               示例文件（test.md / test.json / test.jsonc），被 .gitignore 排除
```

## 3. 加载顺序（顺序错会导致 ReferenceError）

`app.html` 中 CSS：

```html
core/theme.css → core/core.css → core/markdown.css
→ tools/todo/todo.css → tools/docs/docs.css → tools/json/json.css → tools/postman/postman.css → tools/prompt/prompt.css
```

样式表顺序即优先级；工具样式必须在 core 之后，才能覆盖通用规则。

`app.html` 中 JS（传统脚本，共享全局作用域，非 ESM）：

```html
core/md-core.js → core/core.js → core/ui.js → core/json-view.js
→ tools/todo/todo.js → tools/docs/docs.js → tools/json/json.js → tools/postman/postman.js → tools/prompt/prompt.js
→ core/app.js
```

- 所有 `const/let/function` 都挂在同一全局作用域：**禁止在不同文件中重复声明同名符号**（新增文件前先 grep 目标符号名）。
- 任何文件都不得在顶层 `await`；启动逻辑只能放在 `core/app.js` 末尾的 `boot()`。
- 新增工具脚本必须插在 `core/app.js` 之前，并在 `boot()` 中调用其 `init`。

`manifest.json` 的 content_scripts 顺序：

```json
// http/https：Todo 悬浮面板
"js": ["widget/todo-widget.js"], "run_at": "document_idle"

// file://：本地文件预览
"js": ["core/md-core.js", "preview/shell.js", "preview/md-page.js", "preview/json-page.js"],
"css": ["core/theme.css", "core/markdown.css", "preview/shell.css", "preview/json-page.css"]
```

## 4. 复用清单（写新代码前先查这里）

| 需求 | 用现成的 | 位置 |
| --- | --- | --- |
| 取/写/删存储 | `get` / `patch` / `removeKeys` / `keysByPrefix` | core/core.js |
| 外部存储变更（悬浮面板 / 后台写入） | `onStoreSync(fn)` → 收到宿主页转发的 `TOOLSX_STORE_SYNC` | core/core.js |
| Todo 提醒时间计算 | `todoRemindAt`（截止日期 + 默认 09:00 − 提前分钟） | tools/todo/todo.js（后台 `background.js` 里有同构实现，改动需同步） |
| 主题、偏好 | `prefs`、`savePrefs`、`flushPrefs`、`applyTheme` | core/core.js |
| toast、复制、弹窗骨架 | `toast` / `copy` / `openModal` / `closeModal` | core/core.js |
| 命名输入弹窗 | `promptText({title,label,value,placeholder,ok,cancel,empty}, cb)` | core/ui.js |
| 自定义下拉 | `cselToggle` / `cselClose` / `cselValue` / `cselSelect` + DOM 结构 `.csel/.csel-btn/.csel-val/.csel-caret/.csel-menu/.csel-opt` | css: core/core.css，js: core/ui.js |
| 文本文件导出 | `downloadText(filename, text, mime)` | core/ui.js |
| ID、时间、字节数 | `uid()` / `fmtTime()` / `formatBytes()` / `byteLen()` | core/core.js |
| 图标 | `ICO_DOC/ICO_JSON/ICO_FOLDER/ICO_PLUS/ICO_CHEV_*/ICO_EDIT/ICO_TRASH/ICO_LOCK/ICO_COPY/ICO_MSG` | core/core.js |
| Markdown 渲染 / 大纲 / TOC | `mdRender` / `mdOutline` / `tocHtml` / `hiCode` / `esc` | core/md-core.js |
| JSON 高亮 / 折叠树 | `jsonHi` / `jTree` / `jToggle` | core/json-view.js |
| 预览页外壳 | `window.TXShell.*`（`pageBar` 生成工具栏 HTML） | preview/shell.js |
| Prompt 参数模板 | `{{参数名}}` 语法；`prParseKeys` 解析 / `prMergeParams` 合并已配置项 / `prFill` 生成最终文本 | tools/prompt/prompt.js |

原则：能在 `core/` 复用的，不在工具目录里再写一份；确实只有单一工具使用的逻辑才留下（如 Docs 的块级编辑、Postman 的请求构建）。若同一逻辑被第二个工具需要，就上提到 `core/`，并在第 2 节表格中登记。

## 5. 样式规范

- 颜色、圆角、阴影、字体一律用 `core/theme.css` 的变量（`var(--paper)`、`var(--ink-2)`、`var(--accent)`、`var(--r-md)` 等）。**禁止在工具 CSS 中写死十六进制颜色**（唯一例外：SVG 属性中的 `currentColor`）。
- 深色模式：只在需要覆盖的规则里用 `:root[data-theme="dark"]` 前置，不要为每个类重写一遍。
- 页面标题区用 `.page-head`，必须保持 `position: sticky`（配合 `body{overflow-x: clip}`，**不能改成 `hidden`，否则 sticky 失效**）。
- 布局用 `.content`（`margin: 0 auto` 居中）+ `.view`（`display:none`，`.active` 才显示）。
- `overflow-x:hidden` 会杀死 sticky；页面级横向裁切只能写 `overflow-x: clip`。
- 需要「全宽铺满 + 视口固定高」的视图（目前为 JSON、Docs）：在 `core/app.js` 的 `switchView` 里给 `.content` / `.topbar` 加 `wide` class（`core.css` 中 `.content.wide` / `.topbar.wide` 取消 `max-width` 并压缩左右内边距），视图自身用 `.view.active#view-<name>{display:flex;flex-direction:column;height:calc(100vh - 100px)}`，面板设 `flex:1;min-height:0` 并在内部滚动，避免整页出现滚动条。
- Docs 的左侧目录是**常规布局列**（`grid-template-columns:290px 1fr`，`.tree-collapsed` 收成 `26px 1fr` 并显示竖向 `.docs-toggle` 按钮）；右侧 TOC 是**悬浮层**，用 `position:absolute;right:0` 浮在正文右侧，不占布局列宽，正文滚动由 `#docPreview` 内部完成，页头与 TOC 保持不动。
- 多栏工具参考 `tools/postman/postman.css` 的 `.api-layout` 高度分配：左侧目录与右侧详情共用同一列高，详情内上卡片固定高度（`min(380px, 60%)`）并让 Params/Headers/Body 区域内部滚动；窄屏（`max-width:860px`）退回单列自适应。
- 英文按钮/标签加 `white-space: nowrap`，避免文案换行挤坏布局；侧栏宽度要给英文文案留够空间。
- 媒体查询沿用现有断点：`1080px`（JSON 双栏转单栏）、`860px`（Postman 详情单列 / Docs TOC 缩窄）、`820px`（Docs 抽屉与页头紧凑）。
- 新增视觉元素前先确认 `.core.css` 是否已有等价 class；禁止另造一套按钮/卡片风格。
- `widget/` 的悬浮面板运行在任意网页里，样式写在 Shadow DOM 的 `<style>` 中并自带一套 `--tx-*` 局部变量（值抄自 `core/theme.css`），**不能**依赖主题变量注入，也不能写无前缀的全局选择器。

## 6. 数据与存储规范

- 所有 key 必须在 `core/core.js` 的 `STORE` 中登记，命名 `toolsx.<tool>.<part>`；动态 key 用函数形式（如 `docNote: (id) => 'toolsx.docs.note.' + id`）。
- 按“变更粒度”拆 key：列表/索引与单条正文分开，避免每次输入都全量重写大对象（参考 Docs 的 `docsIndex` + `docNote`，Postman 的 `apiIndex` + `apiExamples` + `apiSession` + `apiDraft`）。
- 写入一律走 `patch({...})`（按 key 覆盖），删除走 `removeKeys([...])`；内存态先改，再 `patch`。
- 高频输入用防抖（现有约定 150–400ms），并提供 `flush<X>()`，在 `core/app.js` 的 `flushAll()` 中注册（`visibilitychange` / `beforeunload` 会调用）。
- 读取时做兼容归一化（`Array.isArray(x)` 旧格式兼容、缺字段补默认），不要假设存储里是新结构。
- 旧版单 key 数据（`toolsxData` / `aihubData`）的迁移在 `migrateLegacy()`；新增 key 时同步补充迁移逻辑。
- 非扩展环境（直接打开 `app.html`）会自动退回 `localStorage`，逻辑必须两条路径都能跑。
- Prompt：`promptItems`（全部 Prompt 定义，含正文与参数配置）、`promptCats`（分类）、`promptStats`（id → `{n: 使用次数, t: 最近使用时间}`）、`promptSession`（当前选中的列表，`'all' / 'recent' / 'fav' / 分类 id / ''`）。首次运行（无 `promptCats`）只播种 5 个默认分类，**不内置任何 Prompt**；老数据的 `promptSession.seedV` 仅作为「曾经播种过内置示例」的标记，启动时会按名称一次性清理内置示例并移除该标记（改过名的不动）。
- Todo：`todoIndex`（任务列表）、`todoSession`（筛选 / 选中）、`todoSettings`（悬浮按钮开关 `widget` + 悬浮球位置 `widgetPos: {left, top}`）由前端写；`todoNotified`（id → 已提醒的 remindAt）**只由 `background.js` 写**，前端不得改动，避免与任务列表编辑互相覆盖。

## 7. 新增一个工具的步骤

1. 建目录 `tools/<name>/<name>.css`、`tools/<name>/<name>.js`（CSS 只写该工具专属规则）。
2. `app.html`：
   - 在 `tools/*` 样式之后加该工具 CSS；
   - 在 `.content` 中新增 `<section class="view" id="view-<name>">`，标题用 `.page-head`，其余用通用组件；
   - 在 `tools/<tool>` 脚本之后、`core/app.js` 之前加该工具 JS。
3. `core/app.js`：把 `<name>` 加入 `VIEWS`，补 `SEARCH_PH` 与 `render()` 分支；需要 `boot()` 初始化时加 `await`/调用。
4. `core/core.js`：在 `STORE` 增加该工具的 key，并在 `migrateLegacy` 需要时扩展。
5. 工具 JS 提供 `render<Name>()`（以及必要的 `Init`/`Flush`），全部交互只依赖 `core/` 的公共函数。
6. `popup.html`：如该工具需要从浮窗直达，增加一个带 `data-tool="<name>"` 的入口（`popup.js` 自动绑定，无需改 JS）。
7. `manifest.json`：只有新增 content script / 新权限 / 后台脚本时才改；网络类工具记得 `host_permissions`，提醒类工具需 `notifications` + `alarms` 并在 `background.js` 注册对应监听。
8. 第 9 节验证通过后，按第 10 节更新 AGENTS.md 与 README.md。

## 8. 修改现有工具的注意点

- Docs：正文按 key 懒加载（`docCache` + `loadDoc`），切换/离开前必须 `flushDocSaves()`；预览块编辑依赖 `splitBlocks` 的块边界，改 Markdown 渲染时不要破坏 `.blk` 结构。左侧目录为常规布局列，由 `treeCollapsed`（`prefs.docsTree`，默认 `false` 展开）控制，`applyTreeCollapsed()` 切换 `.tree-collapsed` 并显示竖向 `.docs-toggle` 按钮。右侧 TOC 的开关按钮位于编辑器 `.de-head` 工具栏（`#deTocBtn`），状态存 `prefs.tocCollapsed`，`buildDocToc()` 负责同步按钮显隐与 `.on` 高亮；TOC 为右侧悬浮面板，旧的竖向 `.toc-rail` 已移除。
- JSON：格式化/压缩/转义/还原/比对全部在前端完成；折叠树靠 `.jt-node.closed` 切换 `.jt-kids` 与 `.jt-ell`，收起数组时右侧要显示灰色元素数量。比对有两种模式（`jdMode`：`json` / `text`）：JSON 结构模式走 `diffWalk` 按路径输出差异；纯文本模式走 `jdTextDiff`（LCS，行数乘积超过 4e6 时提示分段），结果按 `add` / `del` / `same` 着色，连续相同行超过 8 行时折叠为「省略 N 行」。切换模式会复用 `renderJson` 同步页签、按钮与占位提示。
- Postman：详情修改 400ms 防抖自动保存（`apiAutoSave`/`apiPersistCurrent`），地址被清空时不得覆盖已保存内容；改请求结构时同步 `apiSnapshot`、导入导出格式（`url/method/headers/body`）与 `apiNorm*` 归一化。
- Prompt：正文中的参数只认 `{{参数名}}`（`PR_VAR_SRC`）；`prItemNorm` 始终用 `prMergeParams` 用正文里的参数键为准重算列表，已配置的 `label/def/multi/req` 保留、丢失的键直接移除。点击卡片即走 `prUseRecord`（`n+1`、更新 `t`），“常用/收藏”按 `n` 降序、`t` 降序排序，其余视图按 `prState.items` 数组顺序展示。手动排序由卡片右上角手柄拖动实现（`.pr-drag` + `prGridPointerDown` / `prDragMove` / `prCommitOrder`，仅「全部 / 分类 / 未分类」渲染手柄，搜索与「常用 / 收藏」不渲染手柄因此不可拖动；拖动到列表上下边缘会自动滚动）：起拖时卡片改为 `position:fixed` 跟随指针（`.pr-card.dragging`），原位插入 `.pr-slot` 虚线占位块，落点只移动占位块，松手后按占位块位置回填顺序再重渲染；拖动只交换当前视图内条目的槽位，不改动其他视图顺序；拖动结束后的 click 会被 `prGridClickCapture` 拦截，避免误触复制。导入兼容 `prompts / items / 数组 / 单对象` 与 `content|prompt`、`category|categoryName|cat`；同名分类合并、同名 Prompt 加 `(2)` 序号。导出格式 `{type:'toolsx.prompt', version:1, categories, prompts}`，分类按名称写入以便跨实例迁移。
- Todo：任务保存 300ms 防抖（`todoSave`）、会话 150ms（`todoSaveSession`），离开视图与页面隐藏都会 `flushTodo()`；`todoNorm` 里补默认字段并重算 `remindAt`，改字段时务必同步 `todoNorm`、`background.js` 的 `remindAtOf` 与 `widget/todo-widget.js` 的 `norm`。提醒时间口径：未设置时间按 09:00，提前量单位为分钟，`'none'` 表示不提醒。悬浮面板默认在右上角，拖动结束后把坐标写入 `widgetPos`；工具页改 `widget` 开关时必须保留其他 settings 字段（`Object.assign({}, todoSettings, { widget })`），否则悬浮球位置会丢失。
- 预览页：所有视觉规则必须限定在 `html[data-toolsx-preview]` 或 `body.tx-body` 之下，**绝不允许写无前缀的全局标签选择器**（会污染用户的普通 `file://` 页面）。`core/theme.css` 只定义变量，因此允许直接注入。
- 文案语言：Docs / JSON 工具与预览页为中文；Postman 页面（含按钮、空状态、搜索提示）全部英文。

## 9. 验证流程（每次改动都要做）

```bash
# 1) 语法
for f in core/*.js tools/*/*.js preview/*.js widget/*.js app-window.js popup.js background.js; do node --check "$f"; done

# 2) manifest
python3 -c "import json;json.load(open('manifest.json'));print('manifest ok')"

# 3) 本地页面（不经过扩展，走 localStorage）
python3 -m http.server 8771 --bind 127.0.0.1
# 打开 http://127.0.0.1:8771/app.html 逐个视图点击验证
```

浏览器实测至少覆盖：

- Todo：新建 / 完成 / 星标（Focus）、任务详情与步骤、日期时间与提醒下拉、清除已完成、刷新后数据仍在、深色模式；直接打开 `app.html` 时提醒退化为页面内通知。
- Todo 悬浮面板（扩展内）：刷新扩展后**新开标签页**打开任意 https 网页，检查右上角按钮、Focus 数量、快捷添加、勾选完成、打开完整页面、隐藏按钮；拖动悬浮球后位置应跨页面保留，面板自动避让到视口内；在工具页改任务后悬浮面板应实时同步。
- 系统通知：设置一条 1～2 分钟后的提醒，关闭工具页后仍能收到通知；点击通知应打开 Todo 页。
- Docs：标题下无描述、全宽视口布局；左侧目录默认展开为常规布局列（内含 新建笔记 / 文件夹 / 全部折叠 / 收起目录），收起后变成竖向「目录」按钮，不遮挡正文；源码模式 textarea 填满编辑区高度；预览模式页头固定、正文内部滚动；编辑器头部的列表按钮可开合右侧悬浮 TOC，滚动正文时 TOC 不动；目录树展开/收起、拖拽、新建/重命名弹窗（`promptText`）、源码/预览切换、自动保存后刷新仍在。
- JSON：版面应左右铺满、标题无描述、操作按钮与页签在顶部同一行、面板占满视口且页面无纵向滚动条；格式化/压缩/转义/还原、结果折叠与搜索；比对页分别用 JSON 结构模式（合法 JSON 按路径出差异）与纯文本模式（逐行出增删、长段相同行折叠）验证；深色模式。
- Postman：`.csel` 下拉开合与方法配色、新建文件夹/请求弹窗、Params/Headers/Body 编辑与自动保存、导出下载、响应保存为示例。
- Prompt：首次进入应只有 5 个默认分类、没有内置 Prompt；新建分类 / 重命名 / 删除（删除后其中 Prompt 变未分类）；新建 Prompt 后正文里的 `{{参数}}` 自动出现在参数配置区；点击带参数的卡片应弹出输入框并实时预览最终 Prompt（必填为空时阻止复制），无参数卡片直接复制；**点击任意卡片后卡片次数与侧栏「常用」应立刻 +1**；拖动排序改为卡片右上角的手柄按钮：按住手柄后卡片跟随指针移动、原位出现虚线占位块指明落点（松手后刷新顺序仍在），点手柄本身不会计入使用次数；「常用 / 收藏」与搜索状态下不显示手柄、无法拖动；拖动到列表上下边缘会自动滚动；数据较多时只有右侧卡片区滚动，页面标题与左侧分类栏保持不动；收藏与常用视图、搜索、导入/导出勾选弹窗（默认全选、全选/半选）、深色模式与 860px 单列布局；老数据升级后内置示例应被清理且用户自建 Prompt 保留。
- 预览页：分别打开 `tests/test.md`、`tests/test.json`、`tests/test.jsonc`，检查工具栏、主题切换、TOC 跳转、JSON 折叠与 JSONC 注释解析（需开启「允许访问文件网址」）。
- 控制台必须无报错；改动 CSS 后换端口或新的隔离上下文，避免缓存误判。

## 10. 开发完成后：同步文档（强制）

任何新增/删除工具、新增公共模块、改变存储 key、改变目录结构、新增用户可见能力，都必须同时更新下面两处，否则视为未完成。

### 10.1 更新本文件 AGENTS.md

- 第 2 节职责表：补/改对应行（文件路径 + 提供的关键全局符号）。
- 第 3 节加载顺序：脚本/样式顺序有变动时更新。
- 第 4 节复用清单：新增到 `core/` 的公共函数/组件必须登记（“需求 → 函数 → 位置”）。
- 第 7 节：若新增流程发生变化（新的必改文件、新的权限），更新步骤。
- 第 9 节：新增工具要在实测清单里补一行验证要点。
- 发现新坑（例如 CSS `overflow` 与 sticky、MV3 缓存、postMessage 时序）就补进第 5 节或第 11 节，不要只留在对话里。

### 10.2 更新 README.md

- 第 2 节「功能」表格：每个用户可见工具一行，写清实际能力（写得能被使用者看懂，不写内部实现）。
- 目录结构块：新增/删除目录时更新。
- 数据存储：新增或改名存储 key 时更新 key 列表。
- 安装/调试命令变化时同步。

### 10.3 提交前自检

- [ ] `node --check` 全绿、manifest 可解析
- [ ] 浏览器实测清单全部通过、控制台无报错
- [ ] AGENTS.md 与 README.md 已按上面两节更新
- [ ] `git status` 中没有 `/dev`、`/tests`、`.DS_Store` 等被忽略内容

## 11. 已知坑（不要重复踩）

- `body{overflow-x:hidden}` 会让 `position: sticky` 失效 → 用 `clip`。
- 引入 Google Fonts 等远程资源会显著拖慢首屏 → 只用系统字体。
- sandbox iframe 无文件写入能力，下载必须经宿主页（`downloadText` → `TOOLSX_DOWNLOAD`）。
- 刷新扩展后旧 content script 仍可能留在已打开的标签页，预览页需**新开标签页**验证。
- iframe 初始化依赖 `TOOLSX_READY` → `TOOLSX_INIT`，不要在 `storeInit()` 之前读 `get()` 的值。
- 传统脚本共享作用域：复制粘贴代码段时极易产生重复 `const`/`function` 声明，改完 grep 一次符号名。
- `background.js` 只写 `toolsx.todo.notified`，不要让它回写 `toolsx.todo.tasks`，否则会覆盖用户正在编辑的任务；`app-window.js` 用 `lastWrites` 值比对抑制自身写入回声，新增同步逻辑时保持这一机制。
- MV3 service worker 会被回收，所有定时提醒都必须走 `chrome.alarms`（不要在后台用 `setInterval`）；每次任务变化后都要重新 `chrome.alarms.clear` + `create` 排期。
- `widget/todo-widget.js` 是 content script：改完必须**刷新扩展并新开标签页**才生效；它直接写 storage，绕过 sandbox，因此工具页依赖 `TOOLSX_STORE_SYNC` 才能看到变化。
- 媒体查询里把多栏网格改成单列（`grid-template-columns:1fr`）时，grid item 仍会被内部横向滚动区（如横向分类导航）的 min-content 撑宽，导致整页横向溢出 → 给该 item 加 `min-width:0`（Prompt 的 `.pr-side` / `.pr-nav` 即为此）。
