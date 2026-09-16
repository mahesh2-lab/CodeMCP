import { z } from "zod";
import { createToolContext, wrapToolHandler, formatToolResponse } from "./context.js";

export function registerAskQuestionTool(serverOrCtx, project) {
  const ctx = serverOrCtx?.guard ? serverOrCtx : createToolContext(serverOrCtx, project);
  const { server } = ctx;
  server.registerTool("ask_question", {
    description: "Ask the connected user a question using MCP elicitation when supported by the client.",
    inputSchema: {
      question: z.string().min(1).max(4000).describe("Question to ask the user"),
      options: z.array(z.string().min(1).max(200)).max(20).optional().describe("Optional selectable answers"),
    },
  }, wrapToolHandler("QUESTION", async (args) => {
    const question = String(args.question).trim();
    const mcpServer = server?.server;
    if (mcpServer && typeof mcpServer.elicitInput === "function") {
      const properties = args.options?.length
        ? { answer: { type: "string", enum: args.options } }
        : { answer: { type: "string", title: "Answer" } };
      const result = await mcpServer.elicitInput({
        message: question,
        requestedSchema: { type: "object", properties, required: ["answer"] },
      });
      return formatToolResponse({ question, result }, result?.content?.answer ? `User answered: ${result.content.answer}` : `Question ended with action: ${result?.action || "unknown"}`);
    }
    return formatToolResponse({ question, options: args.options || [], requiresClientInteraction: true }, `User input required: ${question}`);
  }));
}
