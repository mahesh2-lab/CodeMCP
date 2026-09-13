import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  PROJECT_ROOT,
  walk,
  resolveSafe,
  isIgnored,
} from "../utils/pathGuard.js";
import { logger } from "../utils/logger.js";

export function registerSearchCodeTool(server, project) {
  const projectRoot = project?.root || PROJECT_ROOT;

  server.registerTool(
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
      outputSchema: {
        query: z.string().describe("Search query or pattern"),
        totalMatches: z.number().describe("Total number of line matches found"),
        matchedFilesCount: z.number().describe("Number of distinct files with matches"),
        matches: z.array(
          z.object({
            file: z.string().describe("Relative file path"),
            line: z.number().describe("1-indexed line number"),
            content: z.string().describe("Matching line snippet"),
          })
        ).describe("Matching lines with line numbers"),
      },
    },
    async (args) => {
      const query = args?.query?.trim();
      if (!query) {
        return { isError: true, content: [{ type: "text", text: "Error: query is required" }] };
      }

      const isRegex = Boolean(args?.isRegex);
      const caseSensitive = Boolean(args?.caseSensitive);
      const maxResults = Math.min(Math.max(args?.maxResults || 30, 1), 100);

      let matcher;
      try {
        matcher = isRegex
          ? new RegExp(query, caseSensitive ? "g" : "gi")
          : null;
      } catch (err) {
        logger.warn("SEARCH", query, `Invalid regex: ${err.message}`);
        return { isError: true, content: [{ type: "text", text: `Invalid regex: ${err.message}` }] };
      }

      // Collect eligible project files
      const allFiles = [];
      walk(projectRoot, "", allFiles, projectRoot);

      // Skip large binary or minified extensions
      const binaryExts = new Set([
        ".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf", ".zip", ".tar",
        ".gz", ".exe", ".dll", ".so", ".dylib", ".woff", ".woff2", ".ttf",
      ]);

      const matches = [];
      const matchedFiles = new Set();

      for (const relFile of allFiles) {
        if (matches.length >= maxResults) break;

        const ext = path.extname(relFile).toLowerCase();
        if (binaryExts.has(ext)) continue;

        try {
          const absPath = resolveSafe(relFile, projectRoot);
          if (isIgnored(absPath, projectRoot)) continue;

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

      const data = {
        query,
        totalMatches: matches.length,
        matchedFilesCount: matchedFiles.size,
        matches,
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
    }
  );
}
