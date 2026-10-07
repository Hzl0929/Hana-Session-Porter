// HTML 导出：单文件、自包含、断网可开、印刷友好。
// 不引入任何外部 CDN；文本一律转义；代码围栏单独渲染。
import { formatTime } from "./util.js";

const ESCAPE = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ESCAPE[c]);
}

function escAttr(s) {
  return esc(s);
}

// 把纯文本按 ``` 围栏切成 文本 / 代码块，分别渲染。
function renderRichText(text) {
  const src = String(text ?? "");
  const out = [];
  const re = /```([^\n`]*)\n([\s\S]*?)```/g;
  let last = 0;
  let m;
  while ((m = re.exec(src)) !== null) {
    const before = src.slice(last, m.index);
    if (before.trim()) out.push(`<div class="text">${esc(before)}</div>`);
    const lang = (m[1] || "").trim();
    const cls = lang ? ` class="language-${escAttr(lang)}"` : "";
    out.push(`<pre class="code"><code${cls}>${esc(m[2])}</code></pre>`);
    last = m.index + m[0].length;
  }
  const tail = src.slice(last);
  if (tail.trim()) out.push(`<div class="text">${esc(tail)}</div>`);
  if (out.length === 0) out.push(`<div class="text">(空)</div>`);
  return out.join("\n");
}

function renderAssistant(msg) {
  const parts = [];
  if (msg.thinking) {
    parts.push(
      `<details class="thinking"><summary>思考过程</summary><div class="text">${esc(
        msg.thinking
      )}</div></details>`
    );
  }
  if (msg.text) parts.push(renderRichText(msg.text));
  for (const call of msg.toolCalls || []) {
    let args = "";
    try {
      args = JSON.stringify(call.arguments ?? null, null, 2);
    } catch {
      args = String(call.arguments);
    }
    parts.push(
      `<div class="toolcall"><div class="toolcall-head">工具调用 · <code>${esc(
        call.name || "unknown"
      )}</code></div><pre class="code"><code>${esc(args)}</code></pre></div>`
    );
  }
  const model = msg.model ? `<div class="meta">模型：${esc(msg.model)}</div>` : "";
  return parts.join("\n") + model;
}

function renderMessage(msg) {
  if (msg.role === "toolResult") {
    const flag = msg.isError ? `<span class="err">失败</span>` : "";
    return (
      `<details class="msg toolresult"><summary>工具结果 · <code>${esc(
        msg.toolName || "unknown"
      )}</code> ${flag}</summary>` +
      `<pre class="code"><code>${esc(msg.text || "(无文本输出)")}</code></pre></details>`
    );
  }
  const role = msg.role;
  const who = role === "user" ? "用户" : role === "assistant" ? "助手" : role;
  const time = msg.timestamp ? `<time>${esc(formatTime(msg.timestamp))}</time>` : "";
  let body;
  if (role === "assistant") body = renderAssistant(msg);
  else body = renderRichText(msg.text);
  return (
    `<section class="msg ${esc(role)}">` +
    `<header><span class="who">${esc(who)}</span>${time}</header>` +
    `<div class="body">${body}</div>` +
    `</section>`
  );
}

export function renderHtml({ meta, messages }) {
  const title = meta.title || "会话导出";
  const metaRows = [
    meta.sessionId ? `会话 ID：<code>${esc(meta.sessionId)}</code>` : "",
    meta.agentId ? `Agent：<code>${esc(meta.agentId)}</code>` : "",
    meta.createdAt ? `创建时间：${esc(formatTime(meta.createdAt))}` : "",
    `导出时间：${esc(formatTime(meta.exportedAt))}`,
    `消息数：${messages.length}`,
  ]
    .filter(Boolean)
    .join("　·　");

  const body = messages.map(renderMessage).join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>
  :root {
    --bg: #f6f5f2; --card: #ffffff; --text: #26241f; --muted: #8a857c;
    --line: #e6e2da; --user: #2f6b5f; --assistant: #6a5aa8; --code-bg: #f1efe9;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1c1b19; --card: #252320; --text: #e9e6df; --muted: #9c968b;
      --line: #38352f; --user: #7fc7b4; --assistant: #b6a7f0; --code-bg: #1a1916;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font-family: -apple-system, "Noto Serif SC", "Songti SC", "Microsoft YaHei", serif;
    line-height: 1.75; font-size: 16px;
  }
  .wrap { max-width: 860px; margin: 0 auto; padding: 40px 20px 80px; }
  h1 { font-size: 1.6rem; margin: 0 0 8px; }
  .docmeta { color: var(--muted); font-size: .82rem; margin-bottom: 28px; }
  .docmeta code { font-size: .78rem; }
  .msg {
    background: var(--card); border: 1px solid var(--line); border-radius: 14px;
    padding: 16px 18px; margin: 0 0 16px;
  }
  .msg header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 8px; }
  .msg .who { font-weight: 700; }
  .msg.user .who { color: var(--user); }
  .msg.assistant .who { color: var(--assistant); }
  .msg time { color: var(--muted); font-size: .74rem; }
  .msg.toolresult { background: transparent; border-style: dashed; padding: 10px 14px; }
  .msg.toolresult summary { cursor: pointer; color: var(--muted); font-size: .85rem; }
  .text { white-space: pre-wrap; word-break: break-word; }
  .code {
    background: var(--code-bg); border: 1px solid var(--line); border-radius: 10px;
    padding: 12px 14px; overflow-x: auto; margin: 10px 0;
  }
  .code code {
    font-family: "JetBrains Mono", ui-monospace, "Cascadia Code", Consolas, monospace;
    font-size: .84rem; white-space: pre;
  }
  .toolcall { margin: 12px 0; }
  .toolcall-head { font-size: .82rem; color: var(--muted); margin-bottom: 4px; }
  details.thinking { margin: 0 0 12px; }
  details.thinking > summary { cursor: pointer; color: var(--muted); font-size: .85rem; }
  details.thinking .text { color: var(--muted); font-size: .9rem; margin-top: 8px; }
  .meta { color: var(--muted); font-size: .74rem; margin-top: 8px; }
  .err { color: #b56b66; }
  @media print {
    :root { --bg: #fff; --card: #fff; }
    body { font-size: 12px; }
    .wrap { max-width: none; padding: 0; }
    .msg { break-inside: avoid; box-shadow: none; }
    details { open: true; }
  }
</style>
</head>
<body>
<div class="wrap">
<h1>${esc(title)}</h1>
<div class="docmeta">${metaRows}</div>
${body}
</div>
</body>
</html>`;
}