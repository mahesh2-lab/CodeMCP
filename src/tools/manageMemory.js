import { z } from "zod";
import { logger } from "../utils/logger.js";
import { PathGuardError } from "../utils/pathGuard.js";
import { loadMemory, recordHandoff, formatMemoryForInstructions } from "../services/memory.js";
import { createToolContext, wrapToolHandler, formatToolResponse } from "./context.js";

/**
 * Registers `record_memory` and `get_memory` tools with the MCP server,
 * enabling AI assistants to preserve and inspect cross-session context.
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer | import("./context.js").ToolContext} serverOrCtx
 * @param {object} [project]
 */
export function registerMemoryTools(serverOrCtx, project) {
  const ctx = serverOrCtx?.guard ? serverOrCtx : createToolContext(serverOrCtx, project);
  const { server: mcpServer, projectRoot } = ctx;

  const projectRef = ctx.project || projectRoot;

  // 1. Record / Update Handoff Memory
  mcpServer.registerTool(
    "record_memory",
    {
      description:
        "Saves a session handoff note (summary of completed work, architectural decisions, and next steps) so subsequent AI assistants or sessions have full context.",
      inputSchema: {
        summary: z
          .string()
          .describe("Summary of tasks completed, components updated, and current system state"),
        decisions: z
          .string()
          .optional()
          .describe("Key architectural or design decisions made (e.g. chosen library or pattern)"),
        nextSteps: z
          .string()
          .optional()
          .describe("Recommended next steps, pending tests, or unfinished tasks"),
      },
    },
    wrapToolHandler("MEMORY", async (args) => {
      const summary = args?.summary?.trim();
      if (!summary) {
        throw new PathGuardError("summary is required to record memory", 400);
      }

      const client = logger.getActiveClient();
      const updatedMemory = await recordHandoff(projectRef, {
        summary,
        decisions: args?.decisions,
        nextSteps: args?.nextSteps,
        client,
      });

      const message = `Successfully saved memory note for project "${updatedMemory.projectName || "active"}" from ${client}.`;

      return formatToolResponse(
        {
          success: true,
          projectId: updatedMemory.projectId,
          projectName: updatedMemory.projectName,
          client,
          lastHandoff: updatedMemory.lastHandoff,
          message,
        },
        `${message}\n\n• Summary: ${summary}${args?.decisions ? `\n• Decisions: ${args.decisions}` : ""}${args?.nextSteps ? `\n• Next Steps: ${args.nextSteps}` : ""}`
      );
    })
  );

  // 2. Retrieve Cross-Session Memory
  mcpServer.registerTool(
    "get_memory",
    {
      description:
        "Retrieves shared cross-assistant project memory, including the latest session handoff notes and recent workspace actions.",
      inputSchema: {},
    },
    wrapToolHandler("MEMORY", async () => {
      const memory = await loadMemory(projectRef);
      const formattedView = await formatMemoryForInstructions(projectRef);

      return formatToolResponse(
        {
          projectId: memory.projectId,
          projectName: memory.projectName,
          version: memory.version,
          lastHandoff: memory.lastHandoff,
          recentActionsCount: memory.recentActions.length,
          recentActions: memory.recentActions,
        },
        formattedView || `No previous session notes recorded yet for ${memory.projectName}. Call record_memory to create a handoff.`
      );
    })
  );
}
