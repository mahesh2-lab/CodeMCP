import { logger } from "../utils/logger.js";
import { createToolContext, wrapToolHandler, formatToolResponse } from "./context.js";

export function registerProjectContextTool(server, project) {
  const ctx = server?.guard ? server : createToolContext(server, project);
  const { server: mcpServer, project: proj } = ctx;

  mcpServer.registerTool(
    "get_project_context",
    {
      description: "Returns metadata, description, tech stack, and contextual guidelines for this project.",
    },
    wrapToolHandler("CONTEXT", async () => {
      logger.toolContext(proj?.contextFile);
      const data = {
        id: proj?.id || "project",
        name: proj?.name || "Project",
        description: proj?.description || "",
        techStack: proj?.techStack || [],
        context: proj?.context || "",
      };

      return formatToolResponse(data);
    })
  );
}
