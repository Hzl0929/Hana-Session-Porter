// 常用的时间格式化：给人类看，尽量稳定，不依赖本地化语言包。
export function formatTime(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return "";
  const d = new Date(n);
  const p = (v) => String(v).padStart(2, "0");
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const oh = p(Math.floor(Math.abs(offsetMin) / 60));
  const om = p(Math.abs(offsetMin) % 60);
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} UTC${sign}${oh}:${om}`
  );
}

// 生成一个可安全用于文件名的短时间戳（本地时间）。
export function fileStamp(ms) {
  const d = new Date(Number.isFinite(Number(ms)) ? Number(ms) : Date.now());
  const p = (v) => String(v).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

// 取内容里最长的反引号串，围栏要比它长，避免被内容里的 ``` 提前截断。
export function fenceFor(text) {
  const matches = String(text ?? "").match(/`+/g);
  const longest = matches ? Math.max(...matches.map((s) => s.length)) : 0;
  return "`".repeat(Math.max(3, longest + 1));
}

export function firstLine(text, max = 60) {
  const s = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}