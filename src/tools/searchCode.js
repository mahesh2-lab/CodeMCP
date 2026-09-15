import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { rgPath } from "@vscode/ripgrep";
import { z } from "zod";
import { PathGuardError, BINARY_EXTENSIONS, toPosix, isBinaryBuffer } from "../utils/pathGuard.js";
import { logger } from "../utils/logger.js";
import {
  createToolContext,
  wrapToolHandler,
  formatToolResponse,
} from "./context.js";

/** Max file size (2 MB) to read and search into memory to prevent OOM and event loop stalls */
const MAX_SEARCH_FILE_SIZE_BYTES = 2 * 1024 * 1024;

/** Maximum length of a search query string to mitigate ReDoS and buffer abuse */
const MAX_QUERY_LENGTH = 500;

/** Default and maximum limits for returned matching lines */
const DEFAULT_MAX_RESULTS = 30;
const ABSOLUTE_MAX_RESULTS = 100;


/**
 * Searches code using the high-performance ripgrep native binary.
 *
 * @param {object} options
 * @param {string} options.query - The search query
 * @param {string} options.searchDir - Directory to search in
 * @param {string} options.projectRoot - Project root directory
 * @param {boolean} options.isRegex - Whether to treat query as regex
 * @param {boolean} options.caseSensitive - Case sensitivity
 * @param {number} options.maxResults - Maximum matches to collect
 * @param {ReturnType<typeof import("../utils/pathGuard.js").createScopedPathGuard>} options.guard - PathGuard instance
 * @returns {Promise<{ matches: Array<{ file: string, line: number, content: string }>, matchedFiles: Set<string> }>}
 */
async function searchWithRipgrep({
  query,
  searchDir,
  projectRoot,
  isRegex,
  caseSensitive,
  maxResults,
  guard,
}) {
  const args = [
    "--json",
    "--max-filesize",
    "2M",
    "--glob",
    "!.git/*",
    "--glob",
    "!.env*",
    "--glob",
    "!node_modules/*",
    "--glob",
    "!.codemcp/*",
  ];

  // Respect .mcpignore if present
  const mcpIgnorePath = path.join(projectRoot, ".mcpignore");
  if (fs.existsSync(mcpIgnorePath)) {
    args.push("--ignore-file", mcpIgnorePath);
  }

  // Case sensitivity & regex flags
  if (caseSensitive) {
    args.push("-s"); // case sensitive
  } else {
    args.push("-i"); // ignore case
  }

  if (isRegex) {
    args.push("--regexp", query);
  } else {
    args.push("-F", query); // fixed strings (literal)
  }

  // Target search path relative to projectRoot
  const targetPath = path.relative(projectRoot, searchDir) || ".";
  args.push(targetPath);

  return new Promise((resolve, reject) => {
    const child = spawn(rgPath, args, {
      cwd: projectRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const matches = [];
    const matchedFiles = new Set();
    let buffer = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      // Keep unfinished line in buffer
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === "match" && parsed.data) {
            const rawFilePath = parsed.data.path?.text;
            if (!rawFilePath) continue;

            const normalizedFile = toPosix(rawFilePath).replace(/^\.\//, "");

            // Security check against PathGuard ignore rules
            try {
              const absPath = guard.resolveSafe(normalizedFile);
              if (guard.isIgnored(absPath)) continue;
            } catch {
              continue;
            }

            const lineNumber = parsed.data.line_number || 1;
            const lineContent = (parsed.data.lines?.text || "")
              .trim()
              .slice(0, 200);

            matchedFiles.add(normalizedFile);
            matches.push({
              file: normalizedFile,
              line: lineNumber,
              content: lineContent,
            });

            if (matches.length >= maxResults) {
              child.kill();
              break;
            }
          }
        } catch {
          // Ignore non-JSON or partial lines
        }
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code) => {
      // Process remaining buffer
      if (buffer.trim() && matches.length < maxResults) {
        try {
          const parsed = JSON.parse(buffer);
          if (parsed.type === "match" && parsed.data) {
            const rawFilePath = parsed.data.path?.text;
            if (rawFilePath) {
              const normalizedFile = toPosix(rawFilePath).replace(/^\.\//, "");
              const lineNumber = parsed.data.line_number || 1;
              const lineContent = (parsed.data.lines?.text || "")
                .trim()
                .slice(0, 200);

              matchedFiles.add(normalizedFile);
              matches.push({
                file: normalizedFile,
                line: lineNumber,
                content: lineContent,
              });
            }
          }
        } catch {}
      }

      // Exit code 0 (match) or 1 (no match) are normal ripgrep statuses
      // If code is null, process was killed early due to maxResults limit
      if (code === 0 || code === 1 || code === null) {
        resolve({ matches, matchedFiles });
      } else if (code === 2) {
        // Syntax error in regular expression or arguments
        const cleanErr =
          stderr.replace(/^rg:\s*/i, "").trim() || "Ripgrep search error";
        reject(
          new PathGuardError(`Invalid regular expression: ${cleanErr}`, 400),
        );
      } else {
        reject(new Error(`Ripgrep exited with code ${code}: ${stderr}`));
      }
    });
  });
}

/**
 * Fallback JavaScript file walker search if native ripgrep fails to launch.
 */
