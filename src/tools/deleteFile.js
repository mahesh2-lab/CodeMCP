import fs from "node:fs";
import { z } from "zod";
import {
  resolveSafe,
  isIgnored,
  PathGuardError,
  PROJECT_ROOT,
} from "../utils/pathGuard.js";
import { logger } from "../utils/logger.js";

export function registerDeleteFileTool(server, project) {
  const projectRoot = project?.root || PROJECT_ROOT;

  server.registerTool(
    "delete_file",
    {
      description: "Deletes a file within the project folder. Use with caution for refactoring or cleanup.",
      inputSchema: {
        path: z.string().describe("File path relative to project root to delete, e.g. temp.js"),
      },
      outputSchema: {
        success: z.boolean().describe("Whether deletion succeeded"),
        path: z.string().describe("Normalized file path relative to project root"),
        message: z.string().describe("Human readable status message"),
      },
    },
    async (args) => {
      try {
        const relPath = args?.path;
        if (!relPath || typeof relPath !== "string") {
          throw new PathGuardError("Path is required", 400);
        }

        const absolutePath = resolveSafe(relPath, projectRoot);

        if (isIgnored(absolutePath, projectRoot)) {
          throw new PathGuardError("Deleting this file is blocked (ignored or sensitive)", 403);
        }

        if (!fs.existsSync(absolutePath)) {
          throw new PathGuardError("File not found", 404);
        }

        const stat = fs.statSync(absolutePath);
        if (!stat.isFile()) {
          throw new PathGuardError("Path is a directory, not a file", 400);
        }

        fs.unlinkSync(absolutePath);
        const normalized = relPath.replace(/\\/g, "/");

        logger.toolDelete(normalized);

        return {
          structuredContent: {
            success: true,
            path: normalized,
            message: `Successfully deleted ${normalized}`,
          },
          content: [
            {
              type: "text",
              text: `Successfully deleted ${normalized}`,
            },
          ],
        };
      } catch (err) {
        const target = (args?.path || "").replace(/\\/g, "/");
        if (err.statusCode === 403 || err.message?.includes("blocked") || err.message?.includes("escapes")) {
          logger.blocked("DELETE", target, err.message);
        } else {
          logger.warn("DELETE", target, err.message);
        }
        return {
          isError: true,
          content: [{ type: "text", text: `Error: ${err.message}` }],
        };
      }
    }
  );
}
