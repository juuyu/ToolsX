# Tools-X

一个纯浏览器运行的 Chrome 扩展（Manifest V3），把常用的开发/写作小工具集中在一个页面里：待办清单（Todo）、多级目录笔记（Docs）、JSON 工具、HTTP 请求调试（Postman）、Prompt 管理。无需后端服务，所有数据保存在浏览器本地，离线可用。

## 功能

| 工具 | 能力 |
| --- | --- |
| Todo | 参考 Microsoft To Do 的智能列表（Focus / 计划 / 全部 / 已完成）；任务步骤、备注、截止日期与时间；到点通过浏览器系统通知提醒；所有网页右上角提供可拖动的悬浮按钮（位置自动记忆），点开即可速记与勾选完成 |
| Docs | 全宽视口工作区：多级目录笔记，Markdown / JSON 两种文档格式；左侧目录为默认收起的悬浮抽屉（点按钮、点外部或 Esc 可开合），拖拽整理目录；块级所见即所得编辑，源码模式铺满编辑区；预览模式页头固定、正文内部滚动，编辑器工具栏可开合悬浮标题树（TOC）并跳转；自动保存 |
| JSON | 全宽双栏工作区（工具栏置顶、面板占满视口并在内部滚动）：格式化 / 压缩 / 转义 / 还原；结果支持语法高亮、节点折叠与结果内搜索；比对支持「JSON 结构」与「纯文本逐行」双模式 |
| Postman | 文件夹 + 请求管理，拖拽排序与跨文件夹移动；自定义请求方法/请求体类型下拉；Params / Headers / Body 编辑；响应保存为示例；请求与文件夹级导入导出 |
| Prompt | Prompt 模板管理：默认 5 个分类（翻译 / 写作 / 编程 / 分析 / 其他），不内置示例；正文用 `{{参数名}}` 定义参数，使用时可填写参数并实时预览最终 Prompt，无参数则一键复制；点击即计入使用次数，按次数与最近使用时间排序的「常用」；使用统计与最常用排行；按住卡片右上角的拖动按钮可调整顺序，拖动时卡片跟随指针、原位显示虚线占位；数据较多时仅右侧列表滚动，标题与分类栏固定；导入/导出支持按 Prompt 勾选（默认全选） |
| 本地文件预览 | 在浏览器中打开本地 `.md` / `.json` / `.jsonc` 文件时自动生成带工具栏的预览页（需在扩展详情中开启「允许访问文件网址」） |

## 安装

1. 打开 `chrome://extensions`，开启「开发者模式」。
2. 选择「加载已解压的扩展程序」，选中本项目根目录。
3. 点击工具栏中的 Tools-X 图标，在浮窗中选择工具；工具页会在新标签页打开。
4. 如需本地文件预览：在扩展详情页打开「允许访问文件网址」。
5. 如需系统通知提醒：保持浏览器运行即可；若系统层面关闭了 Chrome 通知，请在系统设置中重新允许。

## 目录结构

```
core/           公共层：主题变量、通用组件样式、Markdown 渲染、JSON 展示、存储、UI 组件、路由
tools/todo/     Todo 工具（任务列表 / 详情 / 提醒设置）
tools/docs/     Docs 工具（逻辑 + 专属样式）
tools/json/     JSON 工具
tools/postman/  Postman 工具
tools/prompt/   Prompt 管理工具（模板 / 参数 / 分类 / 统计 / 导入导出）
widget/         所有网页的 Todo 悬浮面板（content script，Shadow DOM 隔离）
preview/        本地 .md / .json 文件预览（content script + 预览外壳）
popup.html/.js  插件浮窗入口
app-window.html 宿主页（为 sandbox 内的 app.html 提供存储 / 网络 / 剪贴板 / 下载能力）
app.html        工具主页面（运行在 sandbox iframe 中）
background.js   MV3 service worker：Todo 提醒调度（alarms + notifications）
```

## 数据存储

- 数据全部存放在 `chrome.storage.local`，按工具拆分为多个 key，不使用后端、不做云同步。
- 主要 key：`toolsx.prefs`、`toolsx.todo.tasks` + `toolsx.todo.session` + `toolsx.todo.settings` + `toolsx.todo.notified`、`toolsx.docs.index` + `toolsx.docs.note.<id>`、`toolsx.api.index` + `toolsx.api.examples.<id>` + `toolsx.api.session` + `toolsx.api.draft`、`toolsx.prompt.items` + `toolsx.prompt.categories` + `toolsx.prompt.stats` + `toolsx.prompt.session`。
- 旧版单 key 数据（`toolsxData` / `aihubData`）会在首次启动时自动迁移并删除。
- 非扩展环境（直接打开 `app.html`）自动退回 `localStorage`，同样按 key 分开保存；此时提醒退化为页面内通知。

## 开发说明

本项目没有构建步骤，修改源码后刷新扩展（`chrome://extensions` 中点击刷新）即可生效。开发规范、模块边界与新增工具的步骤见 [AGENTS.md](AGENTS.md)。

本地调试页面（不经过扩展，使用 `localStorage`）：

```bash
python3 -m http.server 8771 --bind 127.0.0.1
# 浏览器打开 http://127.0.0.1:8771/app.html
```
