import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import pc from "picocolors";
import { initProject } from "./init.js";
import { startServer, handleShutdown } from "../server.js";
import {
  getDaemonLogPath,
  saveDaemonState,
  readDaemonState,
  isProcessRunning,
} from "../utils/daemon.js";

/**
 * Attaches a raw TTY listener to standard input allowing users to press 'q' or Ctrl+C to terminate cleanly.
 */
export function enableQuitKey() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    return;
  }

  const onData = (data) => {
    const key = data.toString();
    if (key.toLowerCase() !== "q" && key !== "\u0003") return;

    process.stdin.setRawMode(false);
    process.stdin.pause();
    void handleShutdown(key === "\u0003" ? "SIGINT" : "Q");
  };

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", onData);
  process.once("exit", () => {
    process.stdin.off("data", onData);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
  });
}

/**
 * Launches the MCP server either in the foreground or as a detached daemon process.
 *
 * @param {string} [targetPath] - Target project directory path
 * @param {object} [options={}] - CLI flags and options
 */
export async function startCommand(targetPath, options = {}) {
  if (options.tunnel === false) {
    process.env.NGROK_ENABLED = "false";
  }
  if (options.notify === false) {
    process.env.NOTIFY = "false";
  }
  if (options.port) {
    process.env.PORT = String(options.port);
  }

  const approvalFlag = options.approval ?? options.ask ?? options.confirm;
  if (approvalFlag !== undefined) {
    const mode = String(approvalFlag).toLowerCase();
    process.env.APPROVAL_MODE = mode === "on" ? "true" : mode === "off" ? "false" : mode;
  }

  const rawTarget = targetPath ?? process.env.PROJECT_ROOT ?? ".";
  const targetDir = path.resolve(process.cwd(), rawTarget);
  if (!fs.existsSync(targetDir)) {
    console.error(pc.red(`Error: Directory not found: ${targetDir}`));
    process.exit(1);
  }

  process.env.PROJECT_ROOT = targetDir;

  const configPath = path.join(targetDir, "codemcp.json");
  if (!fs.existsSync(configPath)) {
    console.log(
      pc.yellow(
        `No codemcp.json found in ${targetDir}. Initializing project...\n`,
      ),
    );
    await initProject(targetDir, options);
    if (!fs.existsSync(configPath)) {
      process.exit(0);
    }
    console.log();
  }

  // Detached mode: move process into background and return immediately (like `docker run -d`)
  if (options.detach && process.env.CODEMCP_DAEMON !== "true") {
    const existing = readDaemonState(targetDir);
    if (existing && existing.pid && isProcessRunning(existing.pid)) {
      console.log(
        pc.yellow(
          `CodeMCP is already running in background for this project (PID: ${existing.pid}).`,
        ),
      );
      console.log(pc.dim(`  Port: ${existing.port || "4173"}`));
      console.log(pc.dim(`  Logs: ${getDaemonLogPath(targetDir)}`));
      console.log(pc.dim(`  Stop: codemcp stop "${targetDir}"\n`));
      process.exit(0);
    }

    const logPath = getDaemonLogPath(targetDir);
    const logFd = fs.openSync(logPath, "a");

    const childArgs = process.argv
      .slice(2)
      .filter((arg) => arg !== "-d" && arg !== "--detach");
    if (childArgs[0] !== "start") {
      childArgs.unshift("start");
    }

    const childScript = path.resolve(process.argv[1]);
    const child = spawn(process.execPath, [childScript, ...childArgs], {
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: {
        ...process.env,
        CODEMCP_DAEMON: "true",
        PROJECT_ROOT: targetDir,
      },
      cwd: targetDir,
      windowsHide: true,
    });

    const state = {
      pid: child.pid,
      startedAt: Date.now(),
      projectRoot: targetDir,
      logFile: logPath,
      port: options.port || 4173,
    };
    saveDaemonState(targetDir, state);

    child.unref();

    console.log(
      pc.bold(pc.green(`✔ CodeMCP server started in background (detached mode)`)),
    );
    console.log(`  ${pc.bold("PID       :")} ${pc.cyan(child.pid)}`);
    console.log(`  ${pc.bold("Project   :")} ${pc.dim(targetDir)}`);
    console.log(
      `  ${pc.bold("Local URL :")} ${pc.cyan(`http://localhost:${options.port || 4173}/mcp`)}`,
    );
    console.log(`  ${pc.bold("Log file  :")} ${pc.dim(logPath)}`);
    console.log(
      `\n  Run ${pc.cyan("codemcp logs")} to view output, or ${pc.cyan("codemcp stop")} to terminate.\n`,
    );
    process.exit(0);
  }

  await startServer(options);
  if (
    process.env.CODEMCP_DAEMON !== "true" &&
    process.stdin.isTTY &&
    process.stdout.isTTY
  ) {
    console.log(pc.dim("  Press q to quit the server.\n"));
    enableQuitKey();
  }
}
