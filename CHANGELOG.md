# 变更日志

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。Hana v2 App 的版本号写在
`session-porter/manifest.json` 的 `version`。

## 0.3.1

- 选择窗口右上角加 **✕**，并支持 **Esc** 关窗。
  这个原生小窗没有系统标题栏关闭钮，之前若中途不导出，只能到任务栏杀窗。
- 关窗走两级兜底：先 `hana.window.close()`，失败再退浏览器原生 `window.close()`。

## 0.3.0

适配 **Hana 1.0.0-beta**。

- 换用 1.0 随包的官方 App SDK；`minAppVersion` 抬到 `1.0.0-beta`；补上 `description`。
- 包目录结构改为"包根目录名 = `manifest.id`"（1.0 校验器强制要求）。
- 右键菜单从三条并列（JSON / Markdown / HTML）收敛为**一个「导出会话」入口**，
  点击后弹出一个原生小窗选格式。悬浮展开子菜单在插件侧做不到（见开发文档 §5.3）。
- 新增能力 `app/windows.manage` 与 `ui/` 页面（选择窗口）。
- 新增存活探测：窗口 4 秒内没有页面握手回执，就认为没起来，自动改为**一次性导出全部三种格式**，
  保证这个入口不会点完没反应。
- 在 Hana 1.0.0-beta 上把"右键 → 开窗 → 点格式 → 落盘 → 通知"整条链实测跑通。

## 0.2.1

- 修复导出失败：误用工具参数上的 `ctx.dataDir`（undefined）改为入口上下文的 `sdk.dataDir`。

## 0.2.0

- 从 v1 插件迁移为 **v2 App**（`manifestVersion: 2`，`defineApp` + SDK）。
- 交互改为会话列表右键菜单（`hana/session.contextMenu`），三条并列导出项。
- 导出经 `resources` 读写；结果用系统通知回执。

## 0.1.0（v1 插件）

- 斜杠命令 `/export-session <json|markdown|html>`。
- 形态为 `trust: "full-access"` 的旧式插件，已被 v2 App 取代。