async function fallbackJsSearch({
  query,
  searchAbsolute,
  scopeSubPath,
  isRegex,
  caseSensitive,
  maxResults,
  guard,
}) {
  let matcher = null;
  if (isRegex) {
    matcher = new RegExp(query, caseSensitive ? "g" : "gi");
  }

  const allFiles = [];
  const prefix = scopeSubPath === "." ? "" : toPosix(scopeSubPath);
  guard.walk(searchAbsolute, prefix, allFiles);

  const matches = [];
  const matchedFiles = new Set();
  const lowerQuery = query.toLowerCase();

  for (const relFile of allFiles) {
    if (matches.length >= maxResults) break;

    const ext = path.extname(relFile).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) continue;

    try {
      const absPath = guard.resolveSafe(relFile);
      if (guard.isIgnored(absPath)) continue;

      const stat = await fsp.stat(absPath);
      if (stat.size > MAX_SEARCH_FILE_SIZE_BYTES || stat.size === 0) continue;

      // Early binary content sniffing: check first 512 bytes before reading full content
      const handle = await fsp.open(absPath, "r");
      let isBinary = false;
      try {
        const sniffBuffer = Buffer.alloc(Math.min(512, stat.size));
        await handle.read(sniffBuffer, 0, sniffBuffer.length, 0);
        isBinary = isBinaryBuffer(sniffBuffer);
      } finally {
        await handle.close();
      }
      if (isBinary) continue;

      const content = await fsp.readFile(absPath, "utf8");
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
          matched = line.toLowerCase().includes(lowerQuery);
        }

        if (matched) {
          matchedFiles.add(relFile);
          matches.push({
            file: relFile,
            line: i + 1,
            content: line.trim().slice(0, 200),
          });
        }
      }
    } catch {
      // Ignore unreadable or transient files
    }
  }

  return { matches, matchedFiles };
}

/**
 * Registers the `search_code` tool with the MCP server.
 * Searches across project source files for a string or regex pattern using high-performance
 * native ripgrep, respecting `.mcpignore`, `.gitignore`, and binary boundaries.
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer | import("./context.js").ToolContext} serverOrCtx - The MCP server instance or shared tool context
 * @param {object} [project] - The scoped project definition (if server instance provided directly)
 */
export function registerSearchCodeTool(serverOrCtx, project) {
  const ctx = serverOrCtx?.guard
    ? serverOrCtx
    : createToolContext(serverOrCtx, project);
  const { server: mcpServer, guard } = ctx;

  mcpServer.registerTool(
    "search_code",
    {
      description:
        "Searches for a text string or pattern across project source files (respects .mcpignore). Returns matching files and line numbers.",
      inputSchema: {
        query: z.string().describe("Text or regex pattern to search for"),
        path: z
          .string()
          .optional()
          .describe(
            "Optional subfolder relative to project root to limit search to (default: '.')",
          ),
        isRegex: z
          .boolean()
          .optional()
          .describe("Treat query as a regular expression (default: false)"),
        caseSensitive: z
          .boolean()
          .optional()
          .describe("Match case sensitively (default: false)"),
        maxResults: z
          .number()
          .optional()
          .describe(
            "Maximum number of line matches to return (default: 30, max: 100)",
          ),
      },
    },
    wrapToolHandler("SEARCH", async (args) => {
      const query = args?.query?.trim();
      if (!query) {
        throw new PathGuardError("Query is required", 400);
      }

      if (query.length > MAX_QUERY_LENGTH) {
        throw new PathGuardError(
          `Search query exceeds maximum length of ${MAX_QUERY_LENGTH} characters`,
          400,
        );
      }

      const isRegex = Boolean(args?.isRegex);
      const caseSensitive = Boolean(args?.caseSensitive);
      const maxResults = Math.min(
        Math.max(
          typeof args?.maxResults === "number"
            ? args.maxResults
            : DEFAULT_MAX_RESULTS,
          1,
        ),
        ABSOLUTE_MAX_RESULTS,
      );

      const rawScope = args?.path;
      const scopeSubPath =
        typeof rawScope === "string" && rawScope.trim().length > 0
          ? rawScope.trim()
          : ".";
      const startAbsolute = guard.resolveSafe(scopeSubPath);
      const startStat = guard.assertExistsAndAllowed(startAbsolute);

      if (!startStat.isDirectory()) {
        throw new PathGuardError("Search path must be a directory", 400);
      }

      let result;
      try {
        // 1. Fast native ripgrep execution
        result = await searchWithRipgrep({
          query,
          searchDir: startAbsolute,
          projectRoot: guard.root,
          isRegex,
          caseSensitive,
          maxResults,
          guard,
        });
      } catch (err) {
        // If the error was a syntax error in regex, rethrow directly
        if (err instanceof PathGuardError) {
          throw err;
        }

        logger.warn(
          "SEARCH",
          query,
          `Ripgrep failed (${err.message}), falling back to internal JS search`,
        );
        result = await fallbackJsSearch({
          query,
          searchAbsolute: startAbsolute,
          scopeSubPath,
          isRegex,
          caseSensitive,
          maxResults,
          guard,
        });
      }

      const { matches, matchedFiles } = result;

      logger.toolSearch(query, matches.length, matchedFiles.size);

      const linesFormatted = matches
        .map((m) => `${m.file}:${m.line}: ${m.content}`)
        .join("\n");

      const summaryText =
        matches.length === 0
          ? `No matches found for "${query}"`
          : `Found ${matches.length} matches across ${matchedFiles.size} files for "${query}":\n\n${linesFormatted}`;

      return formatToolResponse(
        {
          query,
          totalMatches: matches.length,
          matchedFilesCount: matchedFiles.size,
          matches,
        },
        summaryText,
      );
    }),
  );
}
