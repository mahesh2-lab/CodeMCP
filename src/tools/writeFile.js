import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { PathGuardError, toPosix } from "../utils/pathGuard.js";
import { logger } from "../utils/logger.js";
import { verifyActionApproval, isApprovalRequired } from "../services/approval.js";
import { recordAction } from "../services/memory.js";
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
        summary: z
          .string()
          .optional()
          .describe("Optional brief description of what was added or updated in this file"),
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

      const normalized = toPosix(cleanRelPath);
      const content = args?.content !== undefined && args?.content !== null ? String(args.content) : "";

      // Check if file already exists before writing
      let isNew = true;
      try {
        await fs.access(absolutePath);
        isNew = false;
      } catch {}

      // Interactive approval check if configured
      let oldContent = "";
      try {
        oldContent = await fs.readFile(absolutePath, "utf8");
      } catch (err) {
        if (err.code !== "ENOENT") {
          logger.warn("WRITE", normalized, `Could not read existing content: ${err.message}`);
        }
      }

      if (isApprovalRequired(ctx.project, "WRITE")) {
        logger.toolWritePending(normalized);
      }

      const approvalResult = await verifyActionApproval({
        project: ctx.project,
        actionType: "WRITE",
        path: normalized,
        oldContent,
        newContent: content,
        logger,
      });

      if (!approvalResult.approved) {
        return approvalResult.rejectionResponse;
      }

      const dir = path.dirname(absolutePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(absolutePath, content, "utf8");

      const bytesWritten = Buffer.byteLength(content, "utf8");
      const lineCount = content.split(/\r?\n/).length;
      const details = `${isNew ? "Created" : "Updated"} ${bytesWritten} bytes (${lineCount} lines)`;
      const aiSummary = args?.summary?.trim();
      const finalSummary = aiSummary || `${isNew ? "Created" : "Updated"} ${path.basename(normalized)}`;
      const preview = content.replace(/\s+/g, " ").trim().slice(0, 100);
      const message = `Successfully wrote ${bytesWritten} bytes to ${normalized}${aiSummary ? ` (${aiSummary})` : ""}`;

      logger.toolWrite(normalized, bytesWritten);
      recordAction(ctx.project || ctx.projectRoot, {
        action: "WRITE",
        target: normalized,
        client: logger.getActiveClient(),
        details,
        summary: finalSummary,
        preview,
      }).catch(() => {});

      return formatToolResponse(
        {
          success: true,
          path: normalized,
          bytesWritten,
          summary: finalSummary,
          details,
          message,
        },
        message
      );
    })
  );
}
