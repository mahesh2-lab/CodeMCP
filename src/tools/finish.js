import { z } from "zod";
import { createToolContext, wrapToolHandler, formatToolResponse } from "./context.js";

export function registerFinishTool(serverOrCtx, project) {
  const ctx = serverOrCtx?.guard ? serverOrCtx : createToolContext(serverOrCtx, project);
  const { server } = ctx;
  server.registerTool("finish", {
    description: "Explicitly mark an agent task as finished and return a structured final result.",
    inputSchema: {
      summary: z.string().min(1).max(10000).describe("Final summary of the completed task"),
      success: z.boolean().optional().describe("Whether the task completed successfully; defaults to true"),
      nextSteps: z.string().optional().describe("Optional remaining work or follow-up"),
    },
  }, wrapToolHandler("FINISH", async (args) => {
    const success = args.success !== false;
    const summary = String(args.summary).trim();
    const nextSteps = args.nextSteps ? String(args.nextSteps).trim() : "";
    return formatToolResponse({ finished: true, success, summary, nextSteps }, summary + (nextSteps ? `\n\nNext steps: ${nextSteps}` : ""));
  }));
}
