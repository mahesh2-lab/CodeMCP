import { spawn, spawnSync, exec } from "node:child_process";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { getEnv } from "../utils/env.js";
import { logger } from "../utils/logger.js";
import {
  buildCleanEnv,
  resolveBinaryForPlatform,
} from "../tools/executeCommand.js";

/**
 * Browser sandbox service.
 *
 * Each session = one app process (optional) + one fresh, disposable Playwright
 * BrowserContext (no cookies, cache or storage carried over). Everything is
 * destroyed on close, idle timeout, or server shutdown.
 *
 * `playwright-core` is imported lazily so the server starts even if it is
 * missing and the feature is simply unavailable.
 */

const MAX_SESSIONS = 3;
const MAX_LOG_ENTRIES = 300;
const MAX_APP_OUTPUT_LINES = 200;
const DEFAULT_IDLE_MS = 10 * 60 * 1000;
const MAX_SHOT_BYTES = 4 * 1024 * 1024;
const MAX_FULLPAGE_HEIGHT = 10_000;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Ports that pages must never reach (e.g. the CodeMCP server itself). */
const reservedPorts = new Set();

export function reservePort(port) {
  if (Number.isInteger(port)) reservedPorts.add(port);
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Paths a dev server may happily serve but that the sandbox must never fetch.
 * This closes a pathGuard bypass: `npm run dev` / a static server can expose
 * `/.env`, `/.git/config`, `/.codemcp/...` or (Vite) `/@fs/<absolute path>`,
 * which would otherwise be readable via screenshots / browser_inspect.
 */
const SENSITIVE_PATH_PATTERNS = [
  /(^|\/)\.env(\.[^/]*)?(\/|$)/i,
  /(^|\/)\.git(\/|$)/i,
  /(^|\/)\.codemcp(\/|$)/i,
  /(^|\/)\.ssh(\/|$)/i,
  /(^|\/)\.(npmrc|pypirc|netrc|aws|docker|kube)(\/|$)/i,
  /(^|\/)(id_rsa|id_dsa|id_ecdsa|id_ed25519)(\.pub)?$/i,
  /(^|\/)credentials\.enc$/i,
  /(^|\/)codemcp\.json$/i,
  /(^|\/)@fs(\/|$)/i,
  /(^|\/)\.\.(\/|$)/,
  /\0/,
];

export function isSensitivePath(pathname) {
  let decoded = String(pathname || "");
  // Decode repeatedly so %252e%252e style double-encoding cannot hide a segment
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return true; // malformed encoding: refuse
    }
  }
  decoded = decoded.replace(/\\/g, "/");
  return SENSITIVE_PATH_PATTERNS.some((re) => re.test(decoded));
}

/**
 * Decides whether the sandboxed browser may request a URL.
 * - loopback: allowed only on non-reserved ports, on the session's allowedPorts (when given),
 *   and never for sensitive paths
 * - data:/blob:/about: allowed for subresources (top-level navigation is checked separately)
 * - external hosts: blocked unless allowExternal (BROWSER_ALLOW_EXTERNAL) is set
 */
export function isUrlAllowed(rawUrl, { allowExternal = false, allowedPorts = null } = {}) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (["data:", "blob:", "about:"].includes(url.protocol)) return true;
  if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol)) return false;

  if (LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) {
    const secure = url.protocol === "https:" || url.protocol === "wss:";
    const port = Number(url.port || (secure ? 443 : 80));
    if (reservedPorts.has(port)) return false;
    if (allowedPorts && !allowedPorts.has(port)) return false;
    return !isSensitivePath(url.pathname);
  }
  return allowExternal;
}

// ---------------------------------------------------------------------------
// Playwright / browser lifecycle
// ---------------------------------------------------------------------------

let playwrightPromise = null;

async function loadPlaywright() {
  if (!playwrightPromise) {
    playwrightPromise = import("playwright-core")
      .then((mod) => (mod.chromium ? mod : mod.default))
      .catch(() => {
        playwrightPromise = null;
        throw new Error(
          'The "playwright-core" package is not installed. Run: npm install playwright-core',
        );
      });
  }
  return playwrightPromise;
}

let browserInstance = null;
let browserLaunching = null;

