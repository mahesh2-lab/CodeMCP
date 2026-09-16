import crypto from "node:crypto";
import { getEnv, setEnv } from "../utils/env.js";
import { getCredential, setCredential } from "../utils/credentials.js";
import { logger } from "../utils/logger.js";

const OAUTH_CLIENTS_KEY = "OAUTH_CLIENTS";

// Client registrations survive restarts; authorization codes remain short-lived in memory.
export const clientStore = new Map();
export const authCodeStore = new Map();

function loadPersistedClients() {
  const serialized = getCredential(OAUTH_CLIENTS_KEY, "");
  if (!serialized) return;

  try {
    const clients = JSON.parse(serialized);
    if (!Array.isArray(clients)) return;

    for (const client of clients) {
      if (
        client &&
        typeof client.client_id === "string" &&
        Array.isArray(client.redirect_uris)
      ) {
        clientStore.set(client.client_id, client);
      }
    }
  } catch {
    // Ignore invalid persisted data and allow new registrations to proceed.
  }
}

function persistClients() {
  setCredential(OAUTH_CLIENTS_KEY, JSON.stringify([...clientStore.values()]));
}

loadPersistedClients();

/** Auth code expiration: 5 minutes */
export const AUTH_CODE_TTL_MS = 5 * 60 * 1000;

/** JWT token expiration: 1 hour */
export const TOKEN_EXPIRY_SECONDS = 3600;

/**
 * Sweeps expired authorization codes to prevent in-memory accumulation.
 */
export function cleanupExpiredAuthCodes(now = Date.now()) {
  for (const [code, entry] of authCodeStore.entries()) {
    if (entry.expiresAt <= now || entry.used) {
      authCodeStore.delete(code);
    }
  }
}

const cleanupTimer = setInterval(cleanupExpiredAuthCodes, 60 * 1000);
cleanupTimer.unref();

/**
 * Returns the effective JWT signing secret.
 * Priority: JWT_SECRET env var > persisted vault secret > generate-and-persist new one.
 * Persisting means the secret survives server restarts, so existing tokens remain valid.
 */
export function getJwtSecret() {
  const envSecret = getEnv("JWT_SECRET", "");
  if (envSecret) {
    return envSecret;
  }

  const vaultSecret = getCredential("JWT_SECRET", "");
  if (vaultSecret) {
    return vaultSecret;
  }

  // First boot: generate a stable secret and save it to the vault
  const generated = crypto.randomBytes(32).toString("hex");
  setCredential("JWT_SECRET", generated);
  return generated;
}

/**
 * Resolves the public base URL of the server for metadata and token claims.
 * Checks PUBLIC_URL / SERVER_URL env, X-Forwarded headers, active tunnel, or request host.
 *
 * @param {import("express").Request} req
 * @returns {string}
 */
export function getBaseUrl(req) {
  const explicit = getEnv("PUBLIC_URL", "") || getEnv("SERVER_URL", "");
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }

  const forwardedProto = req?.headers?.["x-forwarded-proto"];
  const forwardedHost = req?.headers?.["x-forwarded-host"];
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`.replace(/\/+$/, "");
  }

  if (req?.protocol && req?.get?.("host")) {
    return `${req.protocol}://${req.get("host")}`.replace(/\/+$/, "");
  }

  const port = getEnv("PORT", "4173");
  return `http://localhost:${port}`;
}

/**
 * Base64URL encoder without padding.
 * @param {Buffer|string} input
 * @returns {string}
 */
export function base64UrlEncode(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Base64URL decoder.
 * @param {string} str
 * @returns {Buffer}
 */
export function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64");
}

/**
 * Registers a new dynamic OAuth client (RFC 7591).
 *
 * @param {object} metadata
 * @param {string[]} metadata.redirect_uris
 * @param {string} [metadata.client_name]
 * @param {string} [metadata.client_uri]
 * @returns {object} Client registration details
 */
export function registerClient(metadata = {}) {
  const redirectUris = Array.isArray(metadata.redirect_uris)
    ? metadata.redirect_uris.filter(
        (u) => typeof u === "string" && u.trim().length > 0,
      )
    : [];

  if (redirectUris.length === 0) {
    throw new Error("At least one redirect_uri is required for registration");
  }

  const clientId = crypto.randomUUID();
  const clientName =
    typeof metadata.client_name === "string" && metadata.client_name.trim()
      ? metadata.client_name.trim()
      : `Client-${clientId.slice(0, 8)}`;

  const client = {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: clientName,
    client_uri: metadata.client_uri || "",
    redirect_uris: redirectUris,
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };

  clientStore.set(clientId, client);
  persistClients();
  return client;
}

