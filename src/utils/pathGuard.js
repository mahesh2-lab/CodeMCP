import path from "node:path";
import fs from "node:fs";
import { getEnv } from "./env.js";

export class PathGuardError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "PathGuardError";
    this.statusCode = statusCode;
  }
}

export function getProjectRoot() {
  return path.resolve(getEnv("PROJECT_ROOT", "."));
}

export const PROJECT_ROOT = getProjectRoot();

export function getIgnorePatterns(customRoot = getProjectRoot()) {
  const patterns = new Set([
    "node_modules",
    ".git",
    ".env",
    ".env.*",
    "dist",
    "build",
    ".next",
    "venv",
    "__pycache__",
    ...getEnv("IGNORED_DIRS", "").split(",").map((s) => s.trim()).filter(Boolean),
  ]);

  const mcpIgnorePath = path.join(customRoot, ".mcpignore");
  if (fs.existsSync(mcpIgnorePath)) {
    try {
      const lines = fs.readFileSync(mcpIgnorePath, "utf8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) patterns.add(trimmed);
      }
    } catch {}
  }

  const gitIgnorePath = path.join(customRoot, ".gitignore");
  if (fs.existsSync(gitIgnorePath)) {
    try {
      const lines = fs.readFileSync(gitIgnorePath, "utf8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) patterns.add(trimmed);
      }
    } catch {}
  }

  return patterns;
}

export function isIgnored(targetPath, customRoot = getProjectRoot()) {
  const normalized = targetPath.replace(/\\/g, "/");
  const base = path.basename(targetPath);

  // Always block .env and its variants (.env.local, .env.production, etc.) anywhere in path
  if (base === ".env" || base.startsWith(".env.") || /(^|\/)\.env(\.|$)/i.test(normalized)) {
    return true;
  }

  // Always block internal repository metadata and credentials
  if (/(^|\/)\.git(\/|$)/i.test(normalized)) return true;
  if (/(^|\/)\.codemcp(\/|$)/i.test(normalized)) return true;
  if (/\b(id_rsa|id_ecdsa|id_ed25519|credentials\.enc)\b/i.test(normalized)) return true;

  const rel = path.relative(customRoot, targetPath).replace(/\\/g, "/");
  const segments = rel.split("/").filter(Boolean);

  const patterns = getIgnorePatterns(customRoot);
  for (const pattern of patterns) {
    const cleanPat = pattern.trim().replace(/\/$/, "");
    if (!cleanPat) continue;
    if (base === cleanPat) return true;
    if (segments.includes(cleanPat)) return true;
    if (cleanPat.endsWith("/*") && normalized.includes(cleanPat.slice(0, -2))) return true;
    if (rel === cleanPat || rel.startsWith(cleanPat + "/")) return true;
  }
  return false;
}

export function getAllowedExtensions() {
  return getEnv("ALLOWED_EXTENSIONS", "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function resolveSafe(relativePath, customRoot = getProjectRoot()) {
  if (typeof relativePath !== "string" || relativePath.trim().length === 0) {
    throw new PathGuardError("Path is required", 400);
  }

  const clean = relativePath.trim();

  if (clean.includes("\0")) {
    throw new PathGuardError("Invalid path", 400);
  }

  if (path.isAbsolute(clean) || /^[a-zA-Z]:/.test(clean) || clean.startsWith("\\\\")) {
    throw new PathGuardError("Absolute paths are not allowed", 400);
  }

  const resolved = path.resolve(customRoot, clean);
  const relativeToRoot = path.relative(customRoot, resolved);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new PathGuardError("Path escapes project root", 403);
  }

  return resolved;
}

export function isAllowedFile(filePath) {
  const allowed = getAllowedExtensions();
  if (allowed.length === 0) return true;
  return allowed.includes(path.extname(filePath).toLowerCase());
}

export function assertExistsAndAllowed(absolutePath, customRoot = getProjectRoot()) {
  if (isIgnored(absolutePath, customRoot)) {
    throw new PathGuardError("Access to this file is blocked (ignored or sensitive)", 403);
  }

  if (!fs.existsSync(absolutePath)) {
    throw new PathGuardError("File not found", 404);
  }

  let stat;
  try {
    stat = fs.statSync(absolutePath);
  } catch {
    throw new PathGuardError("Unable to access path", 500);
  }

  if (stat.isFile() && !isAllowedFile(absolutePath)) {
    throw new PathGuardError("File type not permitted", 403);
  }

  return stat;
}

export function toPosix(p) {
  return p.replace(/\\/g, "/");
}

export function walk(dirAbsolute, dirRelative, results, customRoot = getProjectRoot()) {
  const entries = fs.readdirSync(dirAbsolute, { withFileTypes: true });
  for (const entry of entries) {
    if (isIgnored(entry.name, customRoot)) continue;

    const fullPath = path.join(dirAbsolute, entry.name);
    const relPath = path.join(dirRelative, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath, relPath, results, customRoot);
    } else if (entry.isFile() && isAllowedFile(entry.name)) {
      results.push(toPosix(relPath));
    }
  }
}
