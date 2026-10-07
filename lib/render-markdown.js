// Markdown 导出：人类可读的对话记录。
// 想改称呼，改这里的 LABELS 即可。
import { formatTime, fenceFor } from "./util.js";

const LABELS = {
  user: "用户",
  assistant: "助手",
  toolResult: "工具结果",
};

function heading(role) {
  return LABELS[role] || role;
}

function renderAssistant(msg) {
  const blocks = [];

  if (msg.thinking) {
    blocks.push(
      `<details>\n<summary>思考过程</summary>\n\n${msg.thinking}\n\n</details>`
    );
  }

  if (msg.text) blocks.push(msg.text);

  for (const call of msg.toolCalls || []) {
    const args = safeJson(call.arguments);
    const fence = fenceFor(args);
    blocks.push(
      `**工具调用 · \`${call.name || "unknown"}\`**\n\n${fence}json\n${args}\n${fence}`
    );
  }

  const model = msg.model ? `\n*模型：${msg.model}*` : "";
  return blocks.join("\n\n") + (model && blocks.length ? model : "");
}

function renderToolResult(msg) {
  const text = msg.text || "(无文本输出)";
  const fence = fenceFor(text);
  const flag = msg.isError ? " · 失败" : "";
  return (
    `### ${heading("toolResult")} · \`${msg.toolName || "unknown"}\`${flag}\n\n` +
    `<details>\n<summary>结果</summary>\n\n${fence}\n${text}\n${fence}\n\n</details>`
  );
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value);
  }
}

export function renderMarkdown({ meta, messages }) {
  const lines = [];
  lines.push(`# ${meta.title || "会话导出"}`);
  lines.push("");
  if (meta.sessionId) lines.push(`> 会话 ID：\`${meta.sessionId}\``);
  if (meta.agentId) lines.push(`> Agent：\`${meta.agentId}\``);
  if (meta.createdAt) lines.push(`> 创建时间：${formatTime(meta.createdAt)}`);
  lines.push(`> 导出时间：${formatTime(meta.exportedAt)}`);
  lines.push(`> 消息数：${messages.length}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const msg of messages) {
    if (msg.role === "user") {
      lines.push(`## ${heading("user")}`);
      lines.push("");
      lines.push(msg.text || "(空)");
      lines.push("");
      lines.push("---");
      lines.push("");
    } else if (msg.role === "assistant") {
      lines.push(`## ${heading("assistant")}`);
      lines.push("");
      const body = renderAssistant(msg);
      lines.push(body || "(空)");
      lines.push("");
      lines.push("---");
      lines.push("");
    } else if (msg.role === "toolResult") {
      lines.push(renderToolResult(msg));
      lines.push("");
      lines.push("---");
      lines.push("");
    } else {
      lines.push(`## ${heading(msg.role)}`);
      lines.push("");
      lines.push(msg.text || "(空)");
      lines.push("");
      lines.push("---");
      lines.push("");
    }
  }

  return lines.join("\n").replace(/\n{4,}/g, "\n\n\n");
}