async function getBrowser() {
  if (browserInstance?.isConnected()) return browserInstance;
  if (browserLaunching) return browserLaunching;

  browserLaunching = (async () => {
    const { chromium } = await loadPlaywright();
    const headless = !isTruthy(getEnv("BROWSER_HEADED", ""));
    const configured = getEnv("BROWSER_CHANNEL", "");
    // Prefer an installed browser (no download needed); fall back to Playwright's own Chromium.
    const candidates = configured ? [configured] : ["chrome", "msedge", undefined];

    // Defense in depth below the Playwright request filter: with external access off, Chrome
    // itself can resolve only localhost (so DNS/prefetch/WebSocket/etc. cannot reach the internet),
    // and WebRTC cannot open direct UDP paths.
    const launchArgs = ["--force-webrtc-ip-handling-policy=disable_non_proxied_udp"];
    if (!isTruthy(getEnv("BROWSER_ALLOW_EXTERNAL", ""))) {
      launchArgs.push(
        "--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost , EXCLUDE 127.0.0.1",
      );
    }

    let lastError;
    for (const channel of candidates) {
      try {
        const instance = await chromium.launch({ headless, channel, args: launchArgs });
        instance.on("disconnected", () => {
          if (browserInstance === instance) browserInstance = null;
        });
        browserInstance = instance;
        return instance;
      } catch (err) {
        lastError = err;
      }
    }
    throw new Error(
      "Could not launch a Chromium-based browser. Install Google Chrome or Microsoft Edge, " +
        'or run "npx playwright-core install chromium". ' +
        `Last error: ${lastError?.message || lastError}`,
    );
  })();

  try {
    return await browserLaunching;
  } finally {
    browserLaunching = null;
  }
}

// ---------------------------------------------------------------------------
// App process management
// ---------------------------------------------------------------------------

function pushLines(buffer, text) {
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    buffer.push(line.slice(0, 500));
    if (buffer.length > MAX_APP_OUTPUT_LINES) buffer.shift();
  }
}

function spawnApp({ binary, args, cwd, port }) {
  let executable = resolveBinaryForPlatform(binary);
  let finalArgs = args;

  // Same Windows .cmd/.bat handling as execute_command
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(executable)) {
    finalArgs = ["/d", "/s", "/c", executable, ...args];
    executable = process.env.ComSpec || "cmd.exe";
  }

  const env = {
    ...buildCleanEnv(cwd),
    PORT: String(port),
    BROWSER: "none",
    NO_COLOR: "1",
    FORCE_COLOR: "0",
  };

  const output = [];
  const child = spawn(executable, finalArgs, {
    cwd,
    env,
    shell: false,
    detached: process.platform !== "win32", // own process group so the whole tree can be killed
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const handle = { child, output, exit: null };
  child.stdout.on("data", (d) => pushLines(output, d.toString()));
  child.stderr.on("data", (d) => pushLines(output, d.toString()));

  handle.exited = new Promise((resolve) => {
    child.once("exit", (code, signal) => {
      handle.exit = { code, signal };
      resolve();
    });
    child.once("error", (err) => {
      handle.exit = { code: 1, signal: null };
      output.push(`[spawn error] ${err.message}`);
      resolve();
    });
  });

  return handle;
}

async function killApp(handle) {
  if (!handle || handle.exit) return;
  const pid = handle.child.pid;
  if (!pid) return;

  if (process.platform === "win32") {
    await new Promise((resolve) =>
      exec(`taskkill /pid ${pid} /t /f`, { windowsHide: true }, () => resolve()),
    );
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      handle.child.kill("SIGTERM");
    } catch {}
  }
  await Promise.race([handle.exited, sleep(3000)]);
  if (!handle.exit) {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {}
  }
}

function killAppSync(handle) {
  if (!handle || handle.exit) return;
  const pid = handle.child.pid;
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], { windowsHide: true });
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch {}
}

