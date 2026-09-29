// 斜杠命令：/export-session <json|markdown|html>
//
// 用户手敲的斜杠命令走 handler 形式，需要插件为 full-access。
// handler 拿到的上下文里没有插件的 ctx（因此没有 stageFile），
// 但有 sessionRef（含当前会话的绝对路径），导出逻辑直接读写文件系统即可。
import { exportSession, normalizeFormat, SUPPORTED_FORMATS } from "../lib/export.js";

export const name = "export-session";
export const description = "导出当前会话为 JSON / Markdown / HTML";
export const scope = "session";
export const permission = "owner";
export const usage = "/export-session <json|markdown|html>";

export async function handler(ctx) {
  const format = normalizeFormat(ctx?.args);
  const sessionPath = ctx?.sessionRef?.sessionPath;

  if (!format) {
    return {
      reply: [
        `用法：${usage}`,
        `可选格式：${SUPPORTED_FORMATS.join(" / ")}`,
        "例：/export-session markdown",
      ].join("\n"),
    };
  }

  if (!sessionPath) {
    return { reply: "无法定位当前会话文件所在路径，导出失败。" };
  }

  try {
    const result = exportSession({
      sessionPath,
      agentId: ctx?.sessionRef?.agentId ?? null,
      sessionId: ctx?.sessionRef?.sessionId ?? null,
      format,
    });
    const kb = (result.bytes / 1024).toFixed(1);
    return {
      reply: [
        `已导出（${result.format}）：${result.messageCount} 条消息，${kb} KB`,
        result.path,
      ].join("\n"),
    };
  } catch (err) {
    return { reply: `导出失败：${err?.message || String(err)}` };
  }
}