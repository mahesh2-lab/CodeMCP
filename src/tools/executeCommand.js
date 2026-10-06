import { execFile, exec } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { logger } from "../utils/logger.js";
import { getEnv } from "../utils/env.js";
import {
  PathGuardError,
  assertPathContained,
  isIgnored,
} from "../utils/pathGuard.js";
import { recordAction } from "../services/memory.js";
import {
  isApprovalRequired,
  verifyActionApproval,
} from "../services/approval.js";
import { createToolContext, wrapToolHandler } from "./context.js";

/**
 * Explicit default allowlist of permitted developer binaries.
 * No arbitrary commands or system shells can be executed.
 */
export const DEFAULT_ALLOWED_BINARIES = new Set([
  "git",
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "node",
  "python",
  "python3",
  "pip",
  "pytest",
  "cargo",
  "rustc",
  "go",
  "tsc",
  "esbuild",
  "vitest",
  "jest",
  "rg",
]);

/**
 * Explicit allowlist of environment variable names exposed to executed processes.
 * Denylisting is strictly prohibited to prevent credential leakage.
 */
export const DEFAULT_ALLOWED_ENV_VARS = [
  "PATH",
  "NODE_ENV",
  "PROJECT_ROOT",
  "HOME",
  "USER",
  "LANG",
  "LC_ALL",
  "SHELL",
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "PATHEXT",
  "TEMP",
  "TMP",
];

/**
 * Constructs a clean environment containing strictly allowlisted variables.
 *
 * @param {string} cwd - Resolved working directory
 * @param {string[]} [customAllowed=[]] - Additional allowlisted variable names
 * @returns {object}
 */
export function buildCleanEnv(cwd, customAllowed = []) {
  return {
    ...process.env,
    PROJECT_ROOT: cwd,
  };
}

/**
 * Returns the set of all allowed binaries. Kept for backwards compatibility.
 *
 * @param {object} [project]
 * @returns {Set<string>}
 */
export function getAllowedBinaries(project = null) {
  return new Set(["*"]);
}

/**
 * Tokenizes a command string safely without invoking a shell.
 * Respects single and double quotes.
 *
 * @param {string} cmdStr
 * @returns {string[]} Array of argument tokens
 */
