import fs from "node:fs/promises";
import path from "node:path";
import { toPosix } from "../utils/pathGuard.js";

/** Maximum number of recent tool actions retained in the rolling activity journal */
const MAX_RECENT_ACTIONS = 15;

/** In-memory cache keyed by resolved project descriptor cacheKey */
const memoryCache = new Map();

/**
 * Resolves a project object, projectRoot path, or undefined into a canonical
 * project descriptor guaranteeing strict project-level isolation.
 *
 * @param {object|string} [projectOrRoot]
 * @returns {{ root: string, id: string, name: string, cacheKey: string }}
 */
function resolveProjectDescriptor(projectOrRoot) {
  if (!projectOrRoot) {
    const root = path.resolve(".");
    const normalizedRoot = root.toLowerCase();
    const id = path.basename(root);
    return { root, id, name: id, cacheKey: `${normalizedRoot}::${id}` };
  }

  if (typeof projectOrRoot === "string") {
    const root = path.resolve(projectOrRoot);
    const normalizedRoot = root.toLowerCase();
    const id = path.basename(root);
    return { root, id, name: id, cacheKey: `${normalizedRoot}::${id}` };
  }

  const root = path.resolve(projectOrRoot.root || ".");
  const normalizedRoot = root.toLowerCase();
  const id = String(projectOrRoot.id || path.basename(root));
  const name = String(projectOrRoot.name || id);
  return { root, id, name, cacheKey: `${normalizedRoot}::${id}` };
}

/**
 * Returns default empty memory data structure stamped with project identity.
 *
 * @param {{ id: string, name: string, root: string }} desc
 */
function createDefaultMemory(desc) {
  return {
    version: 1,
    projectId: desc.id,
    projectName: desc.name,
    projectRoot: desc.root,
    lastHandoff: null,
    recentActions: [],
  };
}

/**
 * Resolves path to the isolated .codemcp/memory.json for the specified project.
 *
 * @param {object|string} projectOrRoot
 * @returns {string} Absolute path to project's memory.json
 */
export function getMemoryFilePath(projectOrRoot) {
  const desc = resolveProjectDescriptor(projectOrRoot);
  return path.join(desc.root, ".codemcp", "memory.json");
}

/**
 * Loads project memory from in-memory cache or disk with strict project isolation.
 *
 * @param {object|string} projectOrRoot
 * @returns {Promise<{
 *   version: number,
 *   projectId: string,
 *   projectName: string,
 *   projectRoot: string,
 *   lastHandoff: { summary: string, decisions?: string, nextSteps?: string, client: string, updatedAt: string } | null,
 *   recentActions: Array<{ timestamp: string, action: string, target: string, client: string, details?: string }>
 * }>}
 */
export async function loadMemory(projectOrRoot) {
  const desc = resolveProjectDescriptor(projectOrRoot);

  if (memoryCache.has(desc.cacheKey)) {
    return memoryCache.get(desc.cacheKey);
  }

  const filePath = getMemoryFilePath(desc);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(raw);

    // Validate that existing memory file matches this project's identity
    const isSameProject =
      !data.projectRoot ||
      path.resolve(data.projectRoot).toLowerCase() === desc.root.toLowerCase();

    const validData = {
      version: data.version || 1,
      projectId: isSameProject && data.projectId ? data.projectId : desc.id,
      projectName: isSameProject && data.projectName ? data.projectName : desc.name,
      projectRoot: desc.root,
      lastHandoff: isSameProject ? data.lastHandoff || null : null,
      recentActions: isSameProject && Array.isArray(data.recentActions) ? data.recentActions : [],
    };

    memoryCache.set(desc.cacheKey, validData);
    return validData;
  } catch (err) {
    const fresh = createDefaultMemory(desc);
    memoryCache.set(desc.cacheKey, fresh);
    return fresh;
  }
}

/**
 * Persists memory to disk under the project's own directory and updates in-memory cache.
 *
 * @param {object|string} projectOrRoot
 * @param {object} memoryData
 */
async function saveMemory(projectOrRoot, memoryData) {
  const desc = resolveProjectDescriptor(projectOrRoot);
  
  memoryData.projectId = desc.id;
  memoryData.projectName = desc.name;
  memoryData.projectRoot = desc.root;

  memoryCache.set(desc.cacheKey, memoryData);

  const filePath = getMemoryFilePath(desc);
  const dir = path.dirname(filePath);

  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(memoryData, null, 2), "utf8");
  } catch (err) {
    // Non-fatal background write
  }
}

