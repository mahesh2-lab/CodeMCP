import { getCredential, setCredential, isSensitiveKey } from "./credentials.js";

/**
 * Gets an environment variable or secure credential by name.
 * Priority: process.env > secure credential vault (~/.codemcp/credentials.enc) > fallback
 *
 * @param {string} name - Name of the variable
 * @param {string|number} [fallback=""] - Fallback value if missing or empty
 * @returns {string} The trimmed value or fallback
 */
export function getEnv(name, fallback = "") {
  const envValue = process.env[name];
  if (envValue !== undefined && envValue !== null && String(envValue).trim() !== "") {
    return String(envValue).trim();
  }

  const credValue = getCredential(name);
  if (credValue) {
    return credValue;
  }

  return String(fallback ?? "");
}

/**
 * Sets a configuration value in memory and in the secure vault if sensitive.
 * No .env file is ever created or written to.
 *
 * @param {string} name - Name of the variable
 * @param {string|number} value - Value to set
 */
export function setEnv(name, value) {
  const strVal = String(value ?? "").trim();
  process.env[name] = strVal;

  if (isSensitiveKey(name)) {
    // Save to machine-bound encrypted vault outside project repositories
    setCredential(name, strVal);
  }
}

export default getEnv;