function probe(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

export async function isPortOpen(port) {
  return (await probe(port, "127.0.0.1")) || (await probe(port, "::1"));
}

async function waitForReady(port, handle, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (handle?.exit) return { ok: false, reason: "exited" };
    if (await isPortOpen(port)) return { ok: true };
    await sleep(400);
  }
  return { ok: false, reason: "timeout" };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const sessions = new Map();
let watchdog = null;
let exitHookRegistered = false;

const ISSUE_LEVELS = new Set([
  "error",
  "pageerror",
  "requestfailed",
  "http",
  "blocked",
  "crash",
]);

function addLog(session, level, text) {
  session.logSeq += 1;
  session.logs.push({ seq: session.logSeq, level, text: String(text).slice(0, 600) });
  if (session.logs.length > MAX_LOG_ENTRIES) session.logs.shift();
}

function attachPageListeners(session, page) {
  page.on("console", (msg) => addLog(session, msg.type(), msg.text()));
  page.on("pageerror", (err) => addLog(session, "pageerror", err?.stack || err));
  page.on("crash", () => addLog(session, "crash", "The page crashed"));
  page.on("requestfailed", (req) => {
    const reason = req.failure()?.errorText || "failed";
    if (/blockedbyclient/i.test(reason)) return; // already logged as "blocked"
    addLog(session, "requestfailed", `${req.method()} ${req.url()} (${reason})`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400) {
      addLog(session, "http", `${res.status()} ${res.request().method()} ${res.url()}`);
    }
  });
  page.on("dialog", (dialog) => {
    addLog(session, "dialog", `${dialog.type()}: ${dialog.message()} (dismissed)`);
    dialog.dismiss().catch(() => {});
  });
}

function ensureHousekeeping() {
  if (!watchdog) {
    const idleMs = parseInt(getEnv("BROWSER_IDLE_MS", ""), 10) || DEFAULT_IDLE_MS;
    watchdog = setInterval(() => {
      const now = Date.now();
      for (const session of sessions.values()) {
        if (now - session.lastUsed > idleMs) {
          logger.serverWarn(`Closing idle browser session ${session.id}`);
          closeSession(session.id).catch(() => {});
        }
      }
    }, 30_000);
    watchdog.unref?.();
  }

  if (!exitHookRegistered) {
    exitHookRegistered = true;
    process.on("exit", () => {
      for (const session of sessions.values()) killAppSync(session.app);
    });
  }
}

const DEVICE_PRESETS = {
  desktop: { viewport: { width: 1280, height: 800 } },
  tablet: {
    device: "iPad (gen 7)",
    fallback: { viewport: { width: 810, height: 1080 }, isMobile: true, hasTouch: true },
  },
  mobile: {
    device: "Pixel 7",
    fallback: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true },
  },
};

/**
 * Starts (or attaches to) an app and opens a fresh disposable browser context on it.
 *
 * @param {object} options
 * @param {{binary: string, args: string[], cwd: string}|null} options.launch - Process to start, or null to attach to a running app
 * @param {number} options.port
 * @param {"desktop"|"tablet"|"mobile"} [options.device]
 * @param {number} [options.readyTimeoutMs]
 * @param {string} [options.artifactsRoot] - Directory for optional traces
 */
