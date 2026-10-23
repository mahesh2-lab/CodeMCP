import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import pc from "picocolors";

const GLOBAL_CODEMCP_DIR = path.join(os.homedir(), ".codemcp");

/**
 * Resolves the path to the daemon.json state file for a project.
 *
 * @param {string} projectRoot
 * @returns {string}
 */
export function getDaemonStatePath(projectRoot) {
  const localDir = path.join(projectRoot, ".codemcp");
  if (!fs.existsSync(localDir)) {
    try {
      fs.mkdirSync(localDir, { recursive: true });
    } catch {}
  }
  if (fs.existsSync(localDir)) {
    return path.join(localDir, "daemon.json");
  }
  return path.join(GLOBAL_CODEMCP_DIR, `daemon-${Buffer.from(projectRoot).toString("base64url").slice(0, 16)}.json`);
}

/**
 * Resolves the path to the background daemon log file.
 *
 * @param {string} projectRoot
 * @returns {string}
 */
export function getDaemonLogPath(projectRoot) {
  const localDir = path.join(projectRoot, ".codemcp");
  if (!fs.existsSync(localDir)) {
    try {
      fs.mkdirSync(localDir, { recursive: true });
    } catch {}
  }
  if (fs.existsSync(localDir)) {
    return path.join(localDir, "codemcp.log");
  }
  return path.join(GLOBAL_CODEMCP_DIR, "daemon.log");
}

/**
 * Checks whether a given process ID is actively running.
 *
 * @param {number} pid
 * @returns {boolean}
 */
export function isProcessRunning(pid) {
  if (!pid || typeof pid !== "number") return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM"; // Process exists but lack permissions
  }
}

/**
 * Saves running daemon state.
 *
 * @param {string} projectRoot
 * @param {object} state
 */
export function saveDaemonState(projectRoot, state) {
  const filePath = getDaemonStatePath(projectRoot);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
}

/**
 * Reads existing daemon state if present.
 *
 * @param {string} projectRoot
 * @returns {object|null}
 */
export function readDaemonState(projectRoot) {
  const filePath = getDaemonStatePath(projectRoot);
  if (!fs.existsSync(filePath)) {return null;}
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Removes the daemon state file.
 *
 * @param {string} projectRoot
 */
export function removeDaemonState(projectRoot) {
  const filePath = getDaemonStatePath(projectRoot);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
}

/**
 * Stops a running daemon instance for the specified project.
 *
 * @param {string} projectRoot
 * @returns {{ ok: boolean, message: string }}
 */
export function stopDaemon(projectRoot) {
  const state = readDaemonState(projectRoot);
  if (!state || !state.pid) {
    return {
      ok: false,
      message: `No active background CodeMCP server found for ${projectRoot}`,
    };
  }

  const pid = state.pid;
  if (!isProcessRunning(pid)) {
    removeDaemonState(projectRoot);
    return {
      ok: false,
      message: `Daemon process (PID ${pid}) is no longer running. Cleaned up stale state.`,
    };
  }

  try {
    process.kill(pid, "SIGTERM");
    removeDaemonState(projectRoot);
    return {
      ok: true,
      message: `Successfully stopped background CodeMCP server (PID: ${pid}).`,
    };
  } catch (err) {
    return {
      ok: false,
      message: `Failed to stop daemon (PID ${pid}): ${err.message}`,
    };
  }
}

/**
 * Tails the daemon log file.
 *
 * @param {string} projectRoot
 * @param {number} [lines=50]
 * @returns {string}
 */
export function getDaemonLogs(projectRoot, lines = 50) {
  const logPath = getDaemonLogPath(projectRoot);
  if (!fs.existsSync(logPath)) {
    return `No log file found at ${logPath}`;
  }

  try {
    const content = fs.readFileSync(logPath, "utf8");
    const allLines = content.split(/\r?\n/);
    return allLines.slice(-lines).join("\n");
  } catch (err) {
    return `Error reading log file: ${err.message}`;
  }
}
