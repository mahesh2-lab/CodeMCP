import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CODEMCP_DIR = path.join(os.homedir(), ".codemcp");
const VAULT_DIR = CODEMCP_DIR;
const VAULT_FILE = path.join(VAULT_DIR, "credentials.enc");

const SENSITIVE_KEYS = new Set([
  "NGROK_API_KEY",
  "NGROK_AUTHTOKEN",
  "NGROK_DOMAIN",
  "API_KEY",
]);

/**
 * Checks if a key name is considered sensitive and belongs in the vault.
 *
 * @param {string} key
 * @returns {boolean}
 */
export function isSensitiveKey(key) {
  return SENSITIVE_KEYS.has(key) || /^(.*_)?(KEY|TOKEN|SECRET|PASSWORD|AUTH)$/i.test(key);
}


const MACHINE_KEY_FILE = path.join(CODEMCP_DIR, ".machine_key");

function getMachineSecret() {
  ensureVaultDir();
  if (fs.existsSync(MACHINE_KEY_FILE)) {
    return fs.readFileSync(MACHINE_KEY_FILE, "utf-8").trim();
  }
  const secret = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(MACHINE_KEY_FILE, secret, { encoding: "utf-8", mode: 0o600 });
  return secret;
}

/**
 * Derives a consistent, machine-bound 256-bit encryption key.
 *
 * @param {string} [secretInput]
 * @returns {Buffer}
 */
function deriveEncryptionKey(secretInput = null) {
  const secret = secretInput || getMachineSecret();
  const salt = Buffer.from("codemcp-secure-vault-salt-v1", "utf-8");
  return crypto.pbkdf2Sync(secret, salt, 100000, 32, "sha256");
}

/**
 * Ensures the ~/.codemcp directory exists with owner-only access permissions on POSIX.
 */
function ensureVaultDir() {
  if (!fs.existsSync(VAULT_DIR)) {
    fs.mkdirSync(VAULT_DIR, { recursive: true, mode: 0o700 });
  } else if (process.platform !== "win32") {
    try {
      fs.chmodSync(VAULT_DIR, 0o700);
    } catch {}
  }
}

/**
 * Attempts to decrypt payload using the specified key.
 */
function tryDecrypt(payload, key) {
  const iv = Buffer.from(payload.iv, "hex");
  const authTag = Buffer.from(payload.authTag, "hex");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(payload.ciphertext, "hex", "utf-8");
  decrypted += decipher.final("utf-8");

  return JSON.parse(decrypted);
}

/**
 * Reads and decrypts all credentials from ~/.codemcp/credentials.enc.
 * Supports transparent migration from legacy fingerprint and hex-encoded keys.
 *
 * @returns {Record<string, string>}
 */
export function getAllCredentials() {
  if (!fs.existsSync(VAULT_FILE)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(VAULT_FILE, "utf-8");
    const payload = JSON.parse(raw);

    if (!payload.iv || !payload.authTag || !payload.ciphertext) {
      return {};
    }

    const salt = Buffer.from("codemcp-secure-vault-salt-v1", "utf-8");
    const canonicalKey = deriveEncryptionKey();

    // 1. Primary: canonical machine secret key
    try {
      const creds = tryDecrypt(payload, canonicalKey);
      if (creds && typeof creds === "object") return creds;
    } catch {}

    // 2. Fallback: key derived when 'codemcp-secure-vault-salt-v1' was mistakenly passed as secret
    try {
      const saltAsSecretKey = crypto.pbkdf2Sync("codemcp-secure-vault-salt-v1", salt, 100000, 32, "sha256");
      const creds = tryDecrypt(payload, saltAsSecretKey);
      if (creds && typeof creds === "object") {
        saveAllCredentials(creds);
        return creds;
      }
    } catch {}

    // 3. Fallback: key derived from reading .machine_key with hex encoding
    if (fs.existsSync(MACHINE_KEY_FILE)) {
      try {
        const hexSecret = fs.readFileSync(MACHINE_KEY_FILE, "hex");
        const hexKey = crypto.pbkdf2Sync(hexSecret, salt, 100000, 32, "sha256");
        const creds = tryDecrypt(payload, hexKey);
        if (creds && typeof creds === "object") {
          // Re-encrypt with canonical key so future reads are fast and standard
          saveAllCredentials(creds);
          return creds;
        }
      } catch {}
    }

    // 4. Fallback: legacy OS fingerprint key
    try {
      const machineFingerprint = [
        os.userInfo().username || "user",
        os.hostname() || "host",
        os.homedir() || "home",
        process.platform,
        process.arch,
      ].join("::");
      const legacyKey = crypto.pbkdf2Sync(machineFingerprint, salt, 100000, 32, "sha256");
      const creds = tryDecrypt(payload, legacyKey);
      if (creds && typeof creds === "object") {
        saveAllCredentials(creds);
        return creds;
      }
    } catch {}

    throw new Error("Unsupported state or unable to authenticate data");
  } catch (err) {
    console.warn(`[credentials] Warning: Could not read secure vault: ${err.message}`);
    return {};
  }
}

/**
 * Encrypts and saves all credentials to ~/.codemcp/credentials.enc.
 *
 * @param {Record<string, string>} creds
 */
function saveAllCredentials(creds) {
  ensureVaultDir();

  const key = deriveEncryptionKey();
  const iv = crypto.randomBytes(12); // Standard 96-bit IV for AES-GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const plaintext = JSON.stringify(creds, null, 2);
  let ciphertext = cipher.update(plaintext, "utf-8", "hex");
  ciphertext += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");

  const payload = {
    version: 1,
    iv: iv.toString("hex"),
    authTag,
    ciphertext,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(VAULT_FILE, JSON.stringify(payload, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });

  if (process.platform !== "win32") {
    try {
      fs.chmodSync(VAULT_FILE, 0o600);
    } catch {}
  }
}

/**
 * Retrieves a single credential from the secure vault.
 *
 * @param {string} key
 * @param {string} [fallback=""]
 * @returns {string}
 */
export function getCredential(key, fallback = "") {
  const creds = getAllCredentials();
  const val = creds[key];
  if (val === undefined || val === null || String(val).trim() === "") {
    return fallback;
  }
  return String(val).trim();
}

/**
 * Saves or updates a single credential in the secure vault.
 *
 * @param {string} key
 * @param {string} value
 */
export function setCredential(key, value) {
  const creds = getAllCredentials();
  creds[key] = String(value ?? "").trim();
  saveAllCredentials(creds);
}

/**
 * Deletes a credential from the secure vault.
 *
 * @param {string} key
 * @returns {boolean} True if deleted
 */
export function deleteCredential(key) {
  const creds = getAllCredentials();
  if (key in creds) {
    delete creds[key];
    saveAllCredentials(creds);
    return true;
  }
  return false;
}

/**
 * Lists all credential key names currently stored in the vault.
 *
 * @returns {string[]}
 */
function listCredentialKeys() {
  const creds = getAllCredentials();
  return Object.keys(creds);
}

/**
 * Clears all credentials stored in the vault.
 */
export function clearAllCredentials() {
  saveAllCredentials({});
}

export { VAULT_FILE };
