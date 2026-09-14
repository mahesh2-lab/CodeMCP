import { exec } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { logger } from "../utils/logger.js";
import { getEnv } from "../utils/env.js";
import { PathGuardError } from "../utils/pathGuard.js";
import { recordAction } from "../services/memory.js";
import { createToolContext, wrapToolHandler } from "./context.js";

/**
 * Standard security blacklist rules preventing destructive operations,
 * directory traversal, credential leakage, and privilege escalation.
 */
const RESTRICTED_RULES = [
  { pattern: /(^|[\s"'`\/\\=])\.\.([\/\\]|[\s"'`=]|$)/, reason: "Directory traversal (..) outside project scope prohibited", },
  { pattern: /\b(cd|chdir|pushd)\s+([a-zA-Z]:[/\\]?|[/~\\\$%]|(\.\.))/i, reason: "Changing directory outside project folder prohibited", },
  { pattern: /(^|[\s"'`=])(~[\/\\]|\$HOME\b|%USERPROFILE%|%APPDATA%|%LOCALAPPDATA%|%WINDIR%|%SYSTEMROOT%)/i, reason: "Accessing user/system path outside project directory prohibited", },
  { pattern: /(^|[\s"'`=])\/(etc|var|usr|bin|sbin|root|home|opt|boot|dev|sys|proc)\b/i, reason: "System directory access prohibited", },
  { pattern: /(^|[\s"'`\/\\=])\.env(\.[a-zA-Z0-9_.-]+)?(\b|[\s"'`\/\\=]|$)/i, reason: "Sensitive file access prohibited (.env)", },
  { pattern: /\b(id_rsa|id_ecdsa|id_ed25519|\.codemcp|credentials\.enc|\.aws[\/\\]credentials|\.ssh[\/\\]|\/etc\/shadow|\/etc\/passwd)\b/i, reason: "Credentials and sensitive key access prohibited", },
  { pattern: /(^|[\s"'`\/\\=])\.git[\/\\](config|credentials|HEAD|hooks|objects)/i, reason: "Internal git repository configuration access prohibited", },
  { pattern: /\b(rmdir|rd)\s+.*\/s/i, reason: "Recursive directory deletion prohibited", },
  { pattern: /\bdel\s+.*\/f\s+\/s/i, reason: "Forceful recursive file deletion prohibited", },
  { pattern: /\b(del|erase)\s+.*(\*|\/s|\/f)/i, reason: "Broad or recursive file deletion prohibited", },
  { pattern: /\b(del|rmdir|rd)\s+.*[a-zA-Z]:\\/i, reason: "Drive root deletion prohibited", },
  { pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f*|-f*r)\s+([\/~*.]|(\.\.))/i, reason: "Broad recursive deletion prohibited", },
  { pattern: /\b(format|diskpart|bcdedit|chkdsk|fdisk|mkfs|parted)\b/i, reason: "Drive formatting and disk partitioning prohibited", },
  { pattern: /\b(mkfs|dd\s+if=)\b/i, reason: "Low-level disk modification prohibited", },
  { pattern: /\b(shutdown|restart-computer|stop-computer|reboot|halt|poweroff|init\s+[06])\b/i, reason: "System power command prohibited", },
  { pattern: /\b(reg\s+(add|delete|import|restore)|regedit)\b/i, reason: "Registry modification prohibited", },
  { pattern: /\b(net\s+user|net\s+localgroup|useradd|usermod|userdel|groupadd)\b/i, reason: "User account modification prohibited", },
  { pattern: /\b(sudo|runas|doas|pbrun|su\s+-|su\s+[a-zA-Z0-9_-]+)\b/i, reason: "Privilege escalation / superuser execution prohibited", },
  { pattern: /\b(sc\s+(create|delete|config|start|stop)|systemctl\s+(stop|disable|restart|mask)|service\s+\w+\s+(stop|restart))\b/i, reason: "System service manipulation prohibited", },
  { pattern: /\b(curl|wget)\b.*\|\s*(sh|bash|zsh|cmd|powershell|pwsh)\b/i, reason: "Piping remote script into shell execution prohibited", },
  { pattern: /\b(Invoke-WebRequest|iwr|curl)\b.*\|\s*(iex|Invoke-Expression)\b/i, reason: "Remote script execution prohibited", },
  { pattern: /\bpowershell.*(-enc|-encodedcommand|-executionpolicy\s+bypass|-ep\s+bypass)\b/i, reason: "PowerShell execution policy bypass or encoded execution prohibited", },
  { pattern: /\b(nc|ncat|netcat)\s+.*-e\b/i, reason: "Network shell binding prohibited", },
  { pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, reason: "Fork bomb prohibited", },
];

/**
 * Validates command against project boundary policies, security rules, and system capabilities.
 *
 * @param {string} command - Shell command to validate
 * @param {string} projectRoot - Absolute path to project root
 * @returns {{ ok: boolean, shell?: string, systemInfo?: object, resolvedRoot?: string, error?: string, reason?: string }}
 */
function validateSystemAndCommand(command, projectRoot) {
  const isWindows = process.platform === "win32";

  if (!command || typeof command !== "string" || !command.trim()) {
    return { ok: false, error: "Command is required", reason: "Empty command" };
  }

  // 1. Verify project directory exists and is a directory
  if (!projectRoot || typeof projectRoot !== "string") {
    return { ok: false, error: "Invalid project root directory", reason: "Invalid directory" };
  }

  const resolvedRoot = path.resolve(projectRoot);
  if (!fs.existsSync(resolvedRoot)) {
    return { ok: false, error: "Project root directory does not exist", reason: "Directory not found" };
  }

  try {
    const stat = fs.statSync(resolvedRoot);
    if (!stat.isDirectory()) {
      return { ok: false, error: "Project root is not a directory", reason: "Not a directory" };
    }
  } catch {
    return { ok: false, error: "Cannot access project root directory", reason: "Directory inaccessible" };
  }

  // 2. Check security blacklist rules
  for (const rule of RESTRICTED_RULES) {
    if (rule.pattern.test(command)) {
      return {
        ok: false,
        reason: rule.reason,
        error: `Command blocked by security policy (${rule.reason})`,
      };
    }
  }

  // 3. Verify absolute path references are scoped strictly inside project root
  const absPathPattern = isWindows
    ? /[a-zA-Z]:[/\\][^\s"'`<>|;&]*/g
    : /(?:^|[\s"'`=])(\/[^\s"'`<>|;&]*)/g;

  let match;
  while ((match = absPathPattern.exec(command)) !== null) {
    const rawTarget = (match[1] || match[0]).trim();
    if (!rawTarget) continue;
    try {
      const resolvedTarget = path.resolve(rawTarget);
      const relative = path.relative(resolvedRoot, resolvedTarget);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        return {
          ok: false,
          reason: "Out-of-scope path access",
          error: `Command references path outside project folder (${rawTarget})`,
        };
      }
    } catch {
      // Ignore unresolvable path tokens
    }
  }

  // 4. Detect system shell
  const shell = isWindows
    ? getEnv("COMSPEC", "cmd.exe")
    : getEnv("SHELL", "/bin/sh");

  const systemInfo = {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    shell: path.basename(shell),
    freeMemMB: Math.round(os.freemem() / (1024 * 1024)),
    totalMemMB: Math.round(os.totalmem() / (1024 * 1024)),
    resolvedRoot,
  };

  return { ok: true, shell, systemInfo, resolvedRoot };
}

/**
 * Executes a sanitized shell command with timeout, output buffer capping,
 * and platform-specific process group cleanup on timeout.
 *
 * @param {object} options
 * @param {string} options.command - The raw command string to execute
 * @param {string} options.cwd - Working directory
 * @param {number} options.timeout - Timeout in milliseconds
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number, duration: number, isTimedOut: boolean }>}
 */
function runCommandWithTimeout({ command, cwd, timeout }) {
  const startTime = Date.now();
  const execEnv = { ...process.env, PROJECT_ROOT: cwd };

  // Strip sensitive credentials, cloud keys, and access tokens to prevent leakage
  const sensitivePattern = /(API_KEY|AUTH|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|PRIVATE_KEY|GITHUB|AWS|NPM|CODEMCP)/i;
  for (const key of Object.keys(execEnv)) {
    if (sensitivePattern.test(key)) {
      delete execEnv[key];
    }
  }

  return new Promise((resolve) => {
    const child = exec(
      command,
      {
        cwd,
        timeout,
        maxBuffer: 500 * 1024, // 500 KB stdout/stderr buffer
        windowsHide: true,
        env: execEnv,
      },
      (err, stdout, stderr) => {
        const duration = Date.now() - startTime;
        const isTimedOut = Boolean(err && (err.killed || err.signal === "SIGTERM" || err.code === "ETIMEDOUT"));

        // On Windows, ensure orphaned child processes of cmd.exe are cleaned up
        if (isTimedOut && process.platform === "win32" && child.pid) {
          try {
            exec(`taskkill /pid ${child.pid} /t /f`, { windowsHide: true });
          } catch {
            // Ignore kill errors for already-dead process
          }
        }

        let normalizedStderr = stderr || "";
        if (err?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
          normalizedStderr += "\n[Error: Command output exceeded maximum buffer limit (500 KB)]";
        }

        const exitCode = isTimedOut ? 1 : typeof err?.code === "number" ? err.code : err ? 1 : 0;

        resolve({
          stdout: stdout || "",
          stderr: normalizedStderr,
          exitCode,
          duration,
          isTimedOut,
        });
      }
    );
  });
}

/**
 * Registers the `execute_command` tool with the MCP server.
 * Runs terminal/build/test commands within the scoped project root, applying pre-flight
 * security checks, environment variable sanitization, and execution timeouts.
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer | import("./context.js").ToolContext} serverOrCtx - The MCP server instance or shared tool context
 * @param {object} [project] - The scoped project definition (if server instance provided directly)
 */
export function registerExecuteCommandTool(serverOrCtx, project) {
  const ctx = serverOrCtx?.guard ? serverOrCtx : createToolContext(serverOrCtx, project);
  const { server: mcpServer, projectRoot } = ctx;

  mcpServer.registerTool(
    "execute_command",
    {
      description:
        "Executes a terminal/build/test command inside the project directory. Performs system safety checks before running.",
      inputSchema: {
        command: z.string().describe("The shell command to execute (e.g., 'npm test', 'cargo build', 'python script.py')."),
        timeoutMs: z
          .number()
          .optional()
          .describe("Command timeout in milliseconds (default: 30000 ms, min: 1000, max: 60000)."),
        summary: z
          .string()
          .optional()
          .describe("Optional 1-sentence summary of what this command does and why it was run."),
      },
    },
    wrapToolHandler("EXEC", async (args) => {
      const rawCmd = args?.command;
      const check = validateSystemAndCommand(rawCmd, projectRoot);

      if (!check.ok) {
        logger.blocked("EXEC", rawCmd, check.reason || check.error);
        throw new PathGuardError(check.error || "Command blocked by security policy", 403);
      }

      const cwd = check.resolvedRoot || path.resolve(projectRoot);
      const timeout = Math.min(Math.max(args?.timeoutMs || 30000, 1000), 60000);

      const execResult = await runCommandWithTimeout({
        command: rawCmd,
        cwd,
        timeout,
      });

      const { stdout, stderr, exitCode, duration, isTimedOut } = execResult;

      if (isTimedOut) {
        logger.warn("EXEC", rawCmd, `Timed out after ${timeout}ms`);
        return {
          isError: true,
          structuredContent: {
            command: rawCmd,
            exitCode: 1,
            durationMs: timeout,
            stdout,
            stderr,
            timedOut: true,
          },
          content: [
            {
              type: "text",
              text: `Command timed out after ${timeout}ms\n\nPartial stdout:\n${stdout}\n\nPartial stderr:\n${stderr}`,
            },
          ],
        };
      }

      const aiSummary = args?.summary?.trim() || args?.purpose?.trim();
      const outputClean = (stdout || stderr || "").replace(/\s+/g, " ").trim();
      const preview = outputClean ? outputClean.slice(0, 100) : "";
      const finalSummary = aiSummary || `Executed "${rawCmd}" -> exit ${exitCode}${preview ? `: ${preview}` : ""}`;

      logger.toolExec(rawCmd, exitCode, duration);
      recordAction(ctx.project || projectRoot, {
        action: "EXEC",
        target: rawCmd,
        client: logger.getActiveClient(),
        details: `exit ${exitCode} (${duration}ms)`,
        summary: finalSummary,
        preview,
      }).catch(() => {});

      const responseText = [
        `Command   : ${rawCmd}`,
        `Exit Code : ${exitCode}`,
        `Duration  : ${duration}ms`,
        `Platform  : ${check.systemInfo.platform} (${check.systemInfo.arch})`,
        stdout ? `\n--- Output (stdout) ---\n${stdout.trim()}` : "",
        stderr ? `\n--- Error Output (stderr) ---\n${stderr.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      return {
        isError: exitCode !== 0,
        structuredContent: {
          command: rawCmd,
          exitCode,
          durationMs: duration,
          stdout,
          stderr,
          timedOut: false,
        },
        content: [{ type: "text", text: responseText }],
      };
    })
  );
}
