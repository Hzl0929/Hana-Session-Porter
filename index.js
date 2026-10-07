// Session Porter · v2 App 入口
//
// 在会话列表的会话条目右键菜单里，用一个「导出会话」入口把当前会话导出成
// JSON / Markdown / HTML，落到 <HANA_HOME>/session-exports/。
//
// 交互设计（Hana 1.0 beta）：
//  - 右键只有一个入口「导出会话」。
//  - 点击后尝试打开一个 App 自有小窗口选格式；窗口真的起来了就让用户选。
//  - 如果宿主没有把窗口真正创建出来（页面迟迟没有握手回执），则退化为
//    "一次性导出全部三种格式"，保证这个入口永远不会点完没反应。
//
// 为什么不做"悬浮展开子菜单"：宿主的右键菜单是宿主画的 ContextMenuItem 原语，
// 插件能声明的 contributes.ui.contextMenus 是平的（只认 id/title/icon/surface/
// toolName/args），多写一个键会让整个应用拒载。宿主内部支持二级子菜单，但没
// 开放给插件。详见开发文档 §5.3。
//
// 运行环境（Hana 1.0 beta AppHost）要点：
//  - 入口是 defineApp(async sdk => …)，注册工具用 sdk.tools.register；
//  - 菜单项由 contributes.ui.contextMenus 声明，绑定 hana/session.contextMenu；
//  - AppHost 里裸 fs 读不到盘外路径，会话内容经 sdk.resources 读回；
//  - 结果用系统通知回执（右键点击没有聊天回复通道）；
//  - 选择窗口走 sdk.windows，页面在 ui/ 下，经 hana.window.request 与后台通话。
import path from "node:path";
import { defineApp } from "./sdk/app-contract/server-client.js";
import { parseJsonl, extractConversation, getSessionHeader, tsToMillis } from "./lib/reader.js";
import { renderJson } from "./lib/render-json.js";
import { renderMarkdown } from "./lib/render-markdown.js";
import { renderHtml } from "./lib/render-html.js";
import { fileStamp, firstLine } from "./lib/util.js";

export const name = "session-porter";

const FORMATS = {
  json: { ext: "json", render: renderJson },
  markdown: { ext: "md", render: renderMarkdown },
  html: { ext: "html", render: renderHtml },
};

const EXPORT_DIR = "session-exports";
const CHOOSER_ENTRY = "/chooser.html";
// 选择窗口从创建到页面发第一条握手回执允许的等待；超时即认为窗口没起来。
const CHOOSER_ALIVE_TIMEOUT_MS = 4000;

function normalizeFormat(input) {
  const v = String(input ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v === "md") return "markdown";
  if (v === "htm") return "html";
  return FORMATS[v] ? v : null;
}

