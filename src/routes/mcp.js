import { Router } from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "../tools/index.js";
import { getActiveProject } from "../services/projects.js";
import { logger } from "../utils/logger.js";
import { getClientSource } from "../utils/clientInfo.js";

const router = Router();
const sessions = new Map();

router.post("/", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];

  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId);
    logger.setActiveClient(session.client?.clientName);
    try {
      return await session.transport.handleRequest(req, res, req.body);
    } finally {
      logger.setActiveClient(null);
    }
  }

  const client = await getClientSource(req);
  const project = getActiveProject();
  const instructions = [
    `Project: ${project?.name || "Unknown"} (${project?.id || "unknown"})`,
    project?.description ? `Description: ${project.description}` : "",
    project?.techStack?.length ? `Tech Stack: ${project.techStack.join(", ")}` : "",
    project?.context ? `Context & Guidelines: ${project.context}` : "",
    "Use list_files and read_file to inspect the project structure and source code.",
    "Use get_project_context to retrieve full project metadata and instructions at any time.",
  ]
    .filter(Boolean)
    .join("\n");

  const server = new McpServer(
    {
      name: project?.name || "project-agent-mcp",
      version: "1.0.0",
    },
    { instructions }
  );

  registerTools(server, project);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (newId) => {
      sessions.set(newId, { server, transport, project, client });
      logger.sessionStart(newId, client);
    },
  });

  transport.onclose = () => {
    for (const [id, item] of sessions.entries()) {
      if (item.transport === transport) {
        logger.sessionEnd(id, item.client);
        return sessions.delete(id);
      }
    }
  };

  try {
    await server.connect(transport);
    logger.setActiveClient(client.clientName);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    logger.error("Request processing error", err);
    if (!res.headersSent)
      res.status(500).json({ error: "Failed to process request" });
  } finally {
    logger.setActiveClient(null);
  }
});

const handleExistingSession = async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  const session = sessionId && sessions.get(sessionId);
  if (!session) {
    if (req.method === "GET") {
      const project = getActiveProject();
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
    return res.status(400).json({ error: "Unknown or missing Mcp-Session-Id" });
  }

  logger.setActiveClient(session.client?.clientName);
  try {
    return await session.transport.handleRequest(req, res);
  } finally {
    logger.setActiveClient(null);
  }
};

router.get("/", handleExistingSession);
router.delete("/", handleExistingSession);

export default router;
