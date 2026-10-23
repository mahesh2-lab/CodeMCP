import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "./app.js";
import { startTunnel } from "./tunnel/ngrok.js";
import { getActiveProject, resetActiveProject } from "./services/projects.js";
import { initProject } from "./commands/init.js";
import { logger } from "./utils/logger.js";
import { getEnv } from "./utils/env.js";
import { findAvailablePort } from "./utils/ports.js";
import { reservePort } from "./services/browser.js";
import { startTelemetryReporter } from "./services/telemetry.js";
import { printServerBanner } from "./utils/banner.js";
import {
  handleShutdown,
  setupShutdownHandlers,
  resetShutdownState,
  trackSocket,
  setShutdownHttpServer,
  setShutdownTunnelListener,
} from "./utils/shutdown.js";

// Re-export modular components for backward compatibility
export { app } from "./app.js";
export { printServerBanner } from "./utils/banner.js";
export {
  handleShutdown,
  setupShutdownHandlers,
  resetShutdownState,
} from "./utils/shutdown.js";

export let tunnelListener = null;
export let httpServer = null;
export let PORT = 4173;

/**
 * Starts the CodeMCP HTTP and SSE server, binds listeners, and establishes public tunnel if enabled.
 *
 * @param {object} [options={}]
 * @param {number|string} [options.port] - Preferred port
 * @returns {Promise<{ app: import("express").Application, httpServer: import("node:http").Server, port: number }>}
 */
export async function startServer(options = {}) {
  const requestedPort =
    parseInt(options.port || getEnv("PORT", 4173), 10) || 4173;
  PORT = await findAvailablePort(requestedPort);
  reservePort(PORT); // sandboxed browser pages must never reach the MCP server itself

  if (PORT !== requestedPort) {
    logger.serverWarn(
      `Port ${requestedPort} is currently occupied. Automatically switched to port ${PORT}.`,
    );
  }

  return new Promise((resolve, reject) => {
    httpServer = app.listen(PORT);
    setShutdownHttpServer(httpServer);

    httpServer.once("error", (err) => {
      logger.serverError(`Failed to bind to port ${PORT}`, err);
      reject(err);
    });

    httpServer.once("listening", async () => {
      // MCP uses long-lived streaming requests. Node's defaults can terminate
      // an otherwise healthy tunnel while no JSON-RPC request is in flight.
      httpServer.requestTimeout = 0;
      httpServer.timeout = 0;
      httpServer.keepAliveTimeout = 120_000;
      httpServer.headersTimeout = 125_000;

      httpServer.on("connection", (socket) => {
        trackSocket(socket);
      });

      const projectRoot = path.resolve(getEnv("PROJECT_ROOT", "."));
      const configPath = path.join(projectRoot, "codemcp.json");

      if (!fs.existsSync(configPath)) {
        await initProject(projectRoot, { yes: true, silent: true });
        resetActiveProject();
      }

      const project = getActiveProject();

      try {
        tunnelListener = await startTunnel(PORT);
        setShutdownTunnelListener(tunnelListener);
      } catch (err) {
        logger.tunnelError("Failed to establish ngrok tunnel", err);
        tunnelListener = null;
        setShutdownTunnelListener(null);
      }

      const globalUrl = tunnelListener
        ? `${typeof tunnelListener.url === "function" ? tunnelListener.url() : tunnelListener.url}/mcp`
        : `http://localhost:${PORT}/mcp`;

      printServerBanner(project, PORT, globalUrl);

      // Start background telemetry & keepalive heartbeat reporting to codestats
      startTelemetryReporter({ project, port: PORT });

      resolve({ app, httpServer, port: PORT });
    });
  });
}

setupShutdownHandlers();

// Auto-start if executed directly (e.g. node src/server.js)
const isDirectExecution =
  process.argv[1] &&
  (fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) ||
    process.argv[1].endsWith("src/server.js") ||
    process.argv[1].endsWith("src\\server.js"));

if (isDirectExecution) {
  startServer().catch((err) => {
    logger.error(`Failed to bind server: ${err.message}`);
    process.exit(1);
  });
}

export default app;
