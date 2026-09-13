import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  resolveSafe,
  isIgnored,
  PathGuardError,
  PROJECT_ROOT,
} from "../utils/pathGuard.js";
import { logger } from "../utils/logger.js";

export function registerWriteFileTool(server, project) {
  const projectRoot = project?.root || PROJECT_ROOT;

  server.registerTool(
    "write_file",
    {
      description:
        "Creates or overwrites a file with the specified content inside the project directory.",
      inputSchema: {
        path: z.string().describe("File path relative to the project root, e.g. src/index.js"),
        content: z.string().describe("The complete text content to write into the file"),
      },
      outputSchema: {
        success: z.boolean().describe("Whether write operation succeeded"),
        path: z.string().describe("Normalized file path relative to project root"),
        bytesWritten: z.number().describe("Number of bytes written to file"),
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
          throw new PathGuardError("Writing to this file is blocked (ignored or sensitive)", 403);
        }

        const dir = path.dirname(absolutePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        const content = args.content ?? "";
        fs.writeFileSync(absolutePath, content, "utf8");
        const normalized = relPath.replace(/\\/g, "/");
        const bytesWritten = Buffer.byteLength(content, "utf8");

        logger.toolWrite(normalized, bytesWritten);

        return {
          structuredContent: {
            success: true,
            path: normalized,
            bytesWritten,
            message: `Successfully wrote ${bytesWritten} bytes to ${normalized}`,
          },
          content: [
            {
              type: "text",
              text: `Successfully wrote ${bytesWritten} bytes to ${normalized}`,
            },
          ],
        };
      } catch (err) {
        const target = (args?.path || "").replace(/\\/g, "/");
        if (err.statusCode === 403 || err.message?.includes("blocked") || err.message?.includes("escapes")) {
          logger.blocked("WRITE", target, err.message);
        } else {
          logger.warn("WRITE", target, err.message);
        }
        return {
          isError: true,
          content: [{ type: "text", text: `Error: ${err.message}` }],
        };
      }
    }
  );
}
