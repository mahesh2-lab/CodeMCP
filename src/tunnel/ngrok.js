import { exec } from "node:child_process";
import ngrok from "@ngrok/ngrok";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { logger } from "../utils/logger.js";
import { getEnv, setEnv } from "../utils/env.js";
import { deleteCredential } from "../utils/credentials.js";

function getHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey || getEnv("NGROK_API_KEY")}`,
    "ngrok-version": "2",
    "Content-Type": "application/json",
  };
}

/**
 * Validates an ngrok API key by making a test request to the ngrok API.
 *
 * @param {string} apiKey - The ngrok API key to validate
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function validateApiKey(apiKey) {
  const key = apiKey?.trim();
  if (!key) {
    return { ok: false, error: "API key cannot be empty" };
  }

  try {
    const res = await fetch("https://api.ngrok.com/api_keys?limit=1", {
      method: "GET",
      headers: getHeaders(key),
    });

    if (res.ok) {
      return { ok: true };
    }

    const data = await res.json().catch(() => ({}));
    const errorMsg = data?.msg || `ngrok API returned HTTP ${res.status}`;
    return { ok: false, error: errorMsg };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to connect to ngrok API: ${err.message}`,
    };
  }
}

export function openBrowser(url) {
  const cmd =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  try {
    exec(cmd);
  } catch {}
}

let cachedApiKey = null;
let endpointLimitReached = false;

export function isEndpointLimitReached() {
  return endpointLimitReached;
}

/**
 * Checks for NGROK_API_KEY, verifies that it works, and prompts the user if missing or invalid.
 */
export async function ensureApiKey() {
  if (cachedApiKey) return cachedApiKey;

  let apiKey = getEnv("NGROK_API_KEY");
  if (apiKey) {
    const check = await validateApiKey(apiKey);
    if (check.ok) {
      cachedApiKey = apiKey;
      return apiKey;
    }
    logger.tunnelWarn(
      `Stored NGROK_API_KEY is not working: ${check.error}. Re-authenticating...`,
    );
    deleteCredential("NGROK_API_KEY");
    apiKey = null;
  }

  const url = "https://dashboard.ngrok.com/api-keys";
  console.log(
    `\nOpening ${pc.cyan(url)} in your browser to create or view your API key...\n`,
  );

  openBrowser(url);

  while (!apiKey) {
    let inputKey = "";

    if (process.stdin.isTTY) {
      const response = await p.password({
        message: "Paste your ngrok API Key here:",
        validate: (val) => (!val?.trim() ? "API key is required" : undefined),
      });

      if (p.isCancel(response) || !response?.trim()) {
        p.cancel("Setup cancelled. Missing NGROK_API_KEY.");
        console.log(
          pc.dim("  Tip: To run locally without a public tunnel, use: ") +
            pc.cyan("codemcp --no-tunnel\n"),
        );
        process.exit(0);
      }

      inputKey = response.trim();
    } else {
      const readline = await import("node:readline/promises");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      const response = await rl.question("Paste your ngrok API Key here: ");
      rl.close();
      if (!response?.trim()) {
        console.log(pc.yellow("Setup cancelled. Missing NGROK_API_KEY."));
        console.log(
          pc.dim("  Tip: To run locally without a public tunnel, use: ") +
            pc.cyan("codemcp --no-tunnel\n"),
        );
        process.exit(0);
      }
      inputKey = response.trim();
    }

    const spinner = process.stdin.isTTY ? p.spinner() : null;
    spinner?.start("Verifying ngrok API key with ngrok.com...");

    const check = await validateApiKey(inputKey);

    if (check.ok) {
      spinner?.stop(pc.green("✔ ngrok API key verified successfully!"));
      apiKey = inputKey;
      cachedApiKey = apiKey;
      setEnv("NGROK_API_KEY", apiKey);
      logger.tunnelInfo(
        "Saved valid NGROK_API_KEY to secure user vault (~/.codemcp/credentials.enc)",
      );
    } else {
      spinner?.stop(pc.red(`✖ Invalid ngrok API key: ${check.error}`));
      if (!process.stdin.isTTY) {
        console.error(
          pc.red(`[ngrok] API key validation failed: ${check.error}`),
        );
        process.exit(1);
      }
      console.log(
        pc.yellow(
          "  Please check your key at https://dashboard.ngrok.com/api-keys and try again.\n",
        ),
      );
    }
  }

  return apiKey;
}

/**
 * Gets the existing authtoken or provisions a new one via the ngrok API.
 */
export async function getOrCreateToken(description = "codemcp-agent") {
  let token = getEnv("NGROK_AUTHTOKEN");
  if (token) return token;

  const apiKey = await ensureApiKey();
  if (!apiKey) {
    logger.tunnelWarn("Missing ngrok API key. Cannot provision authtoken.");
    return null;
  }

  try {
    const cred = await fetch("https://api.ngrok.com/credentials", {
      method: "POST",
      headers: getHeaders(apiKey),
      body: JSON.stringify({ description }),
    }).then((r) => r.json());

    if (cred.token) {
      token = cred.token;
      setEnv("NGROK_AUTHTOKEN", token);
      logger.tunnelInfo(
        "Provisioned new authtoken and saved to secure user vault (~/.codemcp/credentials.enc)",
      );
    }
  } catch (err) {
    logger.tunnelError("Failed to create ngrok authtoken", err);
  }

  return token;
}

/**
 * Provisions a new reserved domain via the ngrok API.
 */
export async function createReservedDomain(options = {}) {
  const apiKey = await ensureApiKey();
  if (!apiKey) return null;

  try {
    const body =
      typeof options === "string" ? { description: options } : options;
    const res = await fetch("https://api.ngrok.com/reserved_domains", {
      method: "POST",
      headers: getHeaders(apiKey),
      body: JSON.stringify(body),
    }).then((r) => r.json());

    if (res?.domain) {
      setEnv("NGROK_DOMAIN", res.domain);
      logger.tunnelInfo(
        `Created reserved domain (${res.domain}) and saved to secure user vault (~/.codemcp/credentials.enc)`,
      );
      return res.domain;
    }

    if (res?.msg) {
      logger.tunnelWarn(`Failed to create reserved domain: ${res.msg}`);
    }
  } catch (err) {
    logger.tunnelError("Failed to create reserved domain", err);
  }

  return null;
}

/**
 * Gets the configured domain, fetches the first reserved domain on the account,
 * or provisions a new one if not found.
 */
export async function getOrCreateDomain(options = "codemcp-agent") {
  let domain = getEnv("NGROK_DOMAIN");
  if (domain) return domain;

  const apiKey = await ensureApiKey();
  if (!apiKey) return null;

  try {
    const { reserved_domains } = await fetch(
      "https://api.ngrok.com/reserved_domains",
      { headers: getHeaders(apiKey) },
    ).then((r) => r.json());

    domain = reserved_domains?.[0]?.domain;
    if (domain) {
      setEnv("NGROK_DOMAIN", domain);
      logger.tunnelInfo(
        `Found reserved domain (${domain}) and saved to secure user vault (~/.codemcp/credentials.enc)`,
      );
      return domain;
    }

    return await createReservedDomain(options);
  } catch (err) {
    logger.tunnelError("Failed to fetch reserved domains", err);
    return null;
  }
}

/**
 * Starts an ngrok tunnel using the official @ngrok/ngrok package.
 */
export async function startTunnel(port, description = "codemcp-agent") {
  if (getEnv("NGROK_ENABLED") === "false") {
    return null;
  }

  const authtoken = await getOrCreateToken(description);
  if (!authtoken) {
    logger.tunnelWarn("Missing ngrok authtoken. Skipping tunnel.");
    return null;
  }

  const domain = await getOrCreateDomain(description);

  try {
    const config = { addr: port, authtoken };
    if (domain) config.domain = domain;

    const listener = await ngrok.forward(config);
    endpointLimitReached = false;
    return listener;
  } catch (err) {
    const message = String(err?.message || err);
    if (/more than \d+ endpoints|endpoint.*limit|quota/i.test(message)) {
      endpointLimitReached = true;
      logger.tunnelWarn(
        "ngrok endpoint limit reached. Continuing with the local MCP URL. Close unused ngrok endpoints or run with --no-tunnel.",
      );
      return null;
    }
    logger.tunnelError("Failed to start ngrok tunnel", err);
    return null;
  }
}

/**
 * Stops an active ngrok tunnel listener.
 */
export async function stopTunnel(listener) {
  if (!listener) return;
  try {
    await listener.close();
  } catch (err) {
    logger.tunnelError("Close error", err);
  }
}

export default startTunnel;
