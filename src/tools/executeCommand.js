import { exec } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { PROJECT_ROOT } from "../utils/pathGuard.js";
import { logger } from "../utils/logger.js";
import { getEnv } from "../utils/env.js";

const RESTRICTED_RULES = [
  // 1. Directory traversal & navigation out of project scope
  {
    pattern: /(^|[\s"'`\/\\=])\.\.([\/\\]|[\s"'`=]|$)/,
    reason: "Directory traversal (..) outside project scope prohibited",
  },
  {
    pattern: /\b(cd|chdir|pushd)\s+([a-zA-Z]:[/\\]?|[/~\\\$%]|(\.\.))/i,
    reason: "Changing directory outside project folder prohibited",
  },
  {
    pattern: /(^|[\s"'`=])(~[\/\\]|\$HOME\b|%USERPROFILE%|%APPDATA%|%LOCALAPPDATA%|%WINDIR%|%SYSTEMROOT%)/i,
    reason: "Accessing user/system path outside project directory prohibited",
  },
  {
    pattern: /(^|[\s"'`=])\/(etc|var|usr|bin|sbin|root|home|opt|boot|dev|sys|proc)\b/i,
    reason: "System directory access prohibited",
  },

  // 2. Sensitive file and credentials access
  {
    pattern: /(^|[\s"'`\/\\=])\.env(\.[a-zA-Z0-9_.-]+)?(\b|[\s"'`\/\\=]|$)/i,
    reason: "Sensitive file access prohibited (.env)",
  },
  {
    pattern: /\b(id_rsa|id_ecdsa|id_ed25519|\.codemcp|credentials\.enc|\.aws[\/\\]credentials|\.ssh[\/\\]|\/etc\/shadow|\/etc\/passwd)\b/i,
    reason: "Credentials and sensitive key access prohibited",
  },
  {
    pattern: /(^|[\s"'`\/\\=])\.git[\/\\](config|credentials|HEAD|hooks|objects)/i,
    reason: "Internal git repository configuration access prohibited",
  },

  // 3. Destructive deletion commands
  {
    pattern: /\b(rmdir|rd)\s+.*\/s/i,
    reason: "Recursive directory deletion prohibited",
  },
  {
    pattern: /\bdel\s+.*\/f\s+\/s/i,
    reason: "Forceful recursive file deletion prohibited",
  },
  {
    pattern: /\b(del|erase)\s+.*(\*|\/s|\/f)/i,
    reason: "Broad or recursive file deletion prohibited",
  },
  {
    pattern: /\b(del|rmdir|rd)\s+.*[a-zA-Z]:\\/i,
    reason: "Drive root deletion prohibited",
  },
  {
    pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f*|-f*r)\s+([\/~*.]|(\.\.))/i,
    reason: "Broad recursive deletion prohibited",
  },

  // 4. Disk & low-level operations
  {
    pattern: /\b(format|diskpart|bcdedit|chkdsk|fdisk|mkfs|parted)\b/i,
    reason: "Drive formatting and disk partitioning prohibited",
  },
  {
    pattern: /\b(mkfs|dd\s+if=)\b/i,
    reason: "Low-level disk modification prohibited",
  },

  // 5. System power & lifecycle
  {
    pattern: /\b(shutdown|restart-computer|stop-computer|reboot|halt|poweroff|init\s+[06])\b/i,
    reason: "System power command prohibited",
  },

  // 6. Registry, accounts, and privilege escalation
  {
    pattern: /\b(reg\s+(add|delete|import|restore)|regedit)\b/i,
    reason: "Registry modification prohibited",
  },
  {
    pattern: /\b(net\s+user|net\s+localgroup|useradd|usermod|userdel|groupadd)\b/i,
    reason: "User account modification prohibited",
  },
  {
    pattern: /\b(sudo|runas|doas|pbrun|su\s+-|su\s+[a-zA-Z0-9_-]+)\b/i,
    reason: "Privilege escalation / superuser execution prohibited",
  },
  {
    pattern: /\b(sc\s+(create|delete|config|start|stop)|systemctl\s+(stop|disable|restart|mask)|service\s+\w+\s+(stop|restart))\b/i,
    reason: "System service manipulation prohibited",
  },

  // 7. Remote execution, reverse shells & execution policy bypass
  {
    pattern: /\b(curl|wget)\b.*\|\s*(sh|bash|zsh|cmd|powershell|pwsh)\b/i,
    reason: "Piping remote script into shell execution prohibited",
  },
  {
    pattern: /\b(Invoke-WebRequest|iwr|curl)\b.*\|\s*(iex|Invoke-Expression)\b/i,
    reason: "Remote script execution prohibited",
  },
  {
    pattern: /\bpowershell.*(-enc|-encodedcommand|-executionpolicy\s+bypass|-ep\s+bypass)\b/i,
    reason: "PowerShell execution policy bypass or encoded execution prohibited",
  },
  {
    pattern: /\b(nc|ncat|netcat)\s+.*-e\b/i,
    reason: "Network shell binding prohibited",
  },

  // 8. Fork bomb
  {
    pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    reason: "Fork bomb prohibited",
  },
];

export function validateSystemAndCommand(command, projectRoot) {
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
    } catch {}
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

export function registerExecuteCommandTool(server, project) {
  const projectRoot = project?.root || PROJECT_ROOT;

  server.registerTool(
    "execute_command",
    {
      description:
        "Executes a terminal/build/test command inside the project directory. Performs system safety checks before running.",
      inputSchema: {
        command: z.string().describe("The shell command to execute, e.g. npm test or git status"),
        timeoutMs: z
          .number()
          .optional()
          .describe("Maximum execution time in milliseconds (default: 30000, max: 60000)"),
      },
      outputSchema: {
        command: z.string().describe("Command executed"),
        exitCode: z.number().describe("Process exit code (0 for success)"),
        durationMs: z.number().describe("Command run duration in milliseconds"),
        stdout: z.string().describe("Standard output"),
        stderr: z.string().describe("Standard error output"),
        timedOut: z.boolean().describe("Whether the command timed out"),
      },
    },
    async (args) => {
      const rawCmd = args?.command?.trim();
      if (!rawCmd) {
        return { isError: true, content: [{ type: "text", text: "Error: command is required" }] };
      }

      // Pre-flight system check
      const check = validateSystemAndCommand(rawCmd, projectRoot);
      if (!check.ok) {
        logger.blocked("EXEC", rawCmd, check.reason || "Security violation");
        return { isError: true, content: [{ type: "text", text: `Blocked: ${check.error}` }] };
      }

      const cwd = check.resolvedRoot || path.resolve(projectRoot);
      const timeout = Math.min(Math.max(args?.timeoutMs || 30000, 1000), 60000);
      const startTime = Date.now();

      return new Promise((resolve) => {
        const execEnv = { ...process.env, PROJECT_ROOT: cwd };
        // Strip sensitive credentials and tokens to prevent leakage
        const sensitivePattern = /(API_KEY|AUTHTOKEN|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|PRIVATE_KEY)/i;
        for (const key of Object.keys(execEnv)) {
          if (sensitivePattern.test(key)) {
            delete execEnv[key];
          }
        }

        exec(
          rawCmd,
          {
            cwd,
            timeout,
            maxBuffer: 500 * 1024, // 500 KB limit
            env: execEnv,
          },
          (err, stdout, stderr) => {
            const duration = Date.now() - startTime;
            const code = err ? (typeof err.code === "number" ? err.code : 1) : 0;

            if (err && err.killed) {
              logger.warn("EXEC", rawCmd, `Timed out after ${timeout}ms`);
              return resolve({
                isError: true,
                structuredContent: {
                  command: rawCmd,
                  exitCode: 1,
                  durationMs: timeout,
                  stdout: stdout || "",
                  stderr: stderr || "",
                  timedOut: true,
                },
                content: [
                  {
                    type: "text",
                    text: `Command timed out after ${timeout}ms\n\nPartial stdout:\n${stdout}\n\nPartial stderr:\n${stderr}`,
                  },
                ],
              });
            }

            logger.toolExec(rawCmd, code, duration);

            const responseText = [
              `Command   : ${rawCmd}`,
              `Exit Code : ${code}`,
              `Duration  : ${duration}ms`,
              `Platform  : ${check.systemInfo.platform} (${check.systemInfo.arch})`,
              stdout ? `\n--- Output (stdout) ---\n${stdout.trim()}` : "",
              stderr ? `\n--- Error Output (stderr) ---\n${stderr.trim()}` : "",
            ]
              .filter(Boolean)
              .join("\n");

            resolve({
              isError: code !== 0,
              structuredContent: {
                command: rawCmd,
                exitCode: code,
                durationMs: duration,
                stdout: stdout || "",
                stderr: stderr || "",
                timedOut: false,
              },
              content: [{ type: "text", text: responseText }],
            });
          }
        );
      });
    }
  );
}
