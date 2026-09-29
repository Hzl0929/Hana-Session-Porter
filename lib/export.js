// 核心导出逻辑：斜杠命令与（未来可能的）其他入口共用。
import fs from "node:fs";
import path from "node:path";
import { readSession, extractConversation, getSessionHeader, tsToMillis } from "./reader.js";
import { resolveExportDir } from "./home.js";
import { renderJson } from "./render-json.js";
import { renderMarkdown } from "./render-markdown.js";
import { renderHtml } from "./render-html.js";
import { fileStamp, firstLine } from "./util.js";

const FORMATS = {
  json: { ext: "json", render: renderJson },
  markdown: { ext: "md", render: renderMarkdown },
  md: { ext: "md", render: renderMarkdown },
  html: { ext: "html", render: renderHtml },
  htm: { ext: "html", render: renderHtml },
};

export function normalizeFormat(input) {
  const v = String(input ?? "").trim().toLowerCase();
  if (!v) return null;
  return FORMATS[v] ? (v === "md" ? "markdown" : v === "htm" ? "html" : v) : null;
}

export const SUPPORTED_FORMATS = ["json", "markdown", "html"];

function safeSlug(s) {
  return String(s ?? "")
    .trim()
    .replace(/[\\/:*?"<>|\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 48)
    .trim();
}

function readTitleFromTitles(sessionPath, agentId, sessionId) {
  if (!sessionId) return null;
  try {
    const dir = path.dirname(sessionPath);
    const file = path.join(dir, "session-titles.json");
    if (!fs.existsSync(file)) return null;
    const map = JSON.parse(fs.readFileSync(file, "utf8"));
    const t = map?.[sessionId];
    return typeof t === "string" && t.trim() ? t.trim() : null;
  } catch {
    return null;
  }
}

function resolveTitle({ sessionPath, agentId, sessionId, messages }) {
  const fromTitles = readTitleFromTitles(sessionPath, agentId, sessionId);
  if (fromTitles) return fromTitles;
  const firstUser = messages.find((m) => m.role === "user" && m.text);
  if (firstUser) return firstLine(firstUser.text, 40);
  return "会话导出";
}

export function exportSession({
  sessionPath,
  agentId = null,
  sessionId = null,
  format = "json",
  mode = "clean",
  title = null,
}) {
  const fmt = normalizeFormat(format);
  if (!fmt) throw new Error(`不支持的格式：${format}（可选 ${SUPPORTED_FORMATS.join(" / ")}）`);
  if (!sessionPath || !fs.existsSync(sessionPath)) {
    throw new Error(`会话文件不存在：${sessionPath || "(未提供)"}`);
  }

  const { events, warnings } = readSession(sessionPath);
  const header = getSessionHeader(events);
  const messages = extractConversation(events);
  const createdAt =
    tsToMillis(header?.timestamp) ||
    messages.find((m) => m.timestamp)?.timestamp ||
    null;

  const meta = {
    title: title || resolveTitle({ sessionPath, agentId, sessionId, messages }),
    sessionId: sessionId || null,
    agentId: agentId || null,
    createdAt,
    exportedAt: Date.now(),
    messageCount: messages.length,
    format: fmt,
    mode: fmt === "json" ? mode : null,
  };

  const spec = FORMATS[fmt];
  const content = spec.render({ meta, messages, events, mode });

  const dir = resolveExportDir(sessionPath);
  if (!dir) throw new Error("无法定位导出目录（HANA_HOME 未识别）");
  fs.mkdirSync(dir, { recursive: true });

  const uuid = header?.id || path.basename(sessionPath).replace(/\.jsonl$/i, "");
  const slug = safeSlug(meta.title);
  const name = [slug || "session", fileStamp(Date.now()), uuid].join("_") + "." + spec.ext;
  const outPath = path.join(dir, name);
  fs.writeFileSync(outPath, content, "utf8");

  return {
    path: outPath,
    format: fmt,
    bytes: Buffer.byteLength(content, "utf8"),
    messageCount: messages.length,
    warnings,
  };
}