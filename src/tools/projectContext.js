import { logger } from "../utils/logger.js";
import { loadMemory, formatMemoryForInstructions } from "../services/memory.js";
import { createToolContext, wrapToolHandler, formatToolResponse } from "./context.js";

/**
 * Registers the `get_project_context` tool with the MCP server.
 * Returns project identification, technology stack, description, contextual guidelines,
 * and the latest cross-assistant session memory.
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer | import("./context.js").ToolContext} serverOrCtx - The MCP server instance or shared tool context
 * @param {object} [project] - The scoped project definition (if server instance provided directly)
 */
export function registerProjectContextTool(serverOrCtx, project) {
  const ctx = serverOrCtx?.guard ? serverOrCtx : createToolContext(serverOrCtx, project);
  const { server: mcpServer, project: proj, projectRoot } = ctx;

  mcpServer.registerTool(
    "get_project_context",
    {
      description: "Returns metadata, description, tech stack, contextual guidelines, and cross-session memory for this project.",
      inputSchema: {},
    },
    wrapToolHandler("CONTEXT", async () => {
      logger.toolContext(proj?.contextFile);

      const memory = await loadMemory(projectRoot);
      const memoryText = await formatMemoryForInstructions(projectRoot);

      const data = {
        id: proj?.id || "project",
        name: proj?.name || "Project",
        description: proj?.description || "",
        techStack: Array.isArray(proj?.techStack) ? proj.techStack : [],
        context: proj?.context || "",
        memory: {
          lastHandoff: memory.lastHandoff,
          recentActions: memory.recentActions.slice(-5),
        },
      };

      const displayText = [
        `# ${data.name} (${data.id})`,
        data.description ? `\n${data.description}` : "",
        data.techStack.length ? `\nTech Stack: ${data.techStack.join(", ")}` : "",
        data.context ? `\n--- Context & Guidelines ---\n${data.context}` : "",
        memoryText ? `\n--- Cross-Assistant Session Memory ---\n${memoryText}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      return formatToolResponse(data, displayText);
    })
  );
}
