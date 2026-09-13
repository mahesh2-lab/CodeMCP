import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CODEMCP_DIR = path.join(os.homedir(), ".codemcp");
const CODUIT_DIR = path.join(os.homedir(), ".coduit");
const DEVNET_DIR = path.join(os.homedir(), ".devnet");
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

/**
 * Derives a consistent, machine-bound 256-bit encryption key.
 *
 * @param {string} [saltStr="codemcp-secure-vault-salt-v1"]
 * @returns {Buffer}
 */
function deriveEncryptionKey(saltStr = "codemcp-secure-vault-salt-v1") {
  const machineFingerprint = [
    os.userInfo().username || "user",
    os.hostname() || "host",
    os.homedir() || "home",
    process.platform,
    process.arch,
  ].join("::");

  const salt = Buffer.from(saltStr, "utf-8");
  return crypto.pbkdf2Sync(machineFingerprint, salt, 100000, 32, "sha256");
}

/**
 * Ensures the ~/.codemcp directory exists with owner-only access permissions on POSIX.
 */
function ensureVaultDir() {
  if (!fs.existsSync(VAULT_DIR)) {
    fs.mkdirSync(VAULT_DIR, { recursive: true, mode: 0o700 });
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
 * Seamlessly migrates from legacy ~/.coduit or ~/.devnet if present.
 *
 * @returns {Record<string, string>}
 */
export function getAllCredentials() {
  let targetFile = VAULT_FILE;

  if (!fs.existsSync(VAULT_FILE)) {
    const coduitFile = path.join(CODUIT_DIR, "credentials.enc");
    const devnetFile = path.join(DEVNET_DIR, "credentials.enc");

    if (fs.existsSync(coduitFile)) {
      targetFile = coduitFile;
    } else if (fs.existsSync(devnetFile)) {
      targetFile = devnetFile;
    } else {
      return {};
    }
  }

  try {
    const raw = fs.readFileSync(targetFile, "utf-8");
    const payload = JSON.parse(raw);

    if (!payload.iv || !payload.authTag || !payload.ciphertext) {
      return {};
    }

    let creds = null;

    // 1. Try current CodeMCP encryption key
    try {
      creds = tryDecrypt(payload, deriveEncryptionKey("codemcp-secure-vault-salt-v1"));
    } catch {
      // 2. Fall back to Coduit encryption key
      try {
        creds = tryDecrypt(payload, deriveEncryptionKey("coduit-mcp-secure-vault-salt-v1"));
      } catch {
        // 3. Fall back to legacy DevNet encryption key
        creds = tryDecrypt(payload, deriveEncryptionKey("devnet-mcp-secure-vault-salt-v1"));
      }

      if (creds) {
        saveAllCredentials(creds);
      }
    }

    // If loaded from older path, save to ~/.codemcp/credentials.enc
    if (creds && targetFile !== VAULT_FILE) {
      saveAllCredentials(creds);
    }

    return creds || {};
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

  const key = deriveEncryptionKey("codemcp-secure-vault-salt-v1");
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
export function listCredentialKeys() {
  const creds = getAllCredentials();
  return Object.keys(creds);
}

/**
 * Clears all credentials stored in the vault.
 */
export function clearAllCredentials() {
  saveAllCredentials({});
  const coduitFile = path.join(CODUIT_DIR, "credentials.enc");
  const devnetFile = path.join(DEVNET_DIR, "credentials.enc");
  try { if (fs.existsSync(coduitFile)) fs.unlinkSync(coduitFile); } catch {}
  try { if (fs.existsSync(devnetFile)) fs.unlinkSync(devnetFile); } catch {}
}


export { VAULT_FILE, VAULT_DIR, CODEMCP_DIR, CODUIT_DIR, DEVNET_DIR };
