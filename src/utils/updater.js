import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import pc from "picocolors";

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const NETWORK_TIMEOUT_MS = 1200; // 1.2s max timeout to prevent slow CLI startup

/**
 * Resolves the root directory of the CodeMCP package.
 *
 * @returns {string} Absolute path to package root
 */
export function getPackageRoot() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(__dirname, "../..");
}

/**
 * Reads CodeMCP's own package.json to obtain current package name and version.
 *
 * @returns {{ name: string, version: string }}
 */
export function getPackageInfo() {
  try {
    const pkgPath = path.join(getPackageRoot(), "package.json");
    const content = fs.readFileSync(pkgPath, "utf8");
    const parsed = JSON.parse(content);
    return {
      name: parsed.name || "@mahesh2-lab/codemcp",
      version: parsed.version || "2.1.2",
    };
  } catch {
    return { name: "@mahesh2-lab/codemcp", version: "2.1.2" };
  }
}

/**
 * Detects whether the CodeMCP CLI is executing from a local development git repository.
 * If true, update checks are bypassed to prevent overriding development code.
 *
 * @returns {boolean}
 */
export function isDevEnvironment() {
  if (process.env.FORCE_UPDATE_CHECK === "true") {
    return false;
  }
  try {
    return fs.existsSync(path.join(getPackageRoot(), ".git"));
  } catch {
    return false;
  }
}

/**
 * Detects whether CodeMCP was invoked via ephemeral npx runner.
 *
 * @returns {boolean}
 */
export function isNpxInvocation() {
  const execPath = (process.argv[1] || "").toLowerCase();
  const envUnderscore = (process.env._ || "").toLowerCase();
  const npmArgv = (process.env.npm_config_argv || "").toLowerCase();

  return (
    execPath.includes("_npx") ||
    execPath.includes("npm-cache") ||
    envUnderscore.includes("npx") ||
    npmArgv.includes("npx")
  );
}

/**
 * Compares two semantic version strings numerically.
 *
 * @param {string} current
 * @param {string} latest
 * @returns {boolean} True if latest is strictly greater than current
 */
export function isNewerVersion(current, latest) {
  if (
    !current ||
    !latest ||
    typeof current !== "string" ||
    typeof latest !== "string"
  ) {
    return false;
  }

  const clean = (v) => v.trim().replace(/^v/, "").split("-")[0];
  const c = clean(current).split(".").map((n) => parseInt(n, 10) || 0);
  const l = clean(latest).split(".").map((n) => parseInt(n, 10) || 0);

  for (let i = 0; i < 3; i++) {
    const cPart = c[i] || 0;
    const lPart = l[i] || 0;
    if (lPart > cPart) return true;
    if (lPart < cPart) return false;
  }

  return false;
}

/**
 * Returns the path to the user-scoped update cache file.
 *
 * @returns {string}
 */
export function getCachePath() {
  const dir = path.join(os.homedir(), ".codemcp");
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }
  return path.join(dir, "update-cache.json");
}

/**
 * Fetches the latest published version from the npm registry, leveraging a 4-hour local cache.
 *
 * @param {string} packageName
 * @returns {Promise<string|null>}
 */