/**
 * Appends a file or command action to the project's rolling activity journal.
 *
 * @param {object|string} projectOrRoot
 * @param {object} actionEntry
 * @param {'WRITE'|'DELETE'|'EXEC'} actionEntry.action
 * @param {string} actionEntry.target
 * @param {string} [actionEntry.client]
 * @param {string} [actionEntry.details]
 * @param {string} [actionEntry.summary]
 * @param {string} [actionEntry.preview]
 */
export async function recordAction(
  projectOrRoot,
  { action, target, client = "AI Assistant", details, summary, preview }
) {
  const desc = resolveProjectDescriptor(projectOrRoot);
  const memory = await loadMemory(desc);

  const entry = {
    timestamp: new Date().toISOString(),
    action,
    target: toPosix(String(target || "")),
    client,
  };

  if (details) {
    entry.details = String(details);
  }
  if (summary) {
    entry.summary = String(summary);
  }
  if (preview) {
    entry.preview = String(preview);
  }

  memory.recentActions.push(entry);

  if (memory.recentActions.length > MAX_RECENT_ACTIONS) {
    memory.recentActions = memory.recentActions.slice(-MAX_RECENT_ACTIONS);
  }

  await saveMemory(desc, memory);
}

/**
 * Records an explicit AI handoff note containing tasks completed,
 * architectural decisions, and pending next steps for the project.
 *
 * @param {object|string} projectOrRoot
 * @param {object} handoff
 * @param {string} handoff.summary
 * @param {string} [handoff.decisions]
 * @param {string} [handoff.nextSteps]
 * @param {string} [handoff.client]
 * @returns {Promise<object>} The updated project memory state
 */
export async function recordHandoff(projectOrRoot, { summary, decisions, nextSteps, client = "AI Assistant" }) {
  const desc = resolveProjectDescriptor(projectOrRoot);
  const memory = await loadMemory(desc);

  memory.lastHandoff = {
    summary: String(summary || "").trim(),
    decisions: decisions ? String(decisions).trim() : "",
    nextSteps: nextSteps ? String(nextSteps).trim() : "",
    client,
    updatedAt: new Date().toISOString(),
  };

  await saveMemory(desc, memory);
  return memory;
}

/**
 * Formats recent memory for inclusion in server handshake instructions and project context,
 * branded with the project's name and identity.
 *
 * @param {object|string} projectOrRoot
 * @returns {Promise<string>} Human- and AI-readable markdown summary
 */
export async function formatMemoryForInstructions(projectOrRoot) {
  const desc = resolveProjectDescriptor(projectOrRoot);
  const memory = await loadMemory(desc);
  const parts = [];

  if (memory.lastHandoff) {
    const { summary, decisions, nextSteps, client, updatedAt } = memory.lastHandoff;
    const timeAgo = updatedAt ? new Date(updatedAt).toLocaleString() : "recently";
    parts.push(`[Project Session Notes: ${desc.name} (${client} - ${timeAgo})]`);
    if (summary) parts.push(`• Summary: ${summary}`);
    if (decisions) parts.push(`• Architectural Decisions: ${decisions}`);
    if (nextSteps) parts.push(`• Pending Next Steps: ${nextSteps}`);
  }

  if (memory.recentActions && memory.recentActions.length > 0) {
    const latestFive = memory.recentActions.slice(-5);
    const actionLines = latestFive
      .map((a) => {
        const extra = a.summary || a.preview || a.details || "";
        const extraFormatted = extra ? ` — ${extra}` : "";
        return `  - [${a.action}] ${a.target}${extraFormatted} (${a.client})`;
      })
      .join("\n");
    parts.push(`[Recent Workspace Activity (${desc.name})]\n${actionLines}`);
  }

  return parts.join("\n\n");
}

/**
 * Clears the in-memory cache for a specific project, or for all projects if unspecified.
 *
 * @param {object|string} [projectOrRoot]
 */
export function clearMemoryCache(projectOrRoot) {
  if (projectOrRoot) {
    const desc = resolveProjectDescriptor(projectOrRoot);
    memoryCache.delete(desc.cacheKey);
  } else {
    memoryCache.clear();
  }
}
