import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { PathGuardError } from "../utils/pathGuard.js";
import { logger } from "../utils/logger.js";
import { isApprovalRequired, requestApproval } from "../services/approval.js";
import { createToolContext, wrapToolHandler, formatToolResponse } from "./context.js";

export function registerWriteFileTool(server, project) {
  const ctx = server?.guard ? server : createToolContext(server, project);
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
      if (!relPath || typeof relPath !== "string") {
        throw new PathGuardError("Path is required", 400);
      }

      const absolutePath = guard.resolveSafe(relPath);

      if (guard.isIgnored(absolutePath)) {
        throw new PathGuardError("Writing to this file is blocked (ignored or sensitive)", 403);
      }

      const normalized = relPath.replace(/\\/g, "/");
      const content = args.content ?? "";

      // Interactive approval check
      if (isApprovalRequired(ctx.project, "WRITE")) {
        let oldContent = "";
        if (fs.existsSync(absolutePath)) {
          try {
            oldContent = fs.readFileSync(absolutePath, "utf8");
          } catch {}
        }

        const approval = await requestApproval({
          type: "WRITE",
          path: normalized,
          oldContent,
          newContent: content,
        });

        if (!approval.approved) {
          logger.rejected("WRITE", normalized, approval.reason || "Rejected by user");
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Changes rejected by user: ${approval.reason || "User rejected this file modification."}`,
              },
            ],
          };
        }
      }

      const dir = path.dirname(absolutePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(absolutePath, content, "utf8");
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
