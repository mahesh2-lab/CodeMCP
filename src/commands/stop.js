import path from "node:path";
import pc from "picocolors";
import { stopDaemon } from "../utils/daemon.js";

/**
 * Handles the 'codemcp stop' CLI command.
 *
 * @param {string} [targetPath]
 */
export function stopCommand(targetPath) {
  const targetDir = path.resolve(
    process.cwd(),
    targetPath || process.env.PROJECT_ROOT || ".",
  );
  const result = stopDaemon(targetDir);
  if (result.ok) {
    console.log(pc.green(`✔ ${result.message}`));
  } else {
    console.log(pc.yellow(`⚠ ${result.message}`));
  }
}
