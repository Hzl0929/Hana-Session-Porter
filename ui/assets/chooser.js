// Session Porter · 导出选择窗口
// 与 App 后台经 hana.window.request 通话；后台负责真正的读会话 / 渲染 / 落盘。
import { hana } from "./sdk.js";

const statusEl = document.getElementById("status");
const subtitleEl = document.getElementById("subtitle");
const closeEl = document.getElementById("close");
const buttons = Array.from(document.querySelectorAll("[data-format]"));

let closing = false;

// 关窗必须永远可用：这是用户不导出时的唯一出路。
// 先走宿主窗口 API，失败再退到浏览器原生 window.close()。
async function closeWindow() {
  if (closing) return;
  closing = true;
  try {
    await hana.window.close();
  } catch {
    try {
      window.close();
    } catch {
      closing = false;
    }
  }
}

closeEl.addEventListener("click", () => {
  closeWindow();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeWindow();
  }
});

function setBusy(busy) {
  for (const btn of buttons) btn.disabled = busy;
}

function showStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.dataset.kind = kind ?? "";
}

try {
  await hana.ready();

  // 握手回执：页面一旦跑起来就先告诉后台一声。后台据此判断窗口是否真的被宿主创建；
  // 迟迟收不到就把这次右键退化成“导出全部格式”，不让入口点完没反应。
  hana.window.request({ type: "info" }).catch(() => {});

  const context = await hana.window.getContext();
  const data = context && typeof context.data === "object" && context.data ? context.data : {};
  if (typeof data.title === "string" && data.title.trim()) {
    subtitleEl.textContent = data.title.trim();
  }

  for (const btn of buttons) {
    btn.addEventListener("click", async () => {
      const format = btn.dataset.format;
      setBusy(true);
      showStatus(`正在导出 ${format}…`, "busy");
      try {
        const result = await hana.window.request({ type: "export", format });
        if (result && result.ok) {
          showStatus(`已导出 ${result.format}：${result.messageCount} 条消息\n${result.path}`, "ok");
          window.setTimeout(() => {
            closeWindow();
          }, 1100);
        } else {
          showStatus(`导出失败：${(result && result.error) || "未知错误"}`, "error");
          setBusy(false);
        }
      } catch (error) {
        showStatus(`导出失败：${(error && error.message) || error}`, "error");
        setBusy(false);
      }
    });
  }
} catch (error) {
  showStatus(`窗口初始化失败：${(error && error.message) || error}`, "error");
  setBusy(true);
}
