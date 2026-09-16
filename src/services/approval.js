import readline from "node:readline";
import pc from "picocolors";
import { computeLineDiff, formatDiffBoxLines, formatFullDiff } from "../utils/diff.js";
import { printApprovalBox } from "../utils/box.js";
import { getEnv } from "../utils/env.js";
import { notify } from "../utils/notify.js";
import { logger, formatBytes } from "../utils/logger.js";

/**
 * Checks whether approval is required for a given project and action.
 *
 * @param {object} project
 * @param {'WRITE'|'DELETE'|'EXEC'} actionType
 * @returns {boolean}
 */
export function isApprovalRequired(project, actionType) {
  // Explicit CLI flag override via env
  const envApproval =
    getEnv("APPROVAL_MODE", "") || getEnv("CONFIRM_CHANGES", "");
  if (envApproval === "false" || envApproval === "0" || envApproval === "never")
    return false;
  if (envApproval === "true" || envApproval === "1" || envApproval === "always")
    return true;
  if (envApproval === "destructive") {
    return actionType === "DELETE" || actionType === "EXEC";
  }

  const projectApproval = project?.approval;
  if (projectApproval === true || projectApproval === "always") return true;
  if (
    projectApproval === "destructive" &&
    (actionType === "DELETE" || actionType === "EXEC")
  ) {
    return true;
  }

  return false;
}

let pendingApproval = Promise.resolve();

/**
 * Requests interactive user approval in the terminal for a proposed file change, deletion, or command execution.
 * Sequentially queues multiple concurrent approval requests so terminal prompts and stdin do not conflict.
 *
 * @param {object} options
 * @returns {Promise<{ approved: boolean, reason?: string }>}
 */
export function requestApproval(options) {
  const run = () => promptApproval(options);
  const next = pendingApproval.then(run, run);
  pendingApproval = next.catch(() => {});
  return next;
}

