// 定位 HANA_HOME 与导出目录。
// 会话文件固定在 <HANA_HOME>/agents/<agentId>/sessions/<file>.jsonl，
// 因此可以从当前会话路径反推出 HANA_HOME，无需依赖任何插件 ctx。
import path from "node:path";

export function locateFromSessionPath(sessionPath) {
  if (!sessionPath || typeof sessionPath !== "string") return null;
  const sessionsDir = path.dirname(sessionPath);
  const agentDir = path.dirname(sessionsDir);
  const agentsDir = path.dirname(agentDir);
  const home = path.dirname(agentsDir);
  if (path.basename(sessionsDir) !== "sessions") return null;
  return {
    home,
    agentsDir,
    agentDir,
    agentId: path.basename(agentDir),
  };
}

export function resolveExportDir(sessionPath) {
  const envHome =
    typeof process.env.HANA_HOME === "string" && process.env.HANA_HOME.trim()
      ? process.env.HANA_HOME.trim()
      : null;
  const home = envHome || locateFromSessionPath(sessionPath)?.home || null;
  if (!home) return null;
  return path.join(home, "session-exports");
}