function safeSlug(s) {
  return String(s ?? "")
    .trim()
    .replace(/[\\/:*?"<>|\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 48)
    .trim();
}

// ResourceIO 的 read 返回形状在不同宿主上可能是字符串、Buffer 或带字段的对象。
function extractText(result) {
  if (result == null) return "";
  if (typeof result === "string") return result;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(result)) return result.toString("utf8");
  if (result instanceof Uint8Array) return Buffer.from(result).toString("utf8");
  if (typeof result === "object") {
    for (const key of ["text", "content", "data", "body"]) {
      const v = result[key];
      if (typeof v === "string") return v;
      if (v instanceof Uint8Array) return Buffer.from(v).toString("utf8");
    }
  }
  return String(result);
}

async function readLocalText(sdk, filePath) {
  const result = await sdk.resources.read({ kind: "local-file", path: filePath });
  return extractText(result);
}

async function readTitleFromTitles(sdk, sessionPath, sessionId) {
  if (!sessionId) return null;
  try {
    const file = path.join(path.dirname(sessionPath), "session-titles.json");
    const map = JSON.parse(await readLocalText(sdk, file));
    const t = map?.[sessionId];
    return typeof t === "string" && t.trim() ? t.trim() : null;
  } catch {
    return null;
  }
}

function resolveTitle({ fromTitles, messages }) {
  if (fromTitles) return fromTitles;
  const firstUser = messages.find((m) => m.role === "user" && m.text);
  if (firstUser) return firstLine(firstUser.text, 40);
  return "会话导出";
}

async function writeExport(sdk, outPath, content) {
  const dir = path.dirname(outPath);
  try {
    await sdk.resources.mkdir({ kind: "local-file", path: dir }, { recursive: true });
  } catch {
    // 目录已存在、或宿主不支持 mkdir；继续尝试写入。
  }
  try {
    await sdk.resources.write({ kind: "local-file", path: outPath }, content);
    return outPath;
  } catch {
    // 盘外写被拒时退回 App 自己的数据目录（免授权、必定可写）。
    const fallback = path.join(sdk.dataDir, path.basename(outPath));
    await sdk.resources.write({ kind: "local-file", path: fallback }, content);
    return fallback;
  }
}

function hanaHomeFrom(dataDir) {
  // dataDir = <HANA_HOME>/app-data/<appId>
  return path.resolve(dataDir, "..", "..");
}

async function notify(sdk, title, body) {
  try {
    await sdk.notifications.show({ title, body });
  } catch {
    // 通知被拒不影响导出本身。
  }
}

// 读会话 → 重建消息 → 取标题 → 渲染 → 落盘。
// stampMs 可在一次调用里复用，让同批导出的多个文件共享同一个时间戳。
async function exportSession(sdk, sessionPath, format, stampMs) {
  if (!sessionPath) throw new Error("这条会话没有可用的会话文件路径，无法导出。");

  const raw = await readLocalText(sdk, sessionPath);
  const { events } = parseJsonl(raw);
  const header = getSessionHeader(events);
  const messages = extractConversation(events);
  const sessionId = typeof header?.id === "string" ? header.id : null;

  const title = resolveTitle({
    fromTitles: await readTitleFromTitles(sdk, sessionPath, sessionId),
    messages,
  });

  const meta = {
    title,
    sessionId,
    agentId: sessionId ? path.basename(path.dirname(path.dirname(sessionPath))) : null,
    createdAt: tsToMillis(header?.timestamp) || messages.find((m) => m.timestamp)?.timestamp || null,
    exportedAt: Date.now(),
    messageCount: messages.length,
    format,
    mode: format === "json" ? "clean" : null,
  };

  const content = FORMATS[format].render({ meta, messages, events, mode: "clean" });

  const uuid = sessionId || path.basename(sessionPath).replace(/\.jsonl$/i, "");
  const slug = safeSlug(title);
  const stamp = fileStamp(Number.isFinite(stampMs) ? stampMs : Date.now());
  const fileName = [slug || "session", stamp, uuid].join("_") + "." + FORMATS[format].ext;
  const outPath = path.join(hanaHomeFrom(sdk.dataDir), EXPORT_DIR, fileName);

  const finalPath = await writeExport(sdk, outPath, content);
  return {
    path: finalPath,
    format,
    bytes: Buffer.byteLength(content, "utf8"),
    messageCount: messages.length,
    title,
  };
}

// 兜底：一次导出全部三种格式（共享同一个时间戳）。
async function exportAllFormats(sdk, sessionPath) {
  const stamp = Date.now();
  const results = [];
  for (const format of Object.keys(FORMATS)) {
    results.push(await exportSession(sdk, sessionPath, format, stamp));
  }
  return results;
}

// ---------- 选择窗口（单例） ----------

let chooserWindowId = null;
let disposeChooserMessages = null;
let chooserAliveResolve = null;

function armChooserAlive() {
  let settled = false;
  const promise = new Promise((resolve) => {
    chooserAliveResolve = () => {
      if (settled) return;
      settled = true;
      chooserAliveResolve = null;
      resolve(true);
    };
    setTimeout(() => {
      if (settled) return;
      settled = true;
      chooserAliveResolve = null;
      resolve(false);
    }, CHOOSER_ALIVE_TIMEOUT_MS);
  });
  return promise;
}

async function closeChooser(sdk, callToken) {
  const id = chooserWindowId;
  chooserWindowId = null;
  chooserAliveResolve = null;
  try {
    disposeChooserMessages?.();
  } catch {
    // ignore
  }
  disposeChooserMessages = null;
  if (id) {
    try {
      await sdk.windows.close({ windowId: id, callToken });
      await sdk.logger.info(`session-porter: closed chooser ${id}`);
    } catch (err) {
      // 窗口可能已被用户关掉，忽略；记一条便于诊断。
      await sdk.logger.info(
        `session-porter: close chooser ${id} -> ${err?.code || ""} ${err?.message || err}`,
      );
    }
  }
}

// 返回 { alive }：alive=false 表示宿主没把窗口真正建起来，调用方应走兜底。
async function openChooser(sdk, sessionPath, callToken) {
  await closeChooser(sdk, callToken);

  let title = "会话导出";
  try {
    const raw = await readLocalText(sdk, sessionPath);
    const { events } = parseJsonl(raw);
    const header = getSessionHeader(events);
    const sessionId = typeof header?.id === "string" ? header.id : null;
    title = resolveTitle({
      fromTitles: await readTitleFromTitles(sdk, sessionPath, sessionId),
      messages: extractConversation(events),
    });
  } catch {
    // 标题只是锦上添花，读不到就用默认。
  }

  const alivePromise = armChooserAlive();

  const win = await sdk.windows.create({
    entry: CHOOSER_ENTRY,
    title: "Session Porter · 导出会话",
    bounds: { width: 460, height: 440 },
    callToken,
    data: { title, formats: Object.keys(FORMATS) },
  });
  chooserWindowId = win.windowId;
  await sdk.logger.info(`session-porter: chooser window ${win.windowId} (state=${win.state})`);

  const registration = await sdk.windows.handleMessages(
    { windowId: win.windowId, callToken },
    async ({ message }) => {
      const m = message && typeof message === "object" ? message : {};
      await sdk.logger.info(`session-porter: window message "${m.type}"`);
      if (m.type === "info") {
        chooserAliveResolve?.();
        return { ok: true, title };
      }
      if (m.type === "export") {
        const format = normalizeFormat(m.format);
        if (!format) return { ok: false, error: `不支持的导出格式：${String(m.format)}` };
        try {
          const result = await exportSession(sdk, sessionPath, format);
          await notify(
            sdk,
            "Session Porter · 导出完成",
            `${result.format} · ${result.messageCount} 条消息\n${result.path}`,
          );
          return {
            ok: true,
            format: result.format,
            path: result.path,
            bytes: result.bytes,
            messageCount: result.messageCount,
          };
        } catch (err) {
          const msg = err?.message || String(err);
          await notify(sdk, "Session Porter · 导出失败", msg);
          return { ok: false, error: msg };
        }
      }
      return { ok: false, error: "未知请求。" };
    },
  );

  disposeChooserMessages = () => registration?.dispose?.();

  try {
    sdk.windows.onEvent({ windowId: win.windowId, callToken }, (event) => {
      if (event?.type === "closed" && chooserWindowId === win.windowId) {
        chooserWindowId = null;
        try {
          disposeChooserMessages?.();
        } catch {
          // ignore
        }
        disposeChooserMessages = null;
      }
    });
  } catch {
    // 关闭回调注册失败不影响导出本身。
  }

  const alive = await alivePromise;
  if (!alive) {
    await sdk.logger.info("session-porter: chooser window did not come alive; falling back");
    await closeChooser(sdk, callToken);
  }
  return { alive };
}

export default defineApp(async (sdk) => {
  await sdk.logger.info("session-porter loaded");

  await sdk.tools.register({
    name: "session_porter_export",
    description:
      "把当前会话导出为 JSON / Markdown / HTML。给 format 时直接导出该格式；省略时尝试打开选择窗口，窗口不可用时导出全部三种格式。",
    parameters: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["json", "markdown", "html"],
          description: "给定时直接导出该格式；省略则打开选择窗口。",
        },
      },
    },
    execute: async (args) => {
      const callToken = args?.context?.callToken;
      const sessionPath = args?.context?.sessionPath;
      const format = normalizeFormat(args?.format);

      // 明确指定格式：直接导出（供键位 / 未来入口复用）。
      if (format) {
        try {
          const result = await exportSession(sdk, sessionPath, format);
          const kb = (result.bytes / 1024).toFixed(1);
          await notify(
            sdk,
            "Session Porter · 导出完成",
            `${result.format} · ${result.messageCount} 条消息\n${result.path}`,
          );
          return {
            content: [
              {
                type: "text",
                text: `已导出（${result.format}）：${result.messageCount} 条消息，${kb} KB\n${result.path}`,
              },
            ],
          };
        } catch (err) {
          const message = err?.message || String(err);
          await notify(sdk, "Session Porter · 导出失败", message);
          return { content: [{ type: "text", text: `导出失败：${message}` }], isError: true };
        }
      }

      if (!sessionPath) {
        return {
          content: [{ type: "text", text: "这条会话没有可用的会话文件路径，无法导出。" }],
          isError: true,
        };
      }

      // 右键菜单的情形：先试选择窗口，窗口没起来就导出全部三种格式兜底。
      let opened = null;
      try {
        opened = await openChooser(sdk, sessionPath, callToken);
      } catch (err) {
        await sdk.logger.info(
          `session-porter: open chooser failed -> ${err?.code || ""} ${err?.message || err}`,
        );
      }

      if (opened?.alive) {
        return { content: [{ type: "text", text: "已打开「导出会话」选择窗口。" }] };
      }

      try {
        const results = await exportAllFormats(sdk, sessionPath);
        const list = results.map((r) => `· ${r.format} → ${r.path}`).join("\n");
        await notify(
          sdk,
          "Session Porter · 已导出全部格式",
          `${results[0]?.messageCount ?? 0} 条消息\n${results.map((r) => r.path).join("\n")}`,
        );
        return {
          content: [{ type: "text", text: `选择窗口不可用，已导出全部三种格式：\n${list}` }],
        };
      } catch (err) {
        const message = err?.message || String(err);
        await notify(sdk, "Session Porter · 导出失败", message);
        return { content: [{ type: "text", text: `导出失败：${message}` }], isError: true };
      }
    },
  });
});
