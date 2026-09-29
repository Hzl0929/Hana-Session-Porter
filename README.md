# Session Porter

在 Hana 会话里用斜杠命令，把当前会话导出成 **JSON / Markdown / HTML**，文件落到本地目录。

## 背景与局限

- 最初的设想是**左侧边栏那种传统 UI**：在会话列表上点一下就导出（右键菜单项，或列表项上的按钮）。但 Hana 插件的 UI 扩展点只有 `page` / `widget` / `settingsTab` 三类，`widget` 还落在**右侧**工作区；而会话列表的右键菜单项由客户端写死，插件够不到。这个形态做不出来，最终只保留了**斜杠命令**这一条路。
- 会话导出是个很通用的需求，**很有可能在后续版本（如 Hana Agent 1.0）被官方原生能力覆盖**。真有那一天，本插件大概率会被取代，届时按需下线即可——它的价值更多是「现在就能用」。

## 用法

在任意会话的输入框里敲：

```
/export-session json
/export-session markdown
/export-session html
```

- 命令名会被归一化，所以 `/export-session` 和 `/export_session` 都能用。
- 不带格式参数时，会回一句用法提示，列出三种格式。
- 导出的是**当前会话**（命令所在的那条会话）。
- 导出完成后，回执里会给出文件的完整路径。

## 导出文件在哪

默认导出到：

```
<HANA_HOME>/session-exports/
```

Windows 上通常是 `C:\Users\<你>\.hanako\session-exports\`。文件名形如：

```
<会话标题>_<导出的本地时间>_<会话UUID>.<ext>
```

若设置了环境变量 `HANA_HOME`，优先用它；否则从当前会话文件路径反推。

## 三种格式

| 格式         | 内容                                                                  |
| ------------ | --------------------------------------------------------------------- |
| `json`     | 清洗后的消息列表（`meta` + `messages`），结构稳定、便于二次处理   |
| `markdown` | 人类可读的对话文本，思考过程折叠在`<details>` 里，工具调用/结果分块 |
| `html`     | 单文件、自包含、断网可开；浅/深色自适应，印刷友好（可 Ctrl+P 存 PDF） |

JSON 另有一个 `raw` 模式（保留全部原始事件），目前仅内部函数支持，未接到斜杠命令上。

## 权限

用户手敲的斜杠命令走 handler 形式，**要求插件为 `full-access`**，需要在 `设置 → 插件` 里手动开启信任。插件本身不访问网络，也不碰插件 ctx，只读写本地文件。

## 结构

```
session-porter/
├── manifest.json            # id / name / trust: full-access
├── 开发心得.md               # 制作过程中踩到的坑与结论（改这个插件前值得先读）
├── package.json             # type: module（命令文件按 ESM 加载）
├── commands/
│   └── export-session.js    # 斜杠命令 handler
└── lib/
    ├── reader.js            # 解析 JSONL、重建当前活动分支
    ├── export.js            # 核心导出：定位目录、渲染、写文件
    ├── home.js              # 定位 HANA_HOME / 导出目录
    ├── render-json.js
    ├── render-markdown.js
    ├── render-html.js
    └── util.js              # 时间格式化、围栏长度、标题截断
```

## 想改的地方

- **消息里的称呼**：`lib/render-markdown.js` 顶部的 `LABELS`（默认「用户 / 助手」）。
- **导出目录**：`lib/home.js` 的 `resolveExportDir`。
- **默认不含思考过程**：目前总是包含；如需开关，在 `lib/export.js` 里按 `meta` 传参处理。
- **后续可能支持会话导入**：暂定支持JSON格式。
- **斜杠命令支持⬆️键读取历史**：并且 enter 应用斜杠时先应用到对话框，方便填写后续参数而不是直接执行。
