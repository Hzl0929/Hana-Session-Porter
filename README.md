# Session Porter（v2 App）

在 Hana 的**会话列表里右键任意一条会话**，把它导出成 **JSON / Markdown / HTML**，文件落到 `<HANA_HOME>/session-exports/`。

- 形态：Hana v2 App（`manifestVersion: 2`），入口 `index.js`，用 `defineApp` + 内嵌 SDK。
- 交互：会话条目右键菜单三项，挂在宿主 `hana/session.contextMenu` 座位上。
- 回执：导出完成/失败走**系统通知**（右键点击没有聊天回复通道）。

## 用法

会话列表 → 右键某条会话 → 导出会话 · JSON / Markdown / HTML。

默认落点：`<HANA_HOME>/session-exports/`（Windows 通常是 `C:\Users\<你>\.hanako\session-exports\`），
文件名形如 `<标题>_<本地时间>_<会话UUID>.<ext>`。若宿主拒写该目录，会自动退到 App 数据目录，通知里给的是真实路径。

## 三种格式

| 格式 | 内容 |
|---|---|
| `json` | 清洗后的消息列表（`meta` + `messages`），结构稳定、便于二次处理 |
| `markdown` | 人类可读的对话文本，思考过程折叠在 `<details>` 里，工具调用/结果分块 |
| `html` | 单文件、自包含、断网可开；浅/深色自适应，印刷友好（可 Ctrl+P 存 PDF） |

## 权限

安装时需同意三项：`app/resources.read`（读会话）、`app/resources.write`（写文件）、`app/notifications.show`（发通知）。

## 想改这个 App

见同目录的 **`开发文档.md`**——里面有文件地图、运行链路、关键契约与坑、开发迭代流程，以及一张"常见改动菜单"。