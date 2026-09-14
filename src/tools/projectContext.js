import { logger } from "../utils/logger.js";
import { createToolContext, wrapToolHandler, formatToolResponse } from "./context.js";

/**
 * Registers the `get_project_context` tool with the MCP server.
 * Returns project identification, technology stack, description, and guidelines.
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer | import("./context.js").ToolContext} serverOrCtx - The MCP server instance or shared tool context
 * @param {object} [project] - The scoped project definition (if server instance provided directly)
 */
export function registerProjectContextTool(serverOrCtx, project) {
  const ctx = serverOrCtx?.guard ? serverOrCtx : createToolContext(serverOrCtx, project);
  const { server: mcpServer, project: proj } = ctx;

  mcpServer.registerTool(
    "get_project_context",
    {
      description: "Returns metadata, description, tech stack, and contextual guidelines for this project.",
      inputSchema: {},
    },
    wrapToolHandler("CONTEXT", async () => {
      logger.toolContext(proj?.contextFile);

      const data = {
        id: proj?.id || "project",
        name: proj?.name || "Project",
        description: proj?.description || "",
        techStack: Array.isArray(proj?.techStack) ? proj.techStack : [],
        context: proj?.context || "",
      };

      return formatToolResponse(data);
    })
  );
}
