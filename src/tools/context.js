import { createScopedPathGuard, getProjectRoot, toPosix } from "../utils/pathGuard.js";
import { logger } from "../utils/logger.js";

/**
 * @typedef {object} ToolContext
 * @property {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server - The active MCP server instance
 * @property {object} [project] - The scoped project definition and metadata
 * @property {string} projectRoot - Absolute path to the resolved project root directory
 * @property {ReturnType<typeof createScopedPathGuard>} guard - Scoped path guard utility instance
 */

/**
 * @typedef {object} McpToolResponse
 * @property {boolean} [isError] - Indicates whether the tool execution resulted in an error
 * @property {object} [structuredContent] - Machine-readable payload for programmatic consumers
 * @property {Array<{ type: "text", text: string }>} content - Human- and LLM-readable text content
 */

/**
 * Creates execution context and path guards for tools.
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server - Active MCP server instance
 * @param {object} [project] - Project configuration
 * @returns {ToolContext} Initialized tool context
 */
export function createToolContext(server, project) {
  const projectRoot = project?.root || getProjectRoot();
  const guard = createScopedPathGuard(projectRoot);

  return {
    server,
    project,
    projectRoot,
    guard,
  };
}

/**
 * Wraps a tool handler with logging, security checks, and standard error handling.
 *
 * @param {string} action - Action label (e.g. READ, WRITE, EXEC)
 * @param {(args: any) => Promise<McpToolResponse | object>} handlerFn - Tool handler function
 * @returns {(args: any) => Promise<McpToolResponse>} Safe handler function
 */
export function wrapToolHandler(action, handlerFn) {
  return async (args) => {
    const reqId = logger.generateRequestId();
    return logger.runWithRequestId(reqId, async () => {
      try {
        const safeArgs = args && typeof args === "object" && !Array.isArray(args) ? args : {};
        const result = await handlerFn(safeArgs);
        return result;
      } catch (err) {
        const rawTarget = args?.path || args?.command || args?.query || ".";
        const target = toPosix(String(rawTarget));

        const message = err?.message || String(err) || "Unknown error occurred";
        const statusCode = err?.statusCode || (err?.status ? Number(err.status) : undefined);

        const isBlocked =
          statusCode === 403 ||
          /blocked|escapes|prohibited|unauthorized|forbidden/i.test(message);

        const isConfigFile =
          target === "codemcp.json" ||
          /(^|\/)codemcp(?:\.[^/]+)?$/i.test(target);

        if (!isConfigFile) {
          if (isBlocked) {
            logger.blocked(action, target, message);
          } else {
            logger.warn(action, target, message);
          }
        }

        let responseText;
        if (isBlocked) {
          responseText = message.toLowerCase().startsWith("blocked")
            ? message.replace(/^blocked:\s*/i, "Blocked: ")
            : `Blocked: ${message}`;
        } else if (message.startsWith("Error:")) {
          responseText = message;
        } else {
          responseText = `Error: ${message}`;
        }

        const errorResponse = {
          isError: true,
          content: [{ type: "text", text: responseText }],
        };

        if (err?.structuredContent && typeof err.structuredContent === "object") {
          errorResponse.structuredContent = err.structuredContent;
        }

        return errorResponse;
      }
    });
  };
}

/** Max tool text response length (250 KB) */
export const MAX_TOOL_RESPONSE_CHARS = 250_000;

/**
 * Formats structured content and text into a standard MCP tool response.
 *
 * @param {object} structuredContent - Machine-readable payload
 * @param {string} [textMessage] - Optional custom text or markdown message
 * @returns {McpToolResponse} Standardized response object
 */
export function formatToolResponse(structuredContent, textMessage) {
  let text = textMessage;
  if (text === undefined) {
    try {
      text = JSON.stringify(structuredContent, null, 2);
    } catch {
      text = String(structuredContent);
    }
  }

  if (typeof text === "string" && text.length > MAX_TOOL_RESPONSE_CHARS) {
    text =
      text.slice(0, MAX_TOOL_RESPONSE_CHARS) +
      `\n\n... [Response truncated: output exceeded ${MAX_TOOL_RESPONSE_CHARS.toLocaleString()} character limit]`;
  }

  return {
    structuredContent,
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}
