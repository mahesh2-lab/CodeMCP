import { createScopedPathGuard, PROJECT_ROOT } from "../utils/pathGuard.js";
import { logger } from "../utils/logger.js";

/**
 * Creates a scoped execution context for all tools, eliminating parameter drilling
 * of projectRoot and customRoot down into each file and helper.
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {object} project
 */
export function createToolContext(server, project) {
  const projectRoot = project?.root || PROJECT_ROOT;
  const guard = createScopedPathGuard(projectRoot);

  return {
    server,
    project,
    projectRoot,
    guard,
  };
}

/**
 * Wraps a tool handler with standardized parameter checking, error logging,
 * and unified MCP error formatting, eliminating identical catch blocks across tools.
 *
 * @param {string} action - Action label for logger (e.g. "READ", "WRITE", "DELETE", "LIST")
 * @param {function} handlerFn - Async function (args) => response
 * @returns {function}
 */
export function wrapToolHandler(action, handlerFn) {
  return async (args) => {
    try {
      return await handlerFn(args);
    } catch (err) {
      const rawTarget = args?.path || args?.command || args?.query || ".";
      const target = String(rawTarget).replace(/\\/g, "/");

      const isBlocked =
        err.statusCode === 403 ||
        err.message?.includes("blocked") ||
        err.message?.includes("escapes") ||
        err.message?.includes("prohibited");

      if (isBlocked) {
        logger.blocked(action, target, err.message);
      } else {
        logger.warn(action, target, err.message);
      }

      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${err.message}` }],
      };
    }
  };
}

/**
 * Formats standard MCP dual structured/text responses.
 *
 * @param {object} structuredContent
 * @param {string} [textMessage]
 */
export function formatToolResponse(structuredContent, textMessage) {
  return {
    structuredContent,
    content: [
      {
        type: "text",
        text: textMessage !== undefined ? textMessage : JSON.stringify(structuredContent, null, 2),
      },
    ],
  };
}
