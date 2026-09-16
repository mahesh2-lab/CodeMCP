import path from "node:path";
import { z } from "zod";
import { PathGuardError } from "../utils/pathGuard.js";
import { createToolContext, wrapToolHandler, formatToolResponse } from "./context.js";

function globToRegExp(pattern) {
  const escaped = String(pattern).replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i");
}

export function registerFindFileTool(serverOrCtx, project) {
  const ctx = serverOrCtx?.guard ? serverOrCtx : createToolContext(serverOrCtx, project);
  const { server, guard } = ctx;
  server.registerTool("find_file", {
    description: "Find files by filename or glob-style pattern inside the project, respecting ignore and path boundaries.",
    inputSchema: {
      pattern: z.string().min(1).max(300).describe("Filename or glob pattern such as '*.js' or 'src/**/*.ts'"),
      path: z.string().optional().describe("Optional project-relative directory to search"),
      maxResults: z.number().optional().describe("Maximum results (default 100, max 1000)"),
    },
  }, wrapToolHandler("FIND", async (args) => {
    const pattern = String(args.pattern).trim();
    const scope = String(args.path || ".").trim() || ".";
    const start = guard.resolveSafe(scope);
    if (!guard.assertExistsAndAllowed(start).isDirectory()) throw new PathGuardError("Search path must be a directory", 400);
    const maxResults = Math.min(Math.max(Number(args.maxResults) || 100, 1), 1000);
    const matcher = globToRegExp(pattern);
    const files = [];
    guard.walk(start, scope === "." ? "" : path.posix.normalize(scope.replace(/\\/g, "/")), files);
    const matched = files.filter((file) => matcher.test(file) || matcher.test(path.basename(file))).slice(0, maxResults);
    return formatToolResponse({ pattern, path: scope, count: matched.length, files: matched }, matched.join("\n") || `No files matched '${pattern}'`);
  }));
}