export async function createSession({
  launch,
  port,
  device = "desktop",
  readyTimeoutMs = 60_000,
  apiPorts = [],
  artifactsRoot,
}) {
  if (sessions.size >= MAX_SESSIONS) {
    throw new Error(
      `Maximum of ${MAX_SESSIONS} concurrent browser sessions reached. Close one with browser_close.`,
    );
  }
  if (reservedPorts.has(port)) {
    throw new Error(`Port ${port} is reserved by the CodeMCP server itself.`);
  }

  const alreadyOpen = await isPortOpen(port);
  let app = null;

  if (launch) {
    if (alreadyOpen) {
      throw new Error(
        `Port ${port} is already in use. Choose a free port, or omit 'command' to test the app already running there.`,
      );
    }
    app = spawnApp({ ...launch, port });
    const ready = await waitForReady(port, app, readyTimeoutMs);
    if (!ready.ok) {
      const tail = app.output.slice(-30).join("\n") || "(no output)";
      await killApp(app);
      throw new Error(
        (ready.reason === "exited"
          ? "The app exited before it started listening."
          : `The app did not listen on port ${port} within ${readyTimeoutMs} ms.`) +
          `\n--- app output (last lines) ---\n${tail}`,
      );
    }
  } else if (!alreadyOpen) {
    throw new Error(
      `Nothing is listening on port ${port}. Provide 'command' (e.g. "npm run dev") so the app can be started.`,
    );
  }

  // 16 hex chars (64 bits): session ids act as capabilities, so keep them unguessable
  const id = randomUUID().replace(/-/g, "").slice(0, 16);
  let context = null;

  try {
    const pw = await loadPlaywright();
    const browser = await getBrowser();

    const preset = DEVICE_PRESETS[device] || DEVICE_PRESETS.desktop;
    let contextOptions;
    if (preset.device) {
      const { defaultBrowserType, ...descriptor } = pw.devices?.[preset.device] || preset.fallback;
      contextOptions = descriptor;
    } else {
      contextOptions = preset;
    }

    // A brand-new context: no cookies, storage, cache or permissions. This is the "disposable" part.
    context = await browser.newContext({
      ...contextOptions,
      acceptDownloads: false,
      serviceWorkers: "block",
      permissions: [],
    });

    const session = {
      id,
      app,
      port,
      device,
      baseUrl: `http://localhost:${port}`,
      // Loopback ports the page may reach: the app itself plus explicitly approved API ports.
      // Every other local service (databases, admin UIs, ngrok inspector...) stays unreachable.
      allowedPorts: new Set([
        port,
        ...(apiPorts || []).filter(
          (p) => Number.isInteger(p) && p > 0 && p < 65536 && !reservedPorts.has(p),
        ),
      ]),
      context,
      page: null,
      logs: [],
      logSeq: 0,
      reportedSeq: 0,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      traceDir: null,
    };

    const allowExternal = isTruthy(getEnv("BROWSER_ALLOW_EXTERNAL", ""));
    await context.route("**/*", (route) => {
      const request = route.request();
      if (isUrlAllowed(request.url(), { allowExternal, allowedPorts: session.allowedPorts })) {
        return route.continue().catch(() => {});
      }
      addLog(session, "blocked", `${request.method()} ${request.url()}`);
      return route.abort("blockedbyclient").catch(() => {});
    });

    // WebSockets bypass context.route(); apply the same policy to them.
    if (typeof context.routeWebSocket === "function") {
      await context.routeWebSocket(/.*/, (ws) => {
        if (isUrlAllowed(ws.url(), { allowExternal, allowedPorts: session.allowedPorts })) {
          ws.connectToServer();
        } else {
          addLog(session, "blocked", `WebSocket ${ws.url()}`);
          ws.close({ code: 1008, reason: "blocked by sandbox" });
        }
      });
    }

    if (isTruthy(getEnv("BROWSER_TRACE", "")) && artifactsRoot) {
      session.traceDir = path.join(artifactsRoot, ".codemcp", "browser", id);
      await context.tracing.start({ screenshots: true, snapshots: true });
    }

    const page = await context.newPage();
    session.page = page;
    attachPageListeners(session, page);

    // Popups / target=_blank: follow the newest page
    context.on("page", (popup) => {
      if (popup === session.page) return;
      attachPageListeners(session, popup);
      session.page = popup;
      addLog(session, "popup", `Opened new tab: ${popup.url() || "(loading)"}`);
      popup.on("close", () => {
        const open = context.pages();
        if (session.page === popup && open.length) session.page = open[open.length - 1];
      });
    });

    sessions.set(id, session);
    ensureHousekeeping();
    return session;
  } catch (err) {
    await killApp(app);
    await context?.close().catch(() => {});
    if (sessions.size === 0) await closeBrowserIfIdle();
    throw err;
  }
}

export function getSession(id) {
  const session = sessions.get(String(id || ""));
  if (!session) {
    const active = [...sessions.keys()];
    throw new Error(
      `Unknown browser session "${id}". ` +
        (active.length ? `Active sessions: ${active.join(", ")}` : "No active sessions; call browser_start first."),
    );
  }
  session.lastUsed = Date.now();
  return session;
}

export function listSessions() {
  return [...sessions.values()].map((s) => ({
    id: s.id,
    port: s.port,
    url: s.page?.url(),
    ageSeconds: Math.round((Date.now() - s.createdAt) / 1000),
    ownsApp: Boolean(s.app),
  }));
}

