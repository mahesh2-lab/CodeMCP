import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { registerListFilesTool } from "./listFiles.js";
import { registerReadFileTool } from "./readFile.js";
import { registerWriteFileTool } from "./writeFile.js";
import { registerSearchCodeTool } from "./searchCode.js";
import { registerDeleteFileTool } from "./deleteFile.js";
import { registerExecuteCommandTool } from "./executeCommand.js";
import { registerProjectContextTool } from "./projectContext.js";
import { createToolContext, wrapToolHandler, formatToolResponse } from "./context.js";

/**
 * Registers all project-scoped tools with the provided MCP server instance
 * based on the project's permission configuration ('read', 'write', or 'both').
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server - The McpServer instance
 * @param {object} [project] - The active project metadata and permission configuration
 */
export function registerTools(server, project) {
  const ctx = createToolContext(server, project);
  const permission = (project?.permission || "both").toLowerCase();

  // 1. Metadata and Context Tool (always available if project is active)
  if (project) {
    registerProjectContextTool(ctx);
  }

  // 2. Read-only inspection tools
  if (permission === "read" || permission === "both") {
    registerListFilesTool(ctx);
    registerReadFileTool(ctx);
    registerSearchCodeTool(ctx);
  }

  // 3. Mutation and execution tools
  if (permission === "write" || permission === "both") {
    registerWriteFileTool(ctx);
    registerDeleteFileTool(ctx);
    registerExecuteCommandTool(ctx);
  }

  // 4. Client Compatibility Bridge:
  // External MCP clients (e.g. Claude Desktop, Cursor) may omit the `arguments` field
  // or supply null/undefined when invoking zero-parameter tools. We intercept and normalize
  // the `tools/call` schema handler to provide an empty object `{}` fallback.
  if (server?.server?._requestHandlers && typeof server.server._requestHandlers.get === "function") {
    const rawCallHandler = server.server._requestHandlers.get("tools/call");
    if (rawCallHandler && typeof server.server.setRequestHandler === "function") {
      server.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
        if (
          request?.params &&
          (request.params.arguments === undefined ||
            request.params.arguments === null ||
            typeof request.params.arguments !== "object" ||
            Array.isArray(request.params.arguments))
        ) {
          request.params.arguments = {};
        }
        return await rawCallHandler(request, extra);
      });
    }
  }
}

export {
  createToolContext,
  wrapToolHandler,
  formatToolResponse,
  registerListFilesTool,
  registerReadFileTool,
  registerWriteFileTool,
  registerSearchCodeTool,
  registerDeleteFileTool,
  registerExecuteCommandTool,
  registerProjectContextTool,
};
