import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { PathGuardError } from "../utils/pathGuard.js";
import { logger } from "../utils/logger.js";
import { createToolContext, wrapToolHandler, formatToolResponse } from "./context.js";

/** Maximum permitted file size for text reading (10 MB) to protect memory and event loop */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/** Binary extensions that should not be read as raw UTF-8 text */
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico",
  ".pdf", ".zip", ".tar", ".gz", ".7z", ".rar",
  ".exe", ".dll", ".so", ".dylib", ".bin", ".iso",
  ".woff", ".woff2", ".ttf", ".eot",
  ".mp3", ".wav", ".ogg", ".mp4", ".mov", ".avi", ".mkv",
]);

/**
 * Registers the `read_file` tool with the MCP server.
 * Reads the UTF-8 text contents of a project-relative file with guardrails against traversal,
 * oversized payloads, and binary file corruption.
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer | import("./context.js").ToolContext} serverOrCtx - The MCP server instance or shared tool context
 * @param {object} [project] - The scoped project definition (if server instance provided directly)
 */
export function registerReadFileTool(serverOrCtx, project) {
  const ctx = serverOrCtx?.guard ? serverOrCtx : createToolContext(serverOrCtx, project);
  const { server: mcpServer, guard } = ctx;

  mcpServer.registerTool(
    "read_file",
    {
      description: "Reads one file's full contents given a path relative to the project root.",
      inputSchema: {
        path: z.string().describe("File path relative to project root, e.g. index.js or package.json"),
      },
    },
    wrapToolHandler("READ", async (args) => {
      const relPath = args?.path;
      if (!relPath || typeof relPath !== "string" || !relPath.trim()) {
        throw new PathGuardError("Path is required", 400);
      }

      const cleanRelPath = relPath.trim();
      const ext = path.extname(cleanRelPath).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) {
        throw new PathGuardError(`Cannot read binary file as text (${ext})`, 400);
      }

      const absolutePath = guard.resolveSafe(cleanRelPath);
      const stat = guard.assertExistsAndAllowed(absolutePath);

      if (!stat.isFile()) {
        throw new PathGuardError("Path is not a file", 400);
      }

      if (stat.size > MAX_FILE_SIZE_BYTES) {
        const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
        throw new PathGuardError(
          `File size (${sizeMb} MB) exceeds maximum allowed limit of 10 MB`,
          400
        );
      }

      const content = await fs.readFile(absolutePath, "utf8");
      const normalized = cleanRelPath.replace(/\\/g, "/");

      logger.toolRead(normalized, stat.size);

      return formatToolResponse(
        { path: normalized, size: stat.size, content },
        `File: ${normalized} (${stat.size} bytes)\n\n${content}`
      );
    })
  );
}
