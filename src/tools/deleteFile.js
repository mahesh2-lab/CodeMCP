import fs from "node:fs";
import { z } from "zod";
import { PathGuardError } from "../utils/pathGuard.js";
import { logger } from "../utils/logger.js";
import { isApprovalRequired, requestApproval } from "../services/approval.js";
import { createToolContext, wrapToolHandler, formatToolResponse } from "./context.js";

export function registerDeleteFileTool(server, project) {
  const ctx = server?.guard ? server : createToolContext(server, project);
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
      if (!relPath || typeof relPath !== "string") {
        throw new PathGuardError("Path is required", 400);
      }

      const absolutePath = guard.resolveSafe(relPath);

      if (guard.isIgnored(absolutePath)) {
        throw new PathGuardError("Deleting this file is blocked (ignored or sensitive)", 403);
      }

      if (!fs.existsSync(absolutePath)) {
        throw new PathGuardError("File not found", 404);
      }

      const stat = fs.statSync(absolutePath);
      if (!stat.isFile()) {
        throw new PathGuardError("Path is a directory, not a file", 400);
      }

      const normalized = relPath.replace(/\\/g, "/");

      // Interactive approval check
      if (isApprovalRequired(ctx.project, "DELETE")) {
        const approval = await requestApproval({
          type: "DELETE",
          path: normalized,
          size: stat.size,
        });

        if (!approval.approved) {
          logger.rejected("DELETE", normalized, approval.reason || "Rejected by user");
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `File deletion rejected by user: ${approval.reason || "User rejected this deletion."}`,
              },
            ],
          };
        }
      }

      fs.unlinkSync(absolutePath);
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
