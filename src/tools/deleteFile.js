import fs from "node:fs/promises";
import { z } from "zod";
import { PathGuardError } from "../utils/pathGuard.js";
import { logger } from "../utils/logger.js";
import { isApprovalRequired, requestApproval } from "../services/approval.js";
import { createToolContext, wrapToolHandler, formatToolResponse } from "./context.js";

/**
 * Registers the `delete_file` tool with the MCP server.
 * Removes a file safely from the project directory, enforcing path boundary restrictions,
 * sensitive file blacklists, and interactive human verification.
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer | import("./context.js").ToolContext} serverOrCtx - The MCP server instance or shared tool context
 * @param {object} [project] - The scoped project definition (if server instance provided directly)
 */
export function registerDeleteFileTool(serverOrCtx, project) {
  const ctx = serverOrCtx?.guard ? serverOrCtx : createToolContext(serverOrCtx, project);
  const { server: mcpServer, guard } = ctx;

  mcpServer.registerTool(
    "delete_file",
    {
      description: "Deletes a file within the project folder. Use with caution for refactoring or cleanup.",
      inputSchema: {
        path: z.string().describe("File path relative to project root to delete, e.g. temp.js"),
      },
    },
    wrapToolHandler("DELETE", async (args) => {
      const relPath = args?.path;
      if (!relPath || typeof relPath !== "string" || !relPath.trim()) {
        throw new PathGuardError("Path is required", 400);
      }

      const cleanRelPath = relPath.trim();
      const absolutePath = guard.resolveSafe(cleanRelPath);

      if (guard.isIgnored(absolutePath)) {
        throw new PathGuardError("Deleting this file is blocked (ignored or sensitive)", 403);
      }

      let stat;
      try {
        stat = await fs.stat(absolutePath);
      } catch (err) {
        if (err.code === "ENOENT") {
          throw new PathGuardError("File not found", 404);
        }
        throw new PathGuardError(`Unable to access file: ${err.message}`, 500);
      }

      if (!stat.isFile()) {
        throw new PathGuardError("Path is a directory, not a file", 400);
      }

      const normalized = cleanRelPath.replace(/\\/g, "/");

      // Interactive approval check if configured
      if (isApprovalRequired(ctx.project, "DELETE")) {
        const approval = await requestApproval({
          type: "DELETE",
          path: normalized,
          size: stat.size,
        });

        if (!approval.approved) {
          const reason = approval.reason || "User rejected this deletion.";
          logger.rejected("DELETE", normalized, reason);
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `File deletion rejected by user: ${reason}`,
              },
            ],
          };
        }
      }

      await fs.unlink(absolutePath);
      const message = `Successfully deleted ${normalized}`;

      logger.toolDelete(normalized);

      return formatToolResponse(
        {
          success: true,
          path: normalized,
          message,
        },
        message
      );
    })
  );
}
