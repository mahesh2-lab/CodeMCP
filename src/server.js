import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import routes from "./routes/index.js";
import { startTunnel, stopTunnel } from "./tunnel/ngrok.js";
import { getActiveProject, resetActiveProject } from "./services/projects.js";
import { initProject } from "./commands/init.js";
import { logger } from "./utils/logger.js";
import { getEnv } from "./utils/env.js";
import { findAvailablePort } from "./utils/ports.js";
import { printBox } from "./utils/box.js";
import { isApprovalRequired } from "./services/approval.js";

export const app = express();

app.use(
  cors({
    origin: "*",
    exposedHeaders: ["Mcp-Session-Id", "Mcp-Protocol-Version"],
    allowedHeaders: [
      "Content-Type",
      "mcp-session-id",
      "mcp-protocol-version",
      "last-event-id",
      "ngrok-skip-browser-warning",
      "Authorization",
    ],
  }),
);

app.use(express.json());
app.use(routes);

const requestedPort = parseInt(getEnv("PORT", 4173), 10) || 4173;
export const PORT = await findAvailablePort(requestedPort);

if (PORT !== requestedPort) {
  logger.serverWarn(
    `Port ${requestedPort} is currently occupied. Automatically switched to port ${PORT}.`,
  );
}

let tunnelListener = null;

export const httpServer = app.listen(PORT, async () => {
  const projectRoot = path.resolve(getEnv("PROJECT_ROOT", "."));
  const configPath = path.join(projectRoot, "codemcp.json");

  if (!fs.existsSync(configPath)) {
    await initProject(projectRoot, { yes: true, silent: true });
    resetActiveProject();
  }

  const project = getActiveProject();
  tunnelListener = await startTunnel(PORT);

  const globalUrl = tunnelListener
    ? `${typeof tunnelListener.url === "function" ? tunnelListener.url() : tunnelListener.url}/mcp`
    : `http://localhost:${PORT}/mcp`;

  const permissionText =
    project.permission === "both"
      ? pc.green("Read & Write")
      : project.permission === "write"
        ? pc.yellow("Write-only")
        : pc.cyan("Read-only");

  const title = pc.bold(pc.bgCyan(pc.black(" CodeMCP Project Agent (MCP) ")));
  const rows = [
    `${pc.bold("Project    :")} ${pc.green(project.name)} ${pc.dim(`(${project.id})`)}`,
    `${pc.bold("Root       :")} ${pc.dim(project.root)}`,
    `${pc.bold("Config     :")} ${
      project.configFile
        ? pc.green(path.basename(project.configFile))
        : pc.yellow("(auto-generated)")
    }`,
    `${pc.bold("Permission :")} ${permissionText}`,
    ...(getEnv("API_KEY")
      ? [`${pc.bold("Auth       :")} ${pc.green("Bearer Token Enforced")}`]
      : []),
    `${pc.bold("Approval   :")} ${
      isApprovalRequired(project, "WRITE")
        ? pc.yellow("Enabled (Ask before changes)")
        : pc.dim("Disabled (Auto-apply)")
    }`,
    `${pc.bold("Context    :")} ${
      project.contextFile ? pc.white(project.contextFile) : pc.dim("(none)")
    }`,
    `${pc.bold("Local URL  :")} ${pc.cyan(`http://localhost:${PORT}/mcp`)}`,
    `${pc.bold("Global URL :")} ${pc.bold(pc.magenta(globalUrl))}`,
  ];

  printBox(title, rows);
  console.log(
    pc.dim(
      "  Waiting for AI client requests... (tool activity appears below)\n",
    ),
  );
});

async function handleShutdown(signal) {
  logger.serverInfo(`Received ${signal} — shutting down...`);
  await stopTunnel(tunnelListener);

  httpServer.close(() => {
    logger.serverInfo("HTTP server closed.");
    process.exit(0);
  });

  const forceExit = setTimeout(() => {
    logger.error("Forced shutdown after timeout.");
    process.exit(1);
  }, 3000);
  forceExit.unref();
}

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));

export default app;
