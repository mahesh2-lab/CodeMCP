import fs from "node:fs";
import { z } from "zod";
import {
  resolveSafe,
  assertExistsAndAllowed,
  PathGuardError,
  PROJECT_ROOT,
} from "../utils/pathGuard.js";
import { logger } from "../utils/logger.js";

export function registerReadFileTool(server, project) {
  const projectRoot = project?.root || PROJECT_ROOT;

  server.registerTool(
    "read_file",
    {
      description: "Reads one file's full contents given a path relative to the project root.",
      inputSchema: {
        path: z.string().describe("File path relative to project root, e.g. index.js or package.json"),
      },
      outputSchema: {
        path: z.string().describe("Path of the file relative to project root"),
        size: z.number().describe("File size in bytes"),
        content: z.string().describe("Complete text content of the file"),
      },
    },
    async (args) => {
      try {
        const relPath = args?.path;
        if (!relPath || typeof relPath !== "string") {
          throw new PathGuardError("Path is required", 400);
        }

        const absolutePath = resolveSafe(relPath, projectRoot);
        const stat = assertExistsAndAllowed(absolutePath, projectRoot);

        if (!stat.isFile()) {
          throw new PathGuardError("Path is not a file", 400);
        }

        const content = fs.readFileSync(absolutePath, "utf8");
        const normalized = relPath.replace(/\\/g, "/");

        logger.toolRead(normalized, stat.size);

        return {
          structuredContent: {
            path: normalized,
            size: stat.size,
            content,
          },
          content: [
            {
              type: "text",
              text: `File: ${normalized} (${stat.size} bytes)\n\n${content}`,
            },
          ],
        };
      } catch (err) {
        const target = (args?.path || "").replace(/\\/g, "/");
        if (err.statusCode === 403 || err.message?.includes("blocked") || err.message?.includes("escapes")) {
          logger.blocked("READ", target, err.message);
        } else {
          logger.warn("READ", target, err.message);
        }
        return {
          isError: true,
          content: [{ type: "text", text: `Error: ${err.message}` }],
        };
      }
    }
  );
}