async function promptApproval({
  type,
  path: relPath = "",
  command = "",
  cwd = "",
  oldContent = "",
  newContent = "",
  size = 0,
  newSize = 0,
  project = null,
  timeoutMs = parseInt(process.env.APPROVAL_TIMEOUT_MS, 10) || 15 * 60 * 1000,
}) {
  const displayTarget = type === "EXEC" ? command || relPath : relPath;

  // If not a TTY terminal, check non-interactive policy
  if (!process.stdin.isTTY) {
    const nonInteractivePolicy = (getEnv("APPROVAL_NON_INTERACTIVE", "reject") || "").toLowerCase();
    if (nonInteractivePolicy === "reject" || nonInteractivePolicy === "deny" || nonInteractivePolicy === "false") {
      return {
        approved: false,
        reason: "Action rejected: running in non-interactive environment with strict approval policy enabled.",
      };
    }
    console.warn(
      pc.yellow(
        `[approval] Non-interactive environment detected. Auto-approving ${type} on ${displayTarget}`,
      ),
    );
    return { approved: true };
  }

  const isNewFile = oldContent === "" && newContent !== "";
  const diff = type === "WRITE" ? computeLineDiff(oldContent, newContent) : null;
  const expectedBytes = newSize || (newContent ? Buffer.byteLength(newContent, "utf8") : 0);

  const title = pc.yellow("⚠") + " " + pc.bold(pc.white("AI CHANGE APPROVAL REQUIRED"));
  const rows = [
    pc.bold(pc.white(type === "EXEC" ? "EXECUTE COMMAND" : `${type} FILE`)),
    pc.bold(pc.white(displayTarget)),
  ];

  if (type === "WRITE") {
    if (isNewFile) {
      rows.push(
        pc.dim("New file") +
          " " +
          pc.dim("·") +
          " " +
          pc.green(`+${diff?.additions || 0}`) +
          " " +
          pc.dim("lines"),
      );
    } else {
      rows.push(
        pc.dim("Modified") +
          " " +
          pc.dim("·") +
          " " +
          pc.green(`+${diff?.additions || 0}`) +
          " " +
          pc.red(`-${diff?.deletions || 0}`) +
          " " +
          pc.dim("lines"),
      );
    }
    rows.push("");
    const diffBox = formatDiffBoxLines(diff, { maxLines: 15, maxLineWidth: 64, contextRadius: 2 });
    rows.push(...diffBox.rows);
  } else if (type === "DELETE") {
    rows.push(
      pc.dim("Delete") +
        " " +
        pc.dim("·") +
        " " +
        pc.red(`-${formatBytes(size)}`),
    );
    rows.push("");
    rows.push(pc.yellow(" ⚠ This file will be permanently deleted from the workspace."));
    rows.push(pc.dim(`   Size: ${formatBytes(size)}`));
  } else if (type === "EXEC") {
    if (cwd) {
      rows.push(pc.dim(`Directory: ${cwd}`));
    }
    rows.push("");
    rows.push(pc.yellow(" ⚠ This process will execute directly in your project workspace."));
  }

  printApprovalBox(title, rows, 69);

  const clientName = logger.getActiveClient() || "Claude-User";
  const permText =
    project?.permission === "both"
      ? "Read & Write"
      : project?.permission === "write"
        ? "Write-only"
        : "Read-only";
  const approvalText = "Approval ON";
  const reqCount = logger.getRequestCount();

  function printStatusBar() {
    console.log("");
    console.log(
      `${pc.green("•")} ${pc.white(clientName)} ${pc.dim("·")} ${pc.white(permText)} ${pc.dim("·")} ${pc.yellow(approvalText)} ${pc.dim("·")} ${pc.white("Requests " + reqCount)}`,
    );
    console.log(pc.dim("─".repeat(52)));
  }

  function printPrompt() {
    if (type === "WRITE") {
      process.stdout.write(
        pc.bold(pc.cyan("Apply changes? ")) +
          `[${pc.green("y")}] Accept  [${pc.red("n")}] Reject  [${pc.cyan("d")}] Full diff  [${pc.cyan("q")}] Quit: `,
      );
    } else {
      process.stdout.write(
        pc.bold(pc.cyan("Execute action? ")) +
          `[${pc.green("y")}] Accept  [${pc.red("n")}] Reject  [${pc.cyan("q")}] Quit: `,
      );
    }
  }

  notify({
    title: "Approval Required",
    message: `${type === "EXEC" ? "Command" : type === "WRITE" ? "Write" : "Delete"} request for ${displayTarget} needs confirmation in terminal`,
  });

  return new Promise((resolve) => {
    let answered = false;
    let timer = null;

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      try {
        process.stdin.setRawMode(true);
      } catch {}
    }
    process.stdin.resume();

    const cleanup = () => {
      answered = true;
      if (timer) clearTimeout(timer);
      process.stdin.removeListener("keypress", onKeypress);
      if (process.stdin.isTTY) {
        try {
          process.stdin.setRawMode(false);
        } catch {}
      }
      process.stdin.pause();
    };

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        if (!answered) {
          cleanup();
          const durationText =
            timeoutMs >= 60000
              ? `${Math.round(timeoutMs / 60000)} minutes`
              : `${Math.round(timeoutMs / 1000)}s`;
          console.log(
            pc.red(
              `\n[approval] Timed out waiting for approval after ${durationText}. Change rejected.`,
            ),
          );
          notify({
            title: "Approval Timed Out",
            message: `Request for ${relPath} timed out and was rejected`,
          });
          resolve({
            approved: false,
            reason: "Request timed out waiting for user confirmation",
          });
        }
      }, timeoutMs);
    }

    function onKeypress(str, key) {
      if (answered) return;

      // Ctrl + C to exit gracefully
      const isCtrlC =
        (key?.ctrl && key?.name === "c") ||
        str === "\u0003" ||
        str === "\x03" ||
        key?.sequence === "\u0003";

      if (isCtrlC) {
        cleanup();
        process.stdout.write("\n");
        process.emit("SIGINT");
        return;
      }

      // Ctrl + D to cancel prompt (EOF)
      const isCtrlD =
        (key?.ctrl && key?.name === "d") ||
        str === "\u0004" ||
        key?.sequence === "\u0004";

      if (isCtrlD) {
        cleanup();
        process.stdout.write("\n");
        resolve({
          approved: false,
          reason: "User cancelled review prompt (EOF)",
        });
        return;
      }

      const input = (str || key?.name || "").toLowerCase();

      if (input === "d" && type === "WRITE") {
        process.stdout.write(pc.cyan("d\n"));
        console.log(pc.dim("\n─── FULL DIFF PREVIEW ───"));
        console.log(formatFullDiff(diff));
        console.log(pc.dim("─────────────────────────\n"));
        printStatusBar();
        printPrompt();
        return;
      }

      if (input === "y" || input === "return" || input === "enter") {
        cleanup();
        process.stdout.write(pc.green("y\n\n"));
        console.log(pc.green("✓ Change accepted"));
        const writtenLabel = type === "WRITE" ? `${formatBytes(expectedBytes)} written` : "deleted";
        console.log(`  ${pc.white(relPath)} ${pc.dim("·")} ${pc.yellow(writtenLabel)}\n`);
        resolve({ approved: true });
        return;
      }

      if (input === "n" || input === "escape") {
        cleanup();
        process.stdout.write(pc.red("n\n\n"));
        console.log(pc.red("✖ Change rejected"));
        console.log(`  ${pc.white(relPath)} ${pc.dim("·")} ${pc.dim("changes discarded")}\n`);
        resolve({
          approved: false,
          reason:
            "User explicitly rejected this modification in the terminal review prompt",
        });
        return;
      }

      if (input === "q") {
        cleanup();
        process.stdout.write(pc.cyan("q\n\n"));
        console.log(pc.red("✖ Change rejected"));
        console.log(`  ${pc.white(relPath)} ${pc.dim("·")} ${pc.dim("cancelled")}\n`);
        resolve({
          approved: false,
          reason: "User cancelled review prompt",
        });
        return;
      }
    }

    printStatusBar();
    printPrompt();
    process.stdin.on("keypress", onKeypress);
  });
}

