import { AsyncLocalStorage } from "node:async_hooks";
import pc from "picocolors";
import { notify } from "./notify.js";

const asyncStorage = new AsyncLocalStorage();
let requestCounter = 0;
let lastRequestId = null;
let currentActiveClient = null;
let lastActiveClient = "Claude-User";

function getTimestamp() {
  const now = new Date();
  return pc.dim(now.toTimeString().split(" ")[0]); // HH:MM:SS
}

export function formatBytes(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatReqId(reqId) {
  if (!reqId) return "        ";
  return pc.dim(reqId.padEnd(8, " "));
}

export const logger = {
  // Request lifecycle
  getRequestCount() {
    return requestCounter;
  },

  generateRequestId() {
    requestCounter++;
    const num = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    const id = `req_${num}`;
    lastRequestId = id;
    return id;
  },

  getCurrentRequestId() {
    const store = asyncStorage.getStore();
    return store?.reqId || lastRequestId || null;
  },

  runWithRequestId(reqId, fn) {
    return asyncStorage.run({ reqId }, fn);
  },

  // Client context
  setActiveClient(name) {
    if (name) lastActiveClient = name;
    currentActiveClient = name || null;
  },

  getActiveClient() {
    return currentActiveClient || lastActiveClient || "Claude-User";
  },

  // Log line prefix: "HH:MM:SS req_XXXX"
  prefix(explicitReqId) {
    const reqId =
      explicitReqId !== undefined ? explicitReqId : this.getCurrentRequestId();
    return `${getTimestamp()} ${formatReqId(reqId)}`;
  },

  // Session lifecycle
  sessionStart(id, client) {
    const clientName = client?.clientName || "AI Assistant";
    const channel = client?.channel || "local network";
    console.log(
      `${getTimestamp()}        ${pc.green("✓ CONNECT")}  ${pc.white(clientName)} ${pc.dim(`(${channel})`)}`,
    );
  },

  sessionEnd(id, client) {
    const clientName = client?.clientName || "AI Assistant";
    console.log(
      `${getTimestamp()}        ${pc.dim("- DISCONN")}  ${pc.dim(`${clientName} closed`)}`,
    );
  },

  // Tool executions
  toolContext(contextFile) {
    console.log(
      `${this.prefix()} ${pc.white("→ CONTEXT")}  ${pc.white(contextFile || "manifest")}`,
    );
  },

  toolList(dir, count) {
    const pathStr = dir === "." ? "." : dir;
    console.log(
      `${this.prefix()} ${pc.cyan("→ LIST")}     ${pc.white(pathStr)} ${pc.dim("·")} ${pc.cyan(`${count} files`)}`,
    );
  },

  toolRead(relPath, byteSize) {
    console.log(
      `${this.prefix()} ${pc.cyan("→ READ")}     ${pc.white(relPath)} ${pc.dim("·")} ${pc.dim(formatBytes(byteSize))}`,
    );
  },

  toolSearch(query, matchCount, fileCount) {
    const matchStr = `${matchCount} ${matchCount === 1 ? "match" : "matches"}`;
    const fileStr = `${fileCount} ${fileCount === 1 ? "file" : "files"}`;
    console.log(
      `${this.prefix()} ${pc.cyan("→ SEARCH")}   "${pc.white(query)}" ${pc.dim("·")} ${pc.green(matchStr)} in ${fileStr}`,
    );
  },

  toolWritePending(relPath) {
    console.log(
      `${this.prefix()} ${pc.yellow("⚠ WRITE")}    ${pc.white(relPath)}`,
    );
  },

  toolWrite(relPath, byteSize) {
    console.log(
      `${this.prefix()} ${pc.green("✓ WRITE")}    ${pc.white(relPath)} ${pc.dim("·")} ${pc.yellow(`${formatBytes(byteSize)} written`)}`,
    );
    notify({
      title: "File Modified",
      message: `${relPath} (${formatBytes(byteSize)}) updated by ${this.getActiveClient()}`,
    });
  },

  toolDeletePending(relPath) {
    console.log(
      `${this.prefix()} ${pc.yellow("⚠ DELETE")}   ${pc.white(relPath)}`,
    );
  },

  toolDelete(relPath) {
    console.log(
      `${this.prefix()} ${pc.red("✓ DELETE")}   ${pc.white(relPath)} ${pc.dim("·")} ${pc.red("deleted")}`,
    );
    notify({
      title: "File Deleted",
      message: `${relPath} was deleted by ${this.getActiveClient()}`,
    });
  },

  toolExec(cmd, exitCode, durationMs) {
    const statusStr =
      exitCode === 0 ? pc.green("exit 0") : pc.red(`exit ${exitCode}`);
    console.log(
      `${this.prefix()} ${pc.green("✓ EXEC")}     ${pc.white(cmd)} ${pc.dim("·")} ${statusStr} ${pc.dim(`(${durationMs}ms)`)}`,
    );
  },

  // Security & User Decisions
  blocked(actionName, target, reason) {
    console.warn(
      `${this.prefix()} ${pc.red("✖ BLOCKED")}  ${pc.white(target)} ${pc.dim("·")} ${pc.yellow(reason)}`,
    );
    notify({
      title: "Security Alert: Action Blocked",
      message: `${actionName.toUpperCase()} on "${target}" blocked: ${reason}`,
    });
  },

  rejected(actionName, target, reason) {
    console.warn(
      `${this.prefix()} ${pc.red("✖ REJECT")}   ${pc.white(target)} ${pc.dim("·")} ${pc.yellow(reason)}`,
    );
  },

  warn(actionName, target, message) {
    console.warn(
      `${this.prefix()} ${pc.yellow("⚠ WARN")}     ${pc.white(target)} ${pc.dim("·")} ${message}`,
    );
  },

  error(msg, err) {
    console.error(
      `${this.prefix()} ${pc.red("✖ ERROR")}    ${pc.red(msg)}`,
      err ? pc.dim(err.message || err) : "",
    );
  },

  // Tunnel events
  tunnelInfo(msg) {
    console.log(`${getTimestamp()}        ${pc.magenta("→ TUNNEL")}   ${msg}`);
  },

  tunnelWarn(msg) {
    console.warn(
      `${getTimestamp()}        ${pc.yellow("⚠ TUNNEL")}   ${pc.yellow(msg)}`,
    );
  },

  tunnelError(msg, err) {
    console.error(
      `${getTimestamp()}        ${pc.red("✖ TUNNEL")}   ${pc.red(msg)}`,
      err ? pc.dim(err.message || err) : "",
    );
  },

  // Server events
  serverInfo(msg) {
    console.log(`${getTimestamp()}        ${pc.dim("→ SERVER")}   ${msg}`);
  },

  serverWarn(msg) {
    console.warn(
      `${getTimestamp()}        ${pc.yellow("⚠ SERVER")}   ${pc.yellow(msg)}`,
    );
  },

  serverError(msg, err) {
    console.error(
      `${getTimestamp()}        ${pc.red("✖ SERVER")}   ${pc.red(msg)}`,
      err ? pc.dim(err.message || err) : "",
    );
  },
};

export default logger;
