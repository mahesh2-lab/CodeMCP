import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { PathGuardError } from "../utils/pathGuard.js";
import { logger } from "../utils/logger.js";
import { isApprovalRequired, requestApproval } from "../services/approval.js";
import { createToolContext, wrapToolHandler, formatToolResponse } from "./context.js";

/**
 * Registers the `write_file` tool with the MCP server.
 * Creates or updates a file inside the project workspace, honoring path boundaries,
 * sensitive file blacklists, and optional interactive human-in-the-loop approval workflows.
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer | import("./context.js").ToolContext} serverOrCtx - The MCP server instance or shared tool context
 * @param {object} [project] - The scoped project definition (if server instance provided directly)
 */
export function registerWriteFileTool(serverOrCtx, project) {
  const ctx = serverOrCtx?.guard ? serverOrCtx : createToolContext(serverOrCtx, project);
  const { server: mcpServer, guard } = ctx;

  mcpServer.registerTool(
    "write_file",
    {
      description:
        "Creates or overwrites a file with the specified content inside the project directory.",
      inputSchema: {
        path: z.string().describe("File path relative to the project root, e.g. src/index.js"),
        content: z.string().describe("The complete text content to write into the file"),
      },
    },
    wrapToolHandler("WRITE", async (args) => {
      const relPath = args?.path;
      if (!relPath || typeof relPath !== "string" || !relPath.trim()) {
        throw new PathGuardError("Path is required", 400);
      }

      const cleanRelPath = relPath.trim();
      const absolutePath = guard.resolveSafe(cleanRelPath);

      if (guard.isIgnored(absolutePath)) {
        throw new PathGuardError("Writing to this file is blocked (ignored or sensitive)", 403);
      }

      const normalized = cleanRelPath.replace(/\\/g, "/");
      const content = args?.content !== undefined && args?.content !== null ? String(args.content) : "";

      // Interactive approval check if configured
      if (isApprovalRequired(ctx.project, "WRITE")) {
        let oldContent = "";
        try {
          oldContent = await fs.readFile(absolutePath, "utf8");
        } catch (err) {
          if (err.code !== "ENOENT") {
            logger.warn("WRITE", normalized, `Could not read existing content: ${err.message}`);
          }
        }

        const approval = await requestApproval({
          type: "WRITE",
          path: normalized,
          oldContent,
          newContent: content,
        });

        if (!approval.approved) {
          const reason = approval.reason || "User rejected this file modification.";
          logger.rejected("WRITE", normalized, reason);
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Changes rejected by user: ${reason}`,
              },
            ],
          };
        }
      }

      const dir = path.dirname(absolutePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(absolutePath, content, "utf8");

      const bytesWritten = Buffer.byteLength(content, "utf8");
      const message = `Successfully wrote ${bytesWritten} bytes to ${normalized}`;

      logger.toolWrite(normalized, bytesWritten);

      return formatToolResponse(
        {
          success: true,
          path: normalized,
          bytesWritten,
          message,
        },
        message
      );
    })
  );
}
