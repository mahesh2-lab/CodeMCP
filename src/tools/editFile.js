import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { PathGuardError, toPosix } from "../utils/pathGuard.js";
import { verifyActionApproval } from "../services/approval.js";
import { recordAction } from "../services/memory.js";
import { createToolContext, wrapToolHandler, formatToolResponse } from "./context.js";

const MAX_EDIT_BYTES = 10 * 1024 * 1024;

export function registerEditFileTool(serverOrCtx, project) {
  const ctx = serverOrCtx?.guard ? serverOrCtx : createToolContext(serverOrCtx, project);
  const { server, guard, projectRoot } = ctx;
  server.registerTool("edit_file", {
    description: "Edit an existing text file by replacing exact text. Path and sensitive-file protections are enforced.",
    inputSchema: {
      path: z.string().describe("Existing project-relative file path"),
      oldText: z.string().describe("Exact text to replace"),
      newText: z.string().describe("Replacement text"),
      replaceAll: z.boolean().optional().describe("Replace all occurrences; default false"),
      summary: z.string().optional().describe("Brief reason for the edit"),
    },
  }, wrapToolHandler("EDIT", async (args) => {
    const rel = String(args.path || "").trim();
    if (!rel) throw new PathGuardError("Path is required", 400);
    if (!String(args.oldText)) throw new PathGuardError("oldText is required", 400);
    const absolute = guard.resolveSafe(rel);
    const stat = guard.assertExistsAndAllowed(absolute);
    if (!stat.isFile()) throw new PathGuardError("Path is not a file", 400);
    if (stat.size > MAX_EDIT_BYTES) throw new PathGuardError("File exceeds 10 MB edit limit", 400);
    const oldContent = await fs.readFile(absolute, "utf8");
    const needle = String(args.oldText);
    const replacement = String(args.newText ?? "");
    const occurrences = oldContent.split(needle).length - 1;
    if (!occurrences) throw new PathGuardError("oldText was not found in the file", 404);
    const newContent = args.replaceAll ? oldContent.split(needle).join(replacement) : oldContent.replace(needle, replacement);
    const approval = await verifyActionApproval({ project: ctx.project, actionType: "WRITE", path: toPosix(rel), oldContent, newContent });
    if (!approval.approved) return approval.rejectionResponse;
    await fs.writeFile(absolute, newContent, "utf8");
    const normalized = toPosix(rel);
    const count = args.replaceAll ? occurrences : 1;
    recordAction(ctx.project || projectRoot, { action: "EDIT", target: normalized, details: `${count} replacement(s)`, summary: args.summary?.trim() || `Edited ${path.basename(normalized)}` }).catch(() => {});
    return formatToolResponse({ success: true, path: normalized, replacements: count }, `Successfully edited ${normalized} (${count} replacement${count === 1 ? "" : "s"})`);
  }));
}
