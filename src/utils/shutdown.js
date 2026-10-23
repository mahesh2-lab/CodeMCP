import { stopTunnel } from "../tunnel/ngrok.js";
import { logger } from "./logger.js";
import { stopTelemetryReporter } from "../services/telemetry.js";
import { closeAllSessions as closeBrowserSessions } from "../services/browser.js";
import { removeDaemonState } from "./daemon.js";

/** All active sockets — tracked so they can be destroyed immediately on shutdown */
const openSockets = new Set();

let currentHttpServer = null;
let currentTunnelListener = null;
let isShuttingDown = false;
let handlersRegistered = false;

/**
 * Tracks an active network connection socket.
 *
 * @param {import("node:net").Socket} socket
 */
export function trackSocket(socket) {
  openSockets.add(socket);
  socket.on("close", () => openSockets.delete(socket));
}

/**
 * Immediately destroys all open sockets.
 */
export function destroyAllSockets() {
  for (const socket of openSockets) {
    try {
      socket.destroy();
    } catch {}
  }
  openSockets.clear();
}

/**
 * Sets the active HTTP server instance to close on shutdown.
 *
 * @param {import("node:http").Server|null} server
 */
export function setShutdownHttpServer(server) {
  currentHttpServer = server;
}

/**
 * Sets the active tunnel listener to stop on shutdown.
 *
 * @param {object|null} listener
 */
export function setShutdownTunnelListener(listener) {
  currentTunnelListener = listener;
}

/**
 * Resets the shutdown state flag. Primarily used by unit tests.
 */
export function resetShutdownState() {
  isShuttingDown = false;
}

/**
 * Handles graceful server shutdown, closing sockets, HTTP server, tunnels, and browsers.
 *
 * @param {string} [signal="SIGINT"]
 */
export async function handleShutdown(signal = "SIGINT") {
  if (isShuttingDown) {
    // Immediate termination on second Ctrl+C
    process.exit(130);
  }
  isShuttingDown = true;

  logger.serverInfo(`Received ${signal} — shutting down...`);

  // Hard safety timeout — guarantees process termination within 1.5s even if any network cleanup hangs
  const forceExit = setTimeout(() => {
    logger.serverWarn("Forced shutdown after timeout.");
    process.exit(0);
  }, 1500);
  if (typeof forceExit.unref === "function") {
    forceExit.unref();
  }

  // 1. Immediately destroy all active sockets (SSE streams, MCP keep-alives) so httpServer.close() won't hang
  destroyAllSockets();

  // 2. Shut down HTTP server, tunnel, and subsystems in parallel
  const shutdownTasks = [];

  if (currentHttpServer) {
    if (typeof currentHttpServer.closeAllConnections === "function") {
      try {
        currentHttpServer.closeAllConnections();
      } catch (err) {
        logger.serverWarn(`Non-critical error closing connections: ${err.message}`);
      }
    }
    shutdownTasks.push(
      new Promise((resolve) => {
        try {
          currentHttpServer.close(() => {
            logger.serverInfo("HTTP server closed.");
            resolve();
          });
        } catch (err) {
          logger.serverError("Error closing HTTP server", err);
          resolve();
        }
      }),
    );
  }

  if (currentTunnelListener) {
    shutdownTasks.push(
      stopTunnel(currentTunnelListener).catch((err) => {
        logger.tunnelError("Error closing tunnel during shutdown", err);
      }),
    );
  }

  shutdownTasks.push(
    closeBrowserSessions().catch(() => {}), // stop sandboxed browsers + any app processes they started
  );
  shutdownTasks.push(
    stopTelemetryReporter().catch(() => {}),
  );

  try {
    await Promise.race([
      Promise.all(shutdownTasks),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
  } catch (err) {
    logger.serverWarn(`Shutdown task encountered an issue: ${err.message}`);
  }

  if (process.env.PROJECT_ROOT) {
    try {
      removeDaemonState(process.env.PROJECT_ROOT);
    } catch {}
  }

  clearTimeout(forceExit);
  process.exit(0);
}

/**
 * Registers OS signal listeners for graceful shutdown.
 */
export function setupShutdownHandlers() {
  if (handlersRegistered) return;
  handlersRegistered = true;

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
  process.on("SIGHUP", () => handleShutdown("SIGHUP"));
  if (process.platform === "win32") {
    process.on("SIGBREAK", () => handleShutdown("SIGBREAK"));
  }
}
