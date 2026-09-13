import { z } from "zod";
import { logger } from "../utils/logger.js";

export function registerProjectContextTool(server, project) {
  server.registerTool(
    "get_project_context",
    {
      description: "Returns metadata, description, tech stack, and contextual guidelines for this project.",
      inputSchema: {},
      outputSchema: {
        id: z.string().describe("Project identifier"),
        name: z.string().describe("Project display name"),
        description: z.string().describe("Project description"),
        techStack: z.array(z.string()).describe("List of technologies used in the project"),
        context: z.string().describe("Contextual guidelines, coding rules, and architecture instructions"),
      },
    },
    async () => {
      logger.toolContext(project?.contextFile);
      const data = {
        id: project.id,
        name: project.name,
        description: project.description || "",
        techStack: project.techStack || [],
        context: project.context || "",
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
