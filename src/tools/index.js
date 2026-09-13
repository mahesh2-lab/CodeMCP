import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { registerListFilesTool } from "./listFiles.js";
import { registerReadFileTool } from "./readFile.js";
import { registerWriteFileTool } from "./writeFile.js";
import { registerSearchCodeTool } from "./searchCode.js";
import { registerDeleteFileTool } from "./deleteFile.js";
import { registerExecuteCommandTool } from "./executeCommand.js";
import { registerProjectContextTool } from "./projectContext.js";
import { createToolContext, wrapToolHandler, formatToolResponse } from "./context.js";

export function registerTools(server, project) {
  const ctx = createToolContext(server, project);
  const permission = (project?.permission || "both").toLowerCase();

  // Always register context tool
  if (project) {
    registerProjectContextTool(ctx);
  }

  // Read tools
  if (permission === "read" || permission === "both") {
    registerListFilesTool(ctx);
    registerReadFileTool(ctx);
    registerSearchCodeTool(ctx);
  }

  // Write & execution tools
  if (permission === "write" || permission === "both") {
    registerWriteFileTool(ctx);
    registerDeleteFileTool(ctx);
    registerExecuteCommandTool(ctx);
  }

  // Wrap tools/call handler to normalize missing or null arguments from external AI clients
  if (server?.server?._requestHandlers) {
    const rawCallHandler = server.server._requestHandlers.get("tools/call");
    if (rawCallHandler) {
      server.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
        if (
          request.params &&
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