/** Navigates to a path or a loopback URL, rejecting anything the sandbox would block. */
export async function navigate(session, target = "/") {
  const url = new URL(target, session.baseUrl);
  const allowExternal = isTruthy(getEnv("BROWSER_ALLOW_EXTERNAL", ""));
  // Top-level navigation is http(s) only: no data:/blob:/file:/javascript: documents.
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !isUrlAllowed(url.href, { allowExternal, allowedPorts: session.allowedPorts })
  ) {
    throw new Error(
      `Navigation to ${url.href} is blocked. Allowed: this session's localhost ports (${[...session.allowedPorts].join(", ")}), excluding sensitive paths such as /.env, /.git or /@fs.`,
    );
  }
  const response = await session.page.goto(url.href, {
    waitUntil: "load",
    timeout: 30_000,
  });
  await settle(session.page);
  return response;
}

/** Waits for load plus a short settle. Avoids "networkidle", which never fires with HMR/websockets. */
export async function settle(page) {
  await page.waitForLoadState("load", { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300).catch(() => {});
}

export async function captureScreenshot(
  session,
  { fullPage = false, selector, quality = 70 } = {},
) {
  const q = Math.min(Math.max(Number(quality) || 70, 30), 95);
  const options = {
    type: "jpeg",
    quality: q,
    scale: "css", // avoid inflating mobile screenshots by device pixel ratio
    animations: "disabled",
    caret: "hide",
    timeout: 10_000,
  };
  const capture = async (opts) => {
    if (selector) return session.page.locator(selector).screenshot(opts);
    let clip;
    if (fullPage) {
      const height = await session.page
        .evaluate(() => document.documentElement.scrollHeight)
        .catch(() => 0);
      if (height > MAX_FULLPAGE_HEIGHT) {
        const width = session.page.viewportSize()?.width ?? 1280;
        clip = { x: 0, y: 0, width, height: MAX_FULLPAGE_HEIGHT };
      }
    }
    return session.page.screenshot({ ...opts, fullPage, ...(clip ? { clip } : {}) });
  };

  let shot = await capture(options);
  if (shot.length > MAX_SHOT_BYTES) shot = await capture({ ...options, quality: 40 });
  if (shot.length > MAX_SHOT_BYTES) {
    throw new Error("Screenshot is too large to return; capture a specific element or use a smaller viewport.");
  }
  return shot;
}

export async function getSnapshot(session) {
  const body = session.page.locator("body");
  const text =
    typeof body.ariaSnapshot === "function"
      ? await body.ariaSnapshot({ timeout: 5000 })
      : await body.innerText({ timeout: 5000 });
  return text.length > 30_000 ? text.slice(0, 30_000) + "\n... [truncated]" : text;
}

/** Returns issue-level log entries (errors, failed/blocked requests) not yet reported to the caller. */
export function drainNewIssues(session) {
  const fresh = session.logs.filter(
    (entry) => entry.seq > session.reportedSeq && ISSUE_LEVELS.has(entry.level),
  );
  session.reportedSeq = session.logSeq;
  return fresh;
}

export function formatLogs(session) {
  return session.logs.length
    ? session.logs.map((e) => `[${e.level}] ${e.text}`).join("\n")
    : "(no console or network activity recorded)";
}

export function getAppOutput(session, lines = 60) {
  if (!session.app) return "(app was already running; CodeMCP did not start it, so no output is captured)";
  return session.app.output.slice(-lines).join("\n") || "(no output yet)";
}

async function closeBrowserIfIdle() {
  if (sessions.size === 0 && browserInstance) {
    const instance = browserInstance;
    browserInstance = null;
    await instance.close().catch(() => {});
  }
}

export async function closeSession(id) {
  const session = sessions.get(id);
  if (!session) return null;
  sessions.delete(id);

  let tracePath = null;
  try {
    if (session.traceDir) {
      fs.mkdirSync(session.traceDir, { recursive: true });
      tracePath = path.join(session.traceDir, "trace.zip");
      await session.context.tracing.stop({ path: tracePath });
    }
  } catch {
    tracePath = null;
  }

  await session.context.close().catch(() => {});
  await killApp(session.app);
  await closeBrowserIfIdle();

  return { id, tracePath, stoppedApp: Boolean(session.app) };
}

export async function closeAllSessions() {
  const ids = [...sessions.keys()];
  await Promise.all(ids.map((id) => closeSession(id).catch(() => {})));
  await closeBrowserIfIdle();
  if (watchdog) {
    clearInterval(watchdog);
    watchdog = null;
  }
}
