# Session Porter

把 Hana 的一条会话导出成 **Markdown / HTML / JSON** 的 v2 App。

在左侧会话列表里**右键任意一条会话 → 「导出会话」**，在弹出的窗口里选一种格式，
文件就落到 `<HANA_HOME>/session-exports/`。

- 形态：Hana v2 App（`manifestVersion: 2`）。
- 兼容：面向 **Hana 1.0.0-beta**（`minAppVersion: 1.0.0-beta`）。
- 当前版本：**0.3.2**（见 [`CHANGELOG.md`](CHANGELOG.md)）。

## 特性

- **一个入口，不占菜单**：右键菜单只加一条「导出会话」，格式在选择窗口里挑。
- **三种格式**：
  - `Markdown` 人类可读，思考过程折叠，适合阅读与整理；
  - `HTML` 单文件、自包含、断网可开，浅/深色自适应，印刷友好（可 Ctrl+P 存 PDF）；
  - `JSON` 清洗后的消息列表（`meta` + `messages`），结构稳定，便于二次处理。
- **只导出当前活动分支**：按事件溯源链重建，正确绕过被回退的旧分支。
- **落点稳**：优先写 `<HANA_HOME>/session-exports/`；被拒时自动退到 App 数据目录，通知里给真实路径。
- **不会点完没反应**：窗口没起来时自动改为一次性导出全部三种格式。

## 安装

### 从发布包

1. 在 Releases 里下载 `app-session-porter-<version>.zip`。
2. 用 Hana 的应用管理（设置 → 应用 / 扩展）导入该 zip，按提示确认权限。

### 从源码

把本仓库拷成一个名为 `session-porter` 的目录，再把它作为本地源安装
（Hana 的插件/应用管理支持本地目录安装）。本地开发、校验、打包、热更的完整流程见
[`开发文档.md`](开发文档.md) §6。

## 用法

1. 在左侧会话列表里找到目标会话，**右键 → 导出会话**。
2. 窗口里点 **Markdown / HTML / JSON**。
3. 导出成功后窗口自动关闭，系统通知里给出真实落点（文件名形如 `<标题>_<本地时间>_<会话UUID>.<ext>`）。
4. 不想导出就点窗口右上角 **✕**，或按 **Esc**。

## 权限

安装时需同意四项：

| 能力 | 用途 |
|---|---|
| `app/resources.read` | 读会话文件 |
| `app/resources.write` | 写导出文件 |
| `app/notifications.show` | 导出结果的系统通知 |
| `app/windows.manage` | 打开格式选择窗口 |

## 目录结构

项目根目录就是 App 包本身（`manifest.json` 在根上）：

```
.
├── manifest.json      App 清单
├── index.js           入口：defineApp、注册工具、导出逻辑、选择窗口
├── lib/               会话解析与三种格式的渲染（纯函数）
├── ui/                选择窗口页面
├── assets/            图标
├── sdk/               随包内嵌的官方 App SDK（勿手改）
├── README.md          本文
├── 开发文档.md         面向改动者的开发文档（契约、坑、迭代流程）
└── CHANGELOG.md       版本历史
```

> `manifest.id` 是 `session-porter`。Hana 的校验器与生产 loader 要求**目录名等于 id**，
> 所以本地安装 / `--dir` 校验时，先把整个项目目录拷成名为 `session-porter` 的目录；
> 或者直接打包，把生成的 `app-session-porter-<version>.zip` 交给 Hana 安装（打包产物不受源目录名影响）。

## 已知限制

- **不能做成悬浮展开子菜单**。宿主的右键菜单原语内部支持二级子菜单，但插件能声明的
  `contributes.ui.contextMenus` 是平的，多写一个键会让整个应用拒载。因此改用"一个入口 + 选择窗口"。
- **选择窗口没有系统标题栏关闭钮**，关窗靠页面里的 ✕ 或 Esc。
- 导出的是**当前活动分支**，被分支回退掉的旧消息不会出现在导出里。

## 开发

见 [`开发文档.md`](开发文档.md)：文件地图、运行链路、窗口协议、关键契约与坑、
静态校验 / 冒烟 / 打包命令，以及一张"常见改动菜单"。
