import fs from "node:fs";
import { z } from "zod";
import { PathGuardError } from "../utils/pathGuard.js";
import { logger } from "../utils/logger.js";
import { createToolContext, wrapToolHandler, formatToolResponse } from "./context.js";

export function registerReadFileTool(server, project) {
  const ctx = server?.guard ? server : createToolContext(server, project);
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
      if (!relPath || typeof relPath !== "string") {
        throw new PathGuardError("Path is required", 400);
      }

      const absolutePath = guard.resolveSafe(relPath);
      const stat = guard.assertExistsAndAllowed(absolutePath);

      if (!stat.isFile()) {
        throw new PathGuardError("Path is not a file", 400);
      }

      const content = fs.readFileSync(absolutePath, "utf8");
      const normalized = relPath.replace(/\\/g, "/");

      logger.toolRead(normalized, stat.size);

      return formatToolResponse(
        { path: normalized, size: stat.size, content },
        `File: ${normalized} (${stat.size} bytes)\n\n${content}`
      );
    })
  );
}