/**
 * Retrieves a registered client by client_id.
 * @param {string} clientId
 * @returns {object|null}
 */
export function getClient(clientId) {
  if (!clientId || typeof clientId !== "string") return null;
  return clientStore.get(clientId) || null;
}

/** Password rotation interval: 7 days in milliseconds */
const PASSWORD_ROTATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Gets the configured OWNER_PASSWORD, or generates a stable random password
 * and persists it in the encrypted credential vault (~/.codemcp/credentials.enc).
 * Auto-generated passwords are rotated every 7 days.
 *
 * @returns {string}
 */
export function getOwnerPassword() {
  // User-supplied password is never rotated
  const envPass = process.env.OWNER_PASSWORD?.trim();
  if (envPass) return envPass;

  const existing = getEnv("OWNER_PASSWORD", "");
  // Read timestamp directly from vault (not via getEnv, since it's not a sensitive key)
  const createdAt = parseInt(
    getCredential("OWNER_PASSWORD_CREATED_AT", "0"),
    10,
  );
  const isExpired = !createdAt || Date.now() - createdAt > PASSWORD_ROTATION_MS;

  if (existing && !isExpired) {
    return existing;
  }

  if (existing && isExpired) {
    logger.serverInfo(
      "Auto-generated password has expired (7-day rotation). Generating a new one.",
    );
  }

  // Generate and persist both password + timestamp to the encrypted vault
  const generated = crypto.randomBytes(8).toString("hex");
  setEnv("OWNER_PASSWORD", generated);
  setCredential("OWNER_PASSWORD_CREATED_AT", String(Date.now()));
  return generated;
}

/** True only when the user explicitly set OWNER_PASSWORD before server startup */
const _userSetOwnerPassword = Boolean(
  process.env.OWNER_PASSWORD && process.env.OWNER_PASSWORD.trim(),
);

/**
 * Checks if the current password was auto-generated (not explicitly set via env).
 * A vault-persisted password from a previous session is still considered auto-generated.
 * @returns {boolean}
 */
export function isAutoGeneratedPassword() {
  return !_userSetOwnerPassword;
}

/**
 * Validates the owner password using constant-time comparison.
 *
 * @param {string} passwordInput
 * @returns {boolean}
 */
export function verifyOwnerPassword(passwordInput) {
  const expectedPassword = getOwnerPassword();

  if (typeof passwordInput !== "string" || !passwordInput) {
    return false;
  }

  const inputBuffer = Buffer.from(passwordInput, "utf8");
  const expectedBuffer = Buffer.from(expectedPassword, "utf8");

  if (inputBuffer.length !== expectedBuffer.length) {
    // Perform dummy timing comparison to equalize branch time
    crypto.timingSafeEqual(inputBuffer, inputBuffer);
    return false;
  }

  return crypto.timingSafeEqual(inputBuffer, expectedBuffer);
}

/**
 * Issues an authorization code for a client and stores it in memory.
 *
 * @param {object} params
 * @param {string} params.clientId
 * @param {string} params.redirectUri
 * @param {string} params.codeChallenge
 * @param {string} params.codeChallengeMethod
 * @param {string} [params.scope]
 * @returns {string} The issued authorization code
 */
export function createAuthCode({
  clientId,
  redirectUri,
  codeChallenge,
  codeChallengeMethod,
  scope = "mcp",
}) {
  const code = crypto.randomBytes(32).toString("hex");
  const record = {
    code,
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod: codeChallengeMethod || "S256",
    scope,
    expiresAt: Date.now() + AUTH_CODE_TTL_MS,
    used: false,
  };

  authCodeStore.set(code, record);
  return code;
}

/**
 * Verifies a PKCE code_verifier against the stored code_challenge using S256.
 *
 * @param {string} verifier
 * @param {string} challenge
 * @param {string} [method="S256"]
 * @returns {boolean}
 */