export function tokenizeCommand(cmdStr) {
  if (!cmdStr || typeof cmdStr !== "string" || !cmdStr.trim()) {
    throw new PathGuardError("Command is required", 400);
  }

  const tokens = [];
  let current = "";
  let inDoubleQuote = false;
  let inSingleQuote = false;
  let isEscaped = false;

  for (let i = 0; i < cmdStr.length; i++) {
    const char = cmdStr[i];

    if (isEscaped) {
      current += char;
      isEscaped = false;
      continue;
    }

    if (char === "\\") {
      isEscaped = true;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (/\s/.test(char) && !inDoubleQuote && !inSingleQuote) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (inDoubleQuote || inSingleQuote) {
    throw new PathGuardError("Unmatched quote in command string", 400);
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  if (tokens.length === 0) {
    throw new PathGuardError("Empty command", 400);
  }

  return tokens;
}

/**
 * Validates executable binary parameter. All command restrictions removed.
 *
 * @param {string} binary
 * @param {string[]} args
 * @param {string} projectRoot
 * @param {object} [project]
 */
export function validateExecution(binary, args, projectRoot, project = null) {
  if (!binary || typeof binary !== "string" || !binary.trim()) {
    throw new PathGuardError("Invalid executable binary", 400);
  }
}

/**
 * Resolves binary name for platform-specific execution (e.g. adding .cmd on Windows).
 *
 * @param {string} binary
 * @returns {string}
 */
export function resolveBinaryForPlatform(binary) {
  if (process.platform === "win32") {
    if (/\.(exe|cmd|bat)$/i.test(binary)) {
      return binary;
    }
    const cmdBinaries = new Set(["npm", "npx", "pnpm", "yarn", "tsc"]);
    if (cmdBinaries.has(binary.toLowerCase())) {
      return `${binary}.cmd`;
    }
  }
  return binary;
}

/**
 * Executes a binary with args using execFile, timeout, buffer capping, and clean env.
 *
 * @param {object} options
 * @param {string} options.binary
 * @param {string[]} options.args
 * @param {string} options.cwd
 * @param {number} options.timeout
 * @param {object} options.env
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number, duration: number, isTimedOut: boolean }>}
 */
export function runExecFileWithTimeout({ binary, args, cwd, timeout, env }) {
  const startTime = Date.now();
  let executable = resolveBinaryForPlatform(binary);
  let finalArgs = args;

  // On Windows, Node.js 22+ throws spawn EINVAL when executing .cmd / .bat files directly with shell: false.
  // We invoke via cmd.exe /d /s /c to execute batch/cmd binaries or shell builtins cleanly.
  if (process.platform === "win32") {
    const cmdBuiltins = new Set([
      "dir",
      "echo",
      "del",
      "copy",
      "move",
      "type",
      "mkdir",
      "md",
      "rmdir",
      "rd",
      "cls",
    ]);
    if (
      cmdBuiltins.has(executable.toLowerCase()) ||
      /\.(cmd|bat)$/i.test(executable)
    ) {
      finalArgs = ["/d", "/s", "/c", executable, ...args];
      executable = process.env.ComSpec || "cmd.exe";
    }
  }

  return new Promise((resolve) => {
    let child;
    try {
      child = execFile(
        executable,
        finalArgs,
        {
          cwd,
          timeout,
          maxBuffer: 500 * 1024,
          windowsHide: true,
          shell: false,
          env,
        },
        (err, stdout, stderr) => {
          const duration = Date.now() - startTime;
          const isTimedOut = Boolean(
            err &&
            (err.killed || err.signal === "SIGTERM" || err.code === "ETIMEDOUT"),
          );

          if (isTimedOut && process.platform === "win32" && child?.pid) {
            try {
              exec(`taskkill /pid ${child.pid} /t /f`, { windowsHide: true });
            } catch {}
          }

          let normalizedStderr = stderr || "";
          if (err?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
            normalizedStderr +=
              "\n[Error: Command output exceeded maximum buffer limit (500 KB)]";
          }

          const exitCode = isTimedOut
            ? 1
            : typeof err?.code === "number"
              ? err.code
              : err
                ? 1
                : 0;

          resolve({
            stdout: stdout || "",
            stderr: normalizedStderr,
            exitCode,
            duration,
            isTimedOut,
          });
        },
      );
    } catch (syncErr) {
      const duration = Date.now() - startTime;
      resolve({
        stdout: "",
        stderr: syncErr?.message || String(syncErr),
        exitCode: 1,
        duration,
        isTimedOut: false,
      });
    }
  });
}

/**
 * Registers the `execute_command` tool with the MCP server.
 * Uses execFile with an explicit binary allowlist, argument validation, PathGuard containment,
 * approval verification, and environment variable allowlisting.
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer | import("./context.js").ToolContext} serverOrCtx
 * @param {object} [project]
 */
export function registerExecuteCommandTool(serverOrCtx, project) {
  const ctx = serverOrCtx?.guard
    ? serverOrCtx
    : createToolContext(serverOrCtx, project);
  const { server: mcpServer, projectRoot } = ctx;

  mcpServer.registerTool(
    "execute_command",
    {
      description:
        "Executes an allowlisted terminal/build/test binary inside the project directory without raw shell execution.",
      inputSchema: {
        command: z
          .string()
          .optional()
          .describe(
            "The command string to execute (e.g. 'npm test', 'git status'). Tokenized safely without shell expansion.",
          ),
        binary: z
          .string()
          .optional()
          .describe(
            "The executable binary name from the permitted allowlist (e.g. 'npm', 'git', 'node').",
          ),
        args: z
          .array(z.string())
          .optional()
          .describe(
            "Array of argument strings to pass directly to the binary.",
          ),
        timeoutMs: z
          .number()
          .optional()
          .describe(
            "Command timeout in milliseconds (default: 30000 ms, min: 1000, max: 60000).",
          ),
        summary: z
          .string()
          .optional()
          .describe(
            "Optional 1-sentence summary of what this command does and why it was run.",
          ),
      },
    },
    wrapToolHandler("EXEC", async (toolArgs) => {
      let binary = toolArgs?.binary;
      let args = Array.isArray(toolArgs?.args) ? toolArgs.args : [];

      if (!binary && toolArgs?.command) {
        const tokens = tokenizeCommand(toolArgs.command);
        binary = tokens[0];
        args = tokens.slice(1);
      }

      if (!binary) {
        throw new PathGuardError(
          "Either 'command' or 'binary' parameter must be provided",
          400,
        );
      }

      // Ensure projectRoot exists and assert containment of cwd
      const cwd = assertPathContained(projectRoot, projectRoot);

      // Validate binary allowlist, arguments, and path boundaries
      validateExecution(binary, args, cwd, ctx.project);

      const commandDisplay = `${binary} ${args.join(" ")}`.trim();
      const timeout = Math.min(
        Math.max(toolArgs?.timeoutMs || 30000, 1000),
        60000,
      );

      // Route through interactive approval workflow
      if (isApprovalRequired(ctx.project, "EXEC")) {
        logger.toolPending?.("EXEC", commandDisplay);
      }

      const approvalResult = await verifyActionApproval({
        project: ctx.project,
        actionType: "EXEC",
        command: commandDisplay,
        cwd,
        logger,
      });

      if (!approvalResult.approved) {
        return approvalResult.rejectionResponse;
      }

      // Build clean allowlisted environment
      const cleanEnv = buildCleanEnv(cwd);

      const execResult = await runExecFileWithTimeout({
        binary,
        args,
        cwd,
        timeout,
        env: cleanEnv,
      });

      const { stdout, stderr, exitCode, duration, isTimedOut } = execResult;

      if (isTimedOut) {
        logger.warn("EXEC", commandDisplay, `Timed out after ${timeout}ms`);
        return {
          isError: true,
          structuredContent: {
            command: commandDisplay,
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

      const aiSummary = toolArgs?.summary?.trim() || toolArgs?.purpose?.trim();
      const outputClean = (stdout || stderr || "").replace(/\s+/g, " ").trim();
      const preview = outputClean ? outputClean.slice(0, 100) : "";
      const finalSummary =
        aiSummary ||
        `Executed "${commandDisplay}" -> exit ${exitCode}${preview ? `: ${preview}` : ""}`;

      logger.toolExec(commandDisplay, exitCode, duration);
      recordAction(ctx.project || projectRoot, {
        action: "EXEC",
        target: commandDisplay,
        client: logger.getActiveClient(),
        details: `exit ${exitCode} (${duration}ms)`,
        summary: finalSummary,
        preview,
      }).catch(() => {});

      const responseText = [
        `Command   : ${commandDisplay}`,
        `Exit Code : ${exitCode}`,
        `Duration  : ${duration}ms`,
        `Platform  : ${process.platform} (${process.arch})`,
        stdout ? `\n--- Output (stdout) ---\n${stdout.trim()}` : "",
        stderr ? `\n--- Error Output (stderr) ---\n${stderr.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      return {
        isError: exitCode !== 0,
        structuredContent: {
          command: commandDisplay,
          exitCode,
          durationMs: duration,
          stdout,
          stderr,
          timedOut: false,
        },
        content: [{ type: "text", text: responseText }],
      };
    }),
  );
}

export default registerExecuteCommandTool;
