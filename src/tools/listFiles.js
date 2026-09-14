import { z } from "zod";
import { PathGuardError, toPosix } from "../utils/pathGuard.js";
import { logger } from "../utils/logger.js";
import { createToolContext, wrapToolHandler, formatToolResponse } from "./context.js";

/** Default and maximum limits for recursively listed files */
const DEFAULT_MAX_FILES = 1000;
const ABSOLUTE_MAX_FILES = 10000;

/**
 * Registers the `list_files` tool with the MCP server.
 * Recursively discovers files within the project root or specified subfolder,
 * adhering to `.mcpignore`, `.gitignore`, and path boundaries.
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer | import("./context.js").ToolContext} serverOrCtx - The MCP server instance or shared tool context
 * @param {object} [project] - The scoped project definition (if server instance provided directly)
 */
export function registerListFilesTool(serverOrCtx, project) {
  const ctx = serverOrCtx?.guard ? serverOrCtx : createToolContext(serverOrCtx, project);
  const { server: mcpServer, guard } = ctx;

  mcpServer.registerTool(
    "list_files",
    {
      description:
        "Recursively lists source files in the project or a subfolder. Call this before reading a specific file to discover project structure.",
      inputSchema: {
        path: z
          .string()
          .optional()
          .describe("Subfolder relative to the project root. Omit or pass '.' to list all."),
        maxFiles: z
          .number()
          .optional()
          .describe("Maximum number of files to return (default: 1000, max: 10000)."),
      },
    },
    wrapToolHandler("LIST", async (args) => {
      const rawPath = args?.path;
      const subPath = typeof rawPath === "string" && rawPath.trim().length > 0 ? rawPath.trim() : ".";
      const maxFiles = Math.min(
        Math.max(typeof args?.maxFiles === "number" ? args.maxFiles : DEFAULT_MAX_FILES, 1),
        ABSOLUTE_MAX_FILES
      );

      const absoluteStart = guard.resolveSafe(subPath);
      const stat = guard.assertExistsAndAllowed(absoluteStart);

      if (!stat.isDirectory()) {
        throw new PathGuardError("Path is not a directory", 400);
      }

      const allFiles = [];
      const relativePrefix = subPath === "." ? "" : toPosix(subPath);
      guard.walk(absoluteStart, relativePrefix, allFiles);

      const totalDiscovered = allFiles.length;
      const isTruncated = totalDiscovered > maxFiles;
      const returnedFiles = isTruncated ? allFiles.slice(0, maxFiles) : allFiles;
      const sortedFiles = returnedFiles.sort((a, b) => a.localeCompare(b));

      logger.toolList(subPath, sortedFiles.length);

      const data = {
        count: sortedFiles.length,
        totalDiscovered,
        truncated: isTruncated,
        path: subPath,
        files: sortedFiles,
      };

      const summaryText = isTruncated
        ? `Found ${totalDiscovered} files (showing first ${sortedFiles.length}):\n\n${sortedFiles.join("\n")}\n\n...[truncated, use a more specific path subfolder]`
        : `Found ${sortedFiles.length} files:\n\n${sortedFiles.join("\n")}`;

      return formatToolResponse(data, summaryText);
    })
  );
}
