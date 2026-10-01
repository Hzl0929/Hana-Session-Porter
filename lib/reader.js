// 读取并解析 Hana 会话 JSONL，重建当前活动分支的对话消息。
//
// 会话是事件溯源的 JSONL：每行一个事件对象，通过 id / parentId 连成一棵树。
// 文件头是 { type: "session" }，其余常见类型：model_change、thinking_level_change、
// custom（如 hana-message-presentation、hana-session-branch-reset）、message。
// message.role 有 user / assistant / toolResult 三种。
//
// v2 App 版：不再自己读文件（AppHost 里裸 fs 读不到盘外路径），
// 改为接收宿主 ResourceIO 读回的文本。

export function parseJsonl(rawText) {
  const lines = String(rawText ?? "").split(/\r?\n/);
  const events = [];
  const warnings = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      events.push(JSON.parse(line));
    } catch (e) {
      warnings.push({ line: i + 1, message: e?.message || String(e) });
    }
  }
  return { events, warnings };
}

export function tsToMillis(ts) {
  if (typeof ts === "number" && Number.isFinite(ts)) return ts;
  if (typeof ts === "string") {
    const t = Date.parse(ts);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function buildIndex(events) {
  const byId = new Map();
  for (const e of events) {
    if (e && typeof e.id === "string") byId.set(e.id, e);
  }
  return byId;
}

// 从最后一个事件沿 parentId 回溯到根，得到当前活动分支（会正确绕过被回退的旧分支）。
function walkActiveChain(events, byId) {
  const tail = events.length ? events[events.length - 1] : null;
  if (!tail) return [];
  const chain = [];
  const seen = new Set();
  let cur = tail;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.push(cur);
    const pid = cur.parentId;
    if (pid == null) break;
    cur = byId.get(pid) || null;
  }
  chain.reverse();
  return chain;
}

function contentParts(message) {
  const content = Array.isArray(message?.content) ? message.content : [];
  return content;
}

function joinText(parts) {
  return parts
    .filter((c) => c && c.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("\n");
}

function normalizeOne(event, byId) {
  const m = event?.message;
  if (!m || typeof m !== "object") return null;
  const role = m.role;
  const parts = contentParts(m);
  const timestamp = tsToMillis(event.timestamp) ?? tsToMillis(m.timestamp);

  if (role === "user") {
    // 用户在界面上看到的原文可能存在相邻的 hana-message-presentation 事件里，
    // 比 message.content 更干净（不含 [SessionFile] 之类的注入前缀）。
    const parent = event.parentId ? byId.get(event.parentId) : null;
    let text = "";
    if (
      parent &&
      parent.type === "custom" &&
      parent.customType === "hana-message-presentation" &&
      parent.data &&
      typeof parent.data.displayText === "string"
    ) {
      text = parent.data.displayText;
    }
    if (!text) text = joinText(parts);
    return { role: "user", text, timestamp };
  }

  if (role === "assistant") {
    const text = joinText(parts);
    const thinking = parts
      .filter((c) => c && c.type === "thinking" && typeof c.thinking === "string")
      .map((c) => c.thinking)
      .join("\n\n");
    const toolCalls = parts
      .filter((c) => c && c.type === "toolCall")
      .map((c) => ({ id: c.id ?? null, name: c.name ?? null, arguments: c.arguments ?? null }));
    return {
      role: "assistant",
      text,
      thinking,
      toolCalls,
      model: m.model ?? null,
      provider: m.provider ?? null,
      timestamp,
    };
  }

  if (role === "toolResult") {
    return {
      role: "toolResult",
      toolName: m.toolName ?? null,
      toolCallId: m.toolCallId ?? null,
      text: joinText(parts),
      isError: m.isError === true,
      timestamp,
    };
  }

  return { role: role || "unknown", text: joinText(parts), timestamp };
}

export function extractConversation(events) {
  const byId = buildIndex(events);
  const chain = walkActiveChain(events, byId).filter((e) => e && e.type === "message");
  let messages = chain.map((e) => normalizeOne(e, byId)).filter(Boolean);
  if (messages.length === 0) {
    // 兜底：万一 parentId 链断裂，退化为按文件顺序取全部 message 事件。
    messages = events
      .filter((e) => e && e.type === "message")
      .map((e) => normalizeOne(e, byId))
      .filter(Boolean);
  }
  return messages;
}

export function getSessionHeader(events) {
  return events.find((e) => e && e.type === "session") || null;
}