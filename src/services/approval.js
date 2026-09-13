import readline from "node:readline";
import pc from "picocolors";
import { computeLineDiff, formatDiffPreview } from "../utils/diff.js";
import { getEnv } from "../utils/env.js";

/**
 * Checks whether approval is required for a given project and action.
 *
 * @param {object} project
 * @param {'WRITE'|'DELETE'|'EXEC'} actionType
 * @returns {boolean}
 */
export function isApprovalRequired(project, actionType) {
  // Explicit CLI flag override via env
  const envConfirm = getEnv("CONFIRM_CHANGES", "");
  if (envConfirm === "false" || envConfirm === "0") return false;
  if (envConfirm === "true" || envConfirm === "1") return true;

  const projectApproval = project?.approval;
  if (projectApproval === true || projectApproval === "always") return true;
  if (projectApproval === "destructive" && (actionType === "DELETE" || actionType === "EXEC")) {
    return true;
  }

  return false;
}

/**
 * Requests interactive user approval in the terminal for a proposed file change or deletion.
 *
 * @param {object} options
 * @param {'WRITE'|'DELETE'} options.type
 * @param {string} options.path - Relative file path
 * @param {string} [options.oldContent] - Existing content before modification
 * @param {string} [options.newContent] - Proposed new content
 * @param {number} [options.size] - File size in bytes for delete action
 * @param {number} [options.timeoutMs=90000] - Timeout in milliseconds before rejecting
 * @returns {Promise<{ approved: boolean, reason?: string }>}
 */
export async function requestApproval({
  type,
  path: relPath,
  oldContent = "",
  newContent = "",
  size = 0,
  timeoutMs = 90000,
}) {
  // If not a TTY terminal, we cannot prompt interactively
  if (!process.stdin.isTTY) {
    console.warn(
      pc.yellow(`[approval] Non-interactive environment detected. Auto-approving ${type} on ${relPath}`)
    );
    return { approved: true };
  }

  const isNewFile = oldContent === "" && newContent !== "";
  const diff = type === "WRITE" ? computeLineDiff(oldContent, newContent) : null;
  const preview = diff ? formatDiffPreview(diff, { maxLines: 20 }) : null;

  console.log("\n" + pc.bold(pc.bgYellow(pc.black(` ⚠️  AI CHANGE APPROVAL REQUIRED `))));
  console.log(
    `${pc.bold("Action :")} ${type === "WRITE" ? pc.yellow("WRITE FILE") : pc.red("DELETE FILE")}`
  );
  console.log(`${pc.bold("File   :")} ${pc.cyan(relPath)}`);

  if (type === "WRITE") {
    if (isNewFile) {
      console.log(`${pc.bold("Status :")} ${pc.green("New file creation")} (${diff?.additions || 0} lines)`);
    } else {
      console.log(`${pc.bold("Diff   :")} ${preview?.stats || ""}`);
    }

    console.log(pc.dim("─".repeat(60)));
    console.log(preview?.rendered || "");
    console.log(pc.dim("─".repeat(60)));
  } else if (type === "DELETE") {
    console.log(`${pc.bold("Size   :")} ${pc.red(`${size} bytes will be deleted permanently`)}`);
  }

  return new Promise((resolve) => {
    let answered = false;

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      try {
        process.stdin.setRawMode(true);
      } catch {}
    }
    process.stdin.resume();

    const cleanup = () => {
      answered = true;
      clearTimeout(timer);
      process.stdin.removeListener("keypress", onKeypress);
      if (process.stdin.isTTY) {
        try {
          process.stdin.setRawMode(false);
        } catch {}
      }
      process.stdin.pause();
    };

    const timer = setTimeout(() => {
      if (!answered) {
        cleanup();
        console.log(pc.red(`\n[approval] Timed out waiting for approval after ${timeoutMs / 1000}s. Change rejected.`));
        resolve({ approved: false, reason: "Request timed out waiting for user confirmation" });
      }
    }, timeoutMs);

    function printPrompt() {
      process.stdout.write(
        pc.bold(`\nApply these changes? [Press ${pc.green("y")}=Accept / ${pc.red("n")}=Reject / ${pc.cyan("d")}=Full diff]: `)
      );
    }

    function onKeypress(str, key) {
      if (answered) return;

      // Ctrl + C to exit
      if (key?.ctrl && key?.name === "c") {
        cleanup();
        process.stdout.write("\n");
        process.kill(process.pid, "SIGINT");
        return;
      }

      const input = (str || key?.name || "").toLowerCase();

      if (input === "d" && type === "WRITE") {
        process.stdout.write(pc.cyan("d\n"));
        const fullDiff = formatDiffPreview(diff, { maxLines: 500 });
        console.log(pc.dim("\n─── FULL DIFF PREVIEW ───"));
        console.log(fullDiff.rendered);
        console.log(pc.dim("─────────────────────────"));
        printPrompt();
        return;
      }

      if (input === "y" || input === "return" || input === "enter") {
        cleanup();
        process.stdout.write(pc.green("y\n"));
        console.log(pc.green(`✔ Change accepted for ${relPath}\n`));
        resolve({ approved: true });
        return;
      }

      if (input === "n" || input === "escape") {
        cleanup();
        process.stdout.write(pc.red("n\n"));
        console.log(pc.red(`✖ Change rejected for ${relPath}\n`));
        resolve({
          approved: false,
          reason: "User explicitly rejected this modification in the terminal review prompt",
        });
        return;
      }
    }

    process.stdin.on("keypress", onKeypress);
    printPrompt();
  });
}
