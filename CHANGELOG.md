# 变更日志

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。Hana v2 App 的版本号写在
`session-porter/manifest.json` 的 `version`。

## 0.3.3

导出文件名优先用会话名。

- 之前导出文件名几乎总是掉到“第一句用户消息”兜底：代码拿 jsonl 头部的 UUID 去查
  `session-titles.json`，而那张表的 key 是宿主 sessionId（`sess_xxx` 形式），两边对不上，
  查询从未命中。
- 现在会话名按三级链路解析：宿主会话列表（`session:list`）里那条会话的 `title`（侧栏
  显示什么就是什么）→ `session-titles.json`（改用正确的 key 查，两条键都试）→ 第一句
  用户消息。选择窗口的标题栏同步受益。
- 为此新增能力词 `app/sessions.read`（共五项），安装更新时需重新确认一次权限。
  接口被拒或旧宿主不支持时自动降级到后两级，导出不受影响。

## 0.3.2

市场投稿版。应用代码与 0.3.1 一致，改的是出包方式和版本号。

- 改用官方打包器（`scripts/extension-pack.mjs`）出包，随包提供
  `app-session-porter-0.3.2.entry.json`，作为 Hana Global 市场的投稿物。
- 0.3.1 那个 Release 附件是手工压的 zip，容器格式与官方打包器产物不同，
  没法配一份合规的条目文件，因此按市场要求「不替换已发布版本的安装包」，改为抬版本重新发布。

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
