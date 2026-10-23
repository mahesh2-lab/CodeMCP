import path from "node:path";
import { getDaemonLogs } from "../utils/daemon.js";

/**
 * Handles the 'codemcp logs' CLI command.
 *
 * @param {string} [targetPath]
 * @param {object} [options={}]
 * @param {string|number} [options.lines=50]
 */
export function logsCommand(targetPath, options = {}) {
  const targetDir = path.resolve(
    process.cwd(),
    targetPath || process.env.PROJECT_ROOT || ".",
  );
  const lines = parseInt(options.lines, 10) || 50;
  const logs = getDaemonLogs(targetDir, lines);
  console.log(logs);
}
