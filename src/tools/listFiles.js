import { z } from "zod";
import { PathGuardError } from "../utils/pathGuard.js";
import { logger } from "../utils/logger.js";
import { createToolContext, wrapToolHandler, formatToolResponse } from "./context.js";

export function registerListFilesTool(server, project) {
  const ctx = server?.guard ? server : createToolContext(server, project);
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
      },
    },
    wrapToolHandler("LIST", async (args) => {
      const subPath = args?.path || ".";
      const absoluteStart = guard.resolveSafe(subPath);
      const stat = guard.assertExistsAndAllowed(absoluteStart);

      if (!stat.isDirectory()) {
        throw new PathGuardError("Path is not a directory", 400);
      }

      const files = [];
      guard.walk(absoluteStart, subPath === "." ? "" : subPath.replace(/\\/g, "/"), files);

      logger.toolList(subPath, files.length);

      const sortedFiles = files.sort();
      const data = {
        count: sortedFiles.length,
        path: subPath,
        files: sortedFiles,
      };

      return formatToolResponse(data);
    })
  );
}
