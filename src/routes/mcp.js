import { Router } from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "../tools/index.js";
import { getActiveProject } from "../services/projects.js";
import { formatMemoryForInstructions } from "../services/memory.js";
import { logger } from "../utils/logger.js";
import { getClientSource } from "../utils/clientInfo.js";

const router = Router();
export const sessions = new Map();

/**
 * Sessions stay available until the client, transport, or server explicitly
 * closes them. This avoids forcing long-lived MCP clients to reconnect.
 */
export function cleanupInactiveSessions() {}

async function executeWithActiveClient(clientName, fn) {
  logger.setActiveClient(clientName);
  try {
    return await fn();
  } finally {
    logger.setActiveClient(null);
  }
}

async function buildServerInstructions(project) {
  const memoryText = project?.root
    ? await formatMemoryForInstructions(project.root)
    : "";

  return [
    `Project: ${project?.name || "Unknown"} (${project?.id || "unknown"})`,
    project?.description ? `Description: ${project.description}` : "",
    project?.techStack?.length
      ? `Tech Stack: ${project.techStack.join(", ")}`
      : "",
    project?.context ? `Context & Guidelines: ${project.context}` : "",
    memoryText ? `\n--- Cross-Assistant Session Memory ---\n${memoryText}` : "",
    "Use list_files and read_file to inspect the project structure and source code.",
    "Use get_project_context to retrieve full project metadata and instructions at any time.",
    "Use record_memory to preserve handoff notes, key architectural decisions, and next steps for other AI assistants.",
    "When calling write_file, delete_file, or execute_command, provide a concise 'summary' parameter explaining your change or intent so succeeding AI assistants understand what you did.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function sanitizeRpcRequest(body) {
  if (!body) return body;
  if (Array.isArray(body)) {
    return body.map(sanitizeRpcRequest);
  }
  if (body.method === "tools/call" && body.params) {
    if (
      body.params.arguments === undefined ||
      body.params.arguments === null ||
      typeof body.params.arguments !== "object" ||
      Array.isArray(body.params.arguments)
    ) {
      body.params.arguments = {};
    }
  }
  return body;
}

router.use((req, res, next) => {
  if (req.body) {
    sanitizeRpcRequest(req.body);
  }
  next();
});

function isInitMessage(body) {
  if (!body) return false;
  if (Array.isArray(body)) return body.some((m) => m?.method === "initialize");
  return body.method === "initialize";
}

async function getOrCreateSession(sessionId, req, isInit = false) {
  if (sessionId && sessions.has(sessionId)) {
    const existing = sessions.get(sessionId);
    existing.lastAccessed = Date.now();
    return existing;
  }

  const effectiveId = sessionId || randomUUID();
  const client = await getClientSource(req);
  const project = req?.project || getActiveProject();
  const instructions = await buildServerInstructions(project);

  const server = new McpServer(
    {
      name: project?.name || "project-agent-mcp",
      version: "1.0.0",
    },
    { instructions },
  );

  registerTools(server, project);

  let sessionData;
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => effectiveId,
    keepAliveMs: 15_000,
    onsessioninitialized: (newId) => {
      sessions.set(newId, sessionData);
      logger.sessionStart(newId, client);
    },
  });

  if (!isInit && transport._webStandardTransport) {
    transport._webStandardTransport._initialized = true;
    transport._webStandardTransport.sessionId = effectiveId;
  }

  transport.onclose = () => {
    logger.sessionEnd(effectiveId, client);
    sessions.delete(effectiveId);
  };

  await server.connect(transport);
  sessionData = {
    server,
    transport,
    project,
    client,
    lastAccessed: Date.now(),
  };
  sessions.set(effectiveId, sessionData);

  if (!isInit) {
    logger.sessionStart(effectiveId, client);
  }

  return sessionData;
}

router.post("/", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  const isInit = isInitMessage(req.body);

  try {
    const session = await getOrCreateSession(sessionId, req, isInit);
    return await executeWithActiveClient(session.client?.clientName, () =>
      session.transport.handleRequest(req, res, req.body),
    );
  } catch (err) {
    logger.error("Session request failed", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to process request" });
    }
  }
});

const handleExistingSession = async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  const isSse = req.headers.accept?.includes("text/event-stream");

  if (req.method === "GET" && !sessionId && !isSse) {
    const project = req?.project || getActiveProject();
    const client = await getClientSource(req);
    return res.status(200).json({
      status: "online",
      project: project.name,
      endpoint: "/mcp",
      transport: "StreamableHTTP",
      detectedClient: {
        client: client.clientName,
        type: client.clientType,
        ip: client.clientIp,
        location: client.location,
        channel: client.channel,
        origin: client.origin || "(none)",
        userAgent: client.userAgent || "(none)",
      },
      message:
        "MCP server is ready. Send POST with JSON-RPC initialize payload to start session.",
    });
  }

  try {
    const session = await getOrCreateSession(sessionId, req, false);
    return await executeWithActiveClient(session.client?.clientName, () =>
      session.transport.handleRequest(req, res),
    );
  } catch (err) {
    logger.error("Existing session request failed", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to process request" });
    }
  }
};

router.get("/", handleExistingSession);
router.delete("/", handleExistingSession);

export default router;