/**
 * Verifies interactive user approval for WRITE, DELETE, or EXEC actions, logging rejections
 * and formatting error tool responses if rejected.
 *
 * @param {object} options
 * @param {object} options.project - Scoped project configuration
 * @param {'WRITE'|'DELETE'|'EXEC'} options.actionType - Action type being performed
 * @param {string} [options.path] - Project-relative file path
 * @param {string} [options.command] - Shell command for EXEC
 * @param {string} [options.cwd] - Working directory for EXEC
 * @param {string} [options.oldContent=""] - Prior file content (for diff)
 * @param {string} [options.newContent=""] - New file content (for diff)
 * @param {number} [options.size=0] - File size in bytes for deletion
 * @param {object} [options.logger] - Logger instance for recording rejection
 * @returns {Promise<{ approved: boolean, rejectionResponse?: object }>}
 */
export async function verifyActionApproval({
  project,
  actionType,
  path: relPath = "",
  command = "",
  cwd = "",
  oldContent = "",
  newContent = "",
  size = 0,
  logger: customLogger,
}) {
  if (!isApprovalRequired(project, actionType)) {
    return { approved: true };
  }

  const newSize = newContent ? Buffer.byteLength(newContent, "utf8") : 0;
  const activeLogger = customLogger || logger;

  const approval = await requestApproval({
    type: actionType,
    path: relPath,
    command,
    cwd,
    oldContent,
    newContent,
    size,
    newSize,
    project,
  });

  if (!approval.approved) {
    const defaultReason =
      actionType === "WRITE"
        ? "User rejected this file modification."
        : actionType === "EXEC"
          ? "User rejected this command execution."
          : "User rejected this deletion.";
    const reason = approval.reason || defaultReason;
    const targetLabel = actionType === "EXEC" ? command || relPath : relPath;
    if (activeLogger?.rejected) {
      activeLogger.rejected(actionType, targetLabel, reason);
    }
    const label =
      actionType === "WRITE"
        ? "Changes"
        : actionType === "EXEC"
          ? "Command execution"
          : "File deletion";
    return {
      approved: false,
      rejectionResponse: {
        isError: true,
        content: [
          {
            type: "text",
            text: `${label} rejected by user: ${reason}`,
          },
        ],
      },
    };
  }

  return { approved: true };
}


export default {
  isApprovalRequired,
  requestApproval,
  verifyActionApproval,
};