export async function getLatestVersion(packageName) {
  const cachePath = getCachePath();

  // 1. Check local cache first (0ms latency)
  try {
    if (fs.existsSync(cachePath)) {
      const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
      if (
        cache.packageName === packageName &&
        cache.latestVersion &&
        Date.now() - cache.timestamp < CACHE_TTL_MS
      ) {
        return cache.latestVersion;
      }
    }
  } catch {}

  // 2. Fetch from registry with strict timeout
  try {
    const res = await fetch(`https://registry.npmjs.org/${packageName}/latest`, {
      signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json();

    if (data?.version && typeof data.version === "string") {
      // Save cache entry
      try {
        fs.writeFileSync(
          cachePath,
          JSON.stringify({
            packageName,
            latestVersion: data.version,
            timestamp: Date.now(),
          }),
          "utf8",
        );
      } catch {}
      return data.version;
    }
  } catch {
    // Fail silently on timeout, network drop, or registry failure
  }

  return null;
}

/**
 * Detects the active or originating package manager based on binary path and user agent.
 *
 * @returns {"npm"|"pnpm"|"yarn"|"bun"}
 */
export function detectPackageManager() {
  const execPath = (process.argv[1] || "").toLowerCase();
  if (execPath.includes("pnpm")) return "pnpm";
  if (execPath.includes("yarn")) return "yarn";
  if (execPath.includes("bun")) return "bun";

  const agent = (process.env.npm_config_user_agent || "").toLowerCase();
  if (agent.startsWith("pnpm")) return "pnpm";
  if (agent.startsWith("yarn")) return "yarn";
  if (agent.startsWith("bun")) return "bun";

  return "npm";
}

/**
 * Safely executes the global package update command without shell injection vulnerabilities.
 *
 * @param {string} packageName
 * @returns {{ success: boolean, error?: string, cmd: string }}
 */
export function runPackageUpdate(packageName) {
  const pm = detectPackageManager();
  const isWin = process.platform === "win32";

  let cmd = pm;
  let args = [];

  switch (pm) {
    case "pnpm":
      args = ["add", "-g", `${packageName}@latest`];
      break;
    case "yarn":
      args = ["global", "add", `${packageName}@latest`];
      break;
    case "bun":
      args = ["add", "-g", `${packageName}@latest`];
      break;
    case "npm":
    default:
      cmd = "npm";
      args = ["install", "-g", `${packageName}@latest`];
      break;
  }

  const result = spawnSync(cmd, args, {
    stdio: "pipe",
    encoding: "utf8",
    shell: isWin, // Required on Windows to invoke .cmd shims via %COMSPEC%
    timeout: 60000, // 60s hard timeout
  });

  if (result.error || result.status !== 0) {
    return {
      success: false,
      error:
        result.error?.message || result.stderr || "Installation process failed",
      cmd: `${cmd} ${args.join(" ")}`,
    };
  }

  return { success: true, cmd: `${cmd} ${args.join(" ")}` };
}

/**
 * Primary update checker hook executed during project initialization.
 * Prompts user if an update is available, executes update if confirmed, or proceeds seamlessly.
 *
 * @param {object} [options={}] - CLI flags and options
 */
export async function checkAndUpdateProject(options = {}) {
  // Pre-flight defensive guards
  if (
    options.silent ||
    options.yes ||
    options.updateCheck === false ||
    options.noUpdateCheck
  ) {
    return;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY || process.env.CI) {
    return;
  }

  if (isDevEnvironment()) {
    return;
  }

  const pkg = getPackageInfo();
  const currentVersion = process.env.MOCK_CURRENT_VERSION || pkg.version || "2.1.1";
  const packageName = pkg.name || "@mahesh2-lab/codemcp";

  const latestVersion =
    process.env.MOCK_LATEST_VERSION || (await getLatestVersion(packageName));
  if (!latestVersion || !isNewerVersion(currentVersion, latestVersion)) {
    return;
  }

  // Handle ephemeral npx invocation
  if (process.env.FORCE_UPDATE_CHECK !== "true" && isNpxInvocation()) {
    p.note(
      `A new version of CodeMCP is available (${pc.dim("v" + currentVersion)} → ${pc.green("v" + latestVersion)}).\nRun with: ${pc.cyan(`npx ${packageName}@latest init`)}`,
      pc.yellow("Update Available"),
    );
    return;
  }

  // Interactive prompt
  const shouldUpdate = await p.confirm({
    message: `A new version of CodeMCP is available (${pc.dim("v" + currentVersion)} → ${pc.green("v" + latestVersion)}). Would you like to update now?`,
    initialValue: true,
  });

  if (p.isCancel(shouldUpdate)) {
    p.cancel("Initialization cancelled.");
    process.exit(0);
  }

  if (!shouldUpdate) {
    return; // Proceed seamlessly to standard init
  }

  // Execute update
  const s = p.spinner();
  s.start(`Updating ${packageName} to v${latestVersion}...`);

  const updateResult = runPackageUpdate(packageName);

  if (!updateResult.success) {
    s.stop(pc.yellow("⚠ Automatic update failed."));
    const sudoHint =
      process.platform !== "win32"
        ? `sudo ${updateResult.cmd}`
        : updateResult.cmd;
    p.note(
      `Could not update automatically. You can update manually:\n  ${pc.bold(pc.cyan(sudoHint))}\n\nContinuing initialization with current version (v${currentVersion})...`,
      pc.yellow("Update Notice"),
    );
    return; // Never block user; proceed with init
  }

  s.stop(pc.green(`✔ CodeMCP updated successfully to v${latestVersion}!`));

  // Invalidate local cache so next run fetches or operates on fresh state
  try {
    const cachePath = getCachePath();
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
    }
  } catch {}

  p.note(
    `CodeMCP is now up-to-date.\nPlease re-run: ${pc.bold(pc.cyan("codemcp init"))}`,
    pc.green("Update Complete"),
  );

  // Clean Handshake Exit: avoids Windows EBUSY / memory split-brain
  process.exit(0);
}
