// JSON 导出。
//  clean：清洗后的消息列表（可读、结构稳定，便于二次处理）。
//  raw   ：原始事件数组（不丢任何字段）。
export function renderJson({ meta, messages, events, mode }) {
  if (mode === "raw") {
    return JSON.stringify({ meta, events }, null, 2);
  }
  return JSON.stringify({ meta, messages }, null, 2);
}