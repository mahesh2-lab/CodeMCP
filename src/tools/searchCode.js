import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { PathGuardError } from "../utils/pathGuard.js";
import { logger } from "../utils/logger.js";
import { createToolContext, wrapToolHandler, formatToolResponse } from "./context.js";

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf", ".zip", ".tar",
  ".gz", ".exe", ".dll", ".so", ".dylib", ".woff", ".woff2", ".ttf",
]);

export function registerSearchCodeTool(server, project) {
  const ctx = server?.guard ? server : createToolContext(server, project);
  const { server: mcpServer, guard } = ctx;

  mcpServer.registerTool(
    "search_code",
    {
      description:
        "Searches for a text string or pattern across project source files (respects .mcpignore). Returns matching files and line numbers.",
      inputSchema: {
        query: z.string().describe("Text or regex pattern to search for"),
        isRegex: z.boolean().optional().describe("Treat query as a regular expression (default: false)"),
        caseSensitive: z.boolean().optional().describe("Match case sensitively (default: false)"),
        maxResults: z.number().optional().describe("Maximum number of line matches to return (default: 30)"),
      },
    },
    wrapToolHandler("SEARCH", async (args) => {
      const query = args?.query?.trim();
      if (!query) {
        throw new PathGuardError("Query is required", 400);
      }

      const isRegex = Boolean(args?.isRegex);
      const caseSensitive = Boolean(args?.caseSensitive);
      const maxResults = Math.min(Math.max(args?.maxResults || 30, 1), 100);

      let matcher = null;
      try {
        if (isRegex) {
          matcher = new RegExp(query, caseSensitive ? "g" : "gi");
        }
      } catch (err) {
        throw new PathGuardError(`Invalid regex: ${err.message}`, 400);
      }

      const allFiles = [];
      guard.walk(guard.root, "", allFiles);

      const matches = [];
      const matchedFiles = new Set();

      for (const relFile of allFiles) {
        if (matches.length >= maxResults) break;

        const ext = path.extname(relFile).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) continue;

        try {
          const absPath = guard.resolveSafe(relFile);
          if (guard.isIgnored(absPath)) continue;

          const content = fs.readFileSync(absPath, "utf8");
          const lines = content.split(/\r?\n/);

          for (let i = 0; i < lines.length; i++) {
            if (matches.length >= maxResults) break;
            const line = lines[i];

            let matched = false;
            if (isRegex && matcher) {
              matcher.lastIndex = 0;
              matched = matcher.test(line);
            } else if (caseSensitive) {
              matched = line.includes(query);
            } else {
              matched = line.toLowerCase().includes(query.toLowerCase());
            }

            if (matched) {
              matchedFiles.add(relFile);
              matches.push({
                file: relFile,
                line: i + 1,
                content: line.trim().slice(0, 160),
              });
            }
          }
        } catch {}
      }

      logger.toolSearch(query, matches.length, matchedFiles.size);

      return formatToolResponse({
        query,
        totalMatches: matches.length,
        matchedFilesCount: matchedFiles.size,
        matches,
      });
    })
  );
}
