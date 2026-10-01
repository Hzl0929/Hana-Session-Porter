// Session Porter · v2 App 入口
//
// 只做一件事：在会话列表的会话条目右键菜单里，把当前会话导出成
// JSON / Markdown / HTML，落到 <HANA_HOME>/session-exports/。
//
// 与 v1 插件的差别：
//  - 入口不再是 commands/*.js 的 handler，而是 ctx.tools.register 注册的工具；
//  - 菜单项由 contributes.ui.contextMenus 声明，绑定到 hana/session.contextMenu；
//  - AppHost 里裸 fs 读不到盘外路径，会话内容经 ctx.resources 读回；
//  - 结果用系统通知回执（右键点击没有聊天回复通道）。
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
  } catch (err) {
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

async function exportSession(sdk, ctx, format) {
  const sessionPath = ctx?.context?.sessionPath;
  if (!sessionPath) throw new Error("这条会话没有可用的会话文件路径，无法导出。");

  const raw = await readLocalText(sdk, sessionPath);
  const { events } = parseJsonl(raw);
  const header = getSessionHeader(events);
  const messages = extractConversation(events);
  const sessionId = typeof header?.id === "string" ? header.id : null;
  const agentId = path.basename(path.dirname(path.dirname(sessionPath)));

  const createdAt =
    tsToMillis(header?.timestamp) || messages.find((m) => m.timestamp)?.timestamp || null;

  const title = resolveTitle({
    fromTitles: await readTitleFromTitles(sdk, sessionPath, sessionId),
    messages,
  });

  const meta = {
    title,
    sessionId,
    agentId,
    createdAt,
    exportedAt: Date.now(),
    messageCount: messages.length,
    format,
    mode: format === "json" ? "clean" : null,
  };

  const content = FORMATS[format].render({ meta, messages, events, mode: "clean" });

  const uuid = sessionId || path.basename(sessionPath).replace(/\.jsonl$/i, "");
  const slug = safeSlug(title);
  const fileName = [slug || "session", fileStamp(Date.now()), uuid].join("_") + "." + FORMATS[format].ext;
  const outPath = path.join(hanaHomeFrom(sdk.dataDir), "session-exports", fileName);

  const finalPath = await writeExport(sdk, outPath, content);
  return {
    path: finalPath,
    format,
    bytes: Buffer.byteLength(content, "utf8"),
    messageCount: messages.length,
  };
}

export default defineApp(async (sdk) => {
  await sdk.logger.info("session-porter loaded");

  await sdk.tools.register({
    name: "session_porter_export",
    description: "把当前会话导出为 JSON / Markdown / HTML，文件落到本地目录。",
    parameters: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["json", "markdown", "html"],
          description: "导出格式。",
        },
      },
      required: ["format"],
    },
    execute: async (args) => {
      const format = normalizeFormat(args?.format);
      if (!format) {
        return { content: [{ type: "text", text: `不支持的导出格式：${args?.format ?? "(空)"}` }] };
      }
      try {
        const result = await exportSession(sdk, args, format);
        const kb = (result.bytes / 1024).toFixed(1);
        const text = `已导出（${result.format}）：${result.messageCount} 条消息，${kb} KB\n${result.path}`;
        try {
          await sdk.notifications.show({
            title: "Session Porter · 导出完成",
            body: `${result.format} · ${result.messageCount} 条消息\n${result.path}`,
          });
        } catch {
          // 通知被拒不影响导出本身。
        }
        return { content: [{ type: "text", text }] };
      } catch (err) {
        const message = err?.message || String(err);
        try {
          await sdk.notifications.show({ title: "Session Porter · 导出失败", body: message });
        } catch {
          // ignore
        }
        return { content: [{ type: "text", text: `导出失败：${message}` }], isError: true };
      }
    },
  });
});