export function verifyPkce(verifier, challenge, method = "S256") {
  if (!verifier || !challenge) return false;
  if (method !== "S256") return false;

  const hash = crypto.createHash("sha256").update(verifier).digest();
  const calculatedChallenge = base64UrlEncode(hash);

  const calcBuf = Buffer.from(calculatedChallenge, "utf8");
  const targetBuf = Buffer.from(challenge, "utf8");

  if (calcBuf.length !== targetBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(calcBuf, targetBuf);
}

/**
 * Exchanges an authorization code for client metadata and invalidates the code.
 *
 * @param {string} code
 * @param {string} clientId
 * @param {string} redirectUri
 * @param {string} codeVerifier
 * @returns {{ ok: boolean, error?: string, errorDescription?: string, record?: object }}
 */
export function consumeAuthCode(code, clientId, redirectUri, codeVerifier) {
  if (!code || typeof code !== "string") {
    return {
      ok: false,
      error: "invalid_request",
      errorDescription: "Missing authorization code",
    };
  }

  const record = authCodeStore.get(code);
  if (!record) {
    return {
      ok: false,
      error: "invalid_grant",
      errorDescription: "Authorization code not found",
    };
  }

  if (record.used) {
    authCodeStore.delete(code);
    return {
      ok: false,
      error: "invalid_grant",
      errorDescription: "Authorization code has already been used",
    };
  }

  if (Date.now() > record.expiresAt) {
    authCodeStore.delete(code);
    return {
      ok: false,
      error: "invalid_grant",
      errorDescription: "Authorization code has expired",
    };
  }

  if (record.clientId !== clientId) {
    return {
      ok: false,
      error: "invalid_grant",
      errorDescription: "client_id does not match authorization code",
    };
  }

  if (record.redirectUri !== redirectUri) {
    return {
      ok: false,
      error: "invalid_grant",
      errorDescription: "redirect_uri does not match authorization code",
    };
  }

  if (
    !verifyPkce(codeVerifier, record.codeChallenge, record.codeChallengeMethod)
  ) {
    return {
      ok: false,
      error: "invalid_grant",
      errorDescription: "PKCE verification failed",
    };
  }

  // Mark as used and delete immediately
  record.used = true;
  authCodeStore.delete(code);

  return { ok: true, record };
}

/**
 * Generates an HMAC-SHA256 (HS256) JWT access token.
 *
 * @param {object} params
 * @param {string} params.clientId
 * @param {string} params.baseUrl
 * @param {string} [params.sub="owner"]
 * @param {string} [params.scope="mcp"]
 * @param {number} [params.expiresIn=TOKEN_EXPIRY_SECONDS]
 * @returns {string} The signed JWT string
 */
export function generateAccessToken({
  clientId,
  baseUrl,
  sub = "owner",
  scope = "mcp",
  expiresIn = TOKEN_EXPIRY_SECONDS,
}) {
  const secret = getJwtSecret();
  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: baseUrl,
    sub,
    aud: [baseUrl, `${baseUrl}/mcp`],
    client_id: clientId,
    scope,
    iat: now,
    exp: now + expiresIn,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac("sha256", secret)
    .update(signatureInput)
    .digest();
  const encodedSignature = base64UrlEncode(signature);

  return `${signatureInput}.${encodedSignature}`;
}

/**
 * Verifies and decodes an HMAC-SHA256 (HS256) JWT access token.
 *
 * @param {string} token
 * @returns {{ valid: boolean, error?: string, payload?: object }}
 */
export function verifyAccessToken(token) {
  if (!token || typeof token !== "string") {
    return { valid: false, error: "Token missing" };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return { valid: false, error: "Malformed token format" };
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const secret = getJwtSecret();
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(signatureInput)
    .digest();
  const calculatedSig = base64UrlEncode(expectedSig);

  const givenSigBuf = Buffer.from(encodedSignature, "utf8");
  const calcSigBuf = Buffer.from(calculatedSig, "utf8");

  if (
    givenSigBuf.length !== calcSigBuf.length ||
    !crypto.timingSafeEqual(givenSigBuf, calcSigBuf)
  ) {
    return { valid: false, error: "Invalid token signature" };
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8"));
  } catch {
    return { valid: false, error: "Invalid token payload JSON" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    return { valid: false, error: "Token has expired", payload };
  }

  return { valid: true, payload };
}
