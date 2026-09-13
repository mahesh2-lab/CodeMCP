import { z } from "zod";
import {
  resolveSafe,
  assertExistsAndAllowed,
  walk,
  PathGuardError,
  PROJECT_ROOT,
} from "../utils/pathGuard.js";
import { logger } from "../utils/logger.js";

export function registerListFilesTool(server, project) {
  const projectRoot = project?.root || PROJECT_ROOT;

  server.registerTool(
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
      outputSchema: {
        count: z.number().describe("Total number of files listed"),
        path: z.string().describe("Directory path searched"),
        files: z.array(z.string()).describe("List of file paths relative to project root"),
      },
    },
    async (args) => {
      try {
        const subPath = args?.path || ".";
        const absoluteStart = resolveSafe(subPath, projectRoot);
        const stat = assertExistsAndAllowed(absoluteStart, projectRoot);

        if (!stat.isDirectory()) {
          throw new PathGuardError("Path is not a directory", 400);
        }

        const files = [];
        walk(absoluteStart, subPath === "." ? "" : subPath.replace(/\\/g, "/"), files, projectRoot);

        logger.toolList(subPath, files.length);

        const sortedFiles = files.sort();
        const data = {
          count: sortedFiles.length,
          path: subPath,
          files: sortedFiles,
        };

        return {
          structuredContent: data,
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (err) {
        const target = (args?.path || ".").replace(/\\/g, "/");
        if (err.statusCode === 403 || err.message?.includes("blocked") || err.message?.includes("escapes")) {
          logger.blocked("LIST", target, err.message);
        } else {
          logger.warn("LIST", target, err.message);
        }
        return {
          isError: true,
          content: [{ type: "text", text: `Error: ${err.message}` }],
        };
      }
    }
  );
}
