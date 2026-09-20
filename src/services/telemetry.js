import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getEnv } from "../utils/env.js";
import { logger } from "../utils/logger.js";

const CODEMCP_DIR = path.join(os.homedir(), ".codemcp");
const INSTALLATION_FILE = path.join(CODEMCP_DIR, "installation_id");

let cachedInstallationId = null;
let heartbeatTimer = null;
let cachedVersion = null;
let currentMetadata = {};

/**
 * Resolves the CodeMCP version from package.json or fallback.
 */
export function getCodeMcpVersion() {
  if (cachedVersion) return cachedVersion;
  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.resolve(currentDir, "../../package.json"),
      path.resolve(currentDir, "../package.json"),
      path.resolve(process.cwd(), "package.json"),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
        if (pkg.name?.includes("codemcp") && pkg.version) {
          cachedVersion = pkg.version;
          return cachedVersion;
        }
      }
    }
  } catch (err) {
    // Could not read from candidate package.json paths; use default version
  }
  cachedVersion = "2.0.10";
  return cachedVersion;
}

/**
 * Returns a persistent machine-unique installation ID.
 * Stored at ~/.codemcp/installation_id
 *
 * @returns {string}
 */
export function getInstallationId() {
  if (cachedInstallationId) return cachedInstallationId;

  try {
    if (!fs.existsSync(CODEMCP_DIR)) {
      fs.mkdirSync(CODEMCP_DIR, { recursive: true, mode: 0o700 });
    }

    if (fs.existsSync(INSTALLATION_FILE)) {
      const id = fs.readFileSync(INSTALLATION_FILE, "utf8").trim();
      if (id) {
        cachedInstallationId = id;
        return cachedInstallationId;
      }
    }

    // Generate new persistent installation ID
    const newId = `inst_${crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex")}`;
    fs.writeFileSync(INSTALLATION_FILE, newId, {
      encoding: "utf8",
      mode: 0o600,
    });
    cachedInstallationId = newId;
    return cachedInstallationId;
  } catch (err) {
    // Fallback in-memory ID if filesystem is restricted or inaccessible
    if (!cachedInstallationId) {
      cachedInstallationId = `inst_mem_${crypto.randomBytes(8).toString("hex")}`;
    }
    return cachedInstallationId;
  }
}

/**
 * Returns the configured codestats collection endpoint base URL.
 * Defaults to http://localhost:3000
 *
 * @returns {string}
 */
export function getStatsBaseUrl() {
  const url = "https://codestats-five.vercel.app";
  return url.replace(/\/+$/, "");
}

/**
 * Checks whether telemetry reporting is enabled.
 * Telemetry is always active.
 *
 * @returns {boolean}
 */
export function isTelemetryEnabled() {
  return true;
}

/**
 * Sends a full telemetry event to the /api/collect (or /api/gather) endpoint.
 * Fire-and-forget; never throws.
 *
 * @param {string} [event="ping"] - Event name: "start", "ping", "heartbeat", "shutdown"
 * @param {Record<string, unknown>} [metadata={}] - Optional contextual data
 * @param {number} [timeoutMs=3000] - Request abort timeout
 * @returns {Promise<boolean>}
 */
export async function sendTelemetry(
  event = "ping",
  metadata = {},
  timeoutMs = 3000,
) {
  if (!isTelemetryEnabled()) return false;

  const baseUrl = getStatsBaseUrl();
  const payload = {
    installationId: getInstallationId(),
    version: getCodeMcpVersion(),
    platform: process.platform,
    architecture: process.arch,
    nodeVersion: process.version,
    event,
    metadata: { ...currentMetadata, ...metadata },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/api/collect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": `CodeMCP/${getCodeMcpVersion()}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);
    return res.ok;
  } catch (err) {
    clearTimeout(timer);
    // Silent failure: telemetry network issues must never degrade server functionality
    return false;
  }
}

/**
 * Sends a lightweight keepalive heartbeat to /api/gather/heartbeat.
 * Automatically falls back to full registration if the server reports 404.
 *
 * @param {number} [timeoutMs=2000] - Request abort timeout
 * @returns {Promise<boolean>}
 */
export async function sendHeartbeat(timeoutMs = 2000) {
  if (!isTelemetryEnabled()) return false;

  const baseUrl = getStatsBaseUrl();
  const payload = {
    installationId: getInstallationId(),
    version: getCodeMcpVersion(),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/api/gather/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": `CodeMCP/${getCodeMcpVersion()}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (res.status === 404) {
      // Not registered yet or DB was reset, trigger full re-registration
      return sendTelemetry("heartbeat", currentMetadata, 3000);
    }

    return res.ok;
  } catch (err) {
    clearTimeout(timer);
    return false;
  }
}

/**
 * Starts the telemetry reporting lifecycle:
 * - Emits initial 'start' registration event
 * - Schedules regular heartbeat pings (default: 5 minutes)
 *
 * @param {object} [options]
 * @param {object} [options.project]
 * @param {number} [options.port]
 * @param {number} [options.intervalMs=300000]
 */
export function startTelemetryReporter(options = {}) {
  if (!isTelemetryEnabled()) return;

  currentMetadata = {
    projectId: options.project?.id || null,
    projectName: options.project?.name || null,
    port: options.port || null,
  };

  // 1. Send immediate startup registration
  sendTelemetry("start", currentMetadata).catch((err) => {
    // Startup telemetry failures do not interrupt server startup
  });

  // 2. Set recurring heartbeat (default 5 mins)
  const intervalMs = options.intervalMs || 5 * 60 * 1000;
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }

  heartbeatTimer = setInterval(() => {
    sendHeartbeat().catch((err) => {
      // Heartbeat ping failures do not disrupt active sessions
    });
  }, intervalMs);

  // Unref timer so it does not keep the Node.js event loop active during shutdown
  if (typeof heartbeatTimer.unref === "function") {
    heartbeatTimer.unref();
  }
}

/**
 * Stops the heartbeat timer and sends a final 'shutdown' event.
 *
 * @param {number} [timeoutMs=800]
 * @returns {Promise<void>}
 */
export async function stopTelemetryReporter(timeoutMs = 800) {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  if (isTelemetryEnabled()) {
    try {
      await sendTelemetry("shutdown", currentMetadata, timeoutMs);
    } catch (err) {
      // Shutdown notification failures are caught so process termination proceeds cleanly
      logger.serverWarn(`Error sending shutdown telemetry: ${err.message}`);
    }
  }
}
