import pc from "picocolors";

function getTimestamp() {
  const now = new Date();
  return pc.dim(
    now.toTimeString().split(" ")[0] // HH:MM:SS
  );
}

function formatBytes(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

let currentActiveClient = null;

export const logger = {
  // Client context
  setActiveClient(name) {
    currentActiveClient = name || null;
  },

  clientTag() {
    if (!currentActiveClient) return "";
    const shortName = currentActiveClient.split(" ")[0];
    return `${pc.dim("[")}${pc.cyan(shortName)}${pc.dim("]")} `;
  },

  // Prefix helpers
  mcpPrefix() {
    return `${getTimestamp()} ${pc.cyan("[mcp]")} ${this.clientTag()}`.trimEnd();
  },
  tunnelPrefix: () => `${getTimestamp()} ${pc.magenta("[tunnel]")}`,
  serverPrefix: () => `${getTimestamp()} ${pc.dim("[server]")}`,

  // Session lifecycle
  sessionStart(id, client) {
    const badge = pc.bold(pc.green("CONNECT"));
    const clientName = client?.clientName ? pc.green(client.clientName) : pc.green("AI session");
    const locationStr = client?.location ? pc.dim(`(${client.location})`) : "";
    const channelStr = client?.channel ? pc.dim(`via ${client.channel}`) : "";
    console.log(
      `${getTimestamp()} ${pc.cyan("[mcp]")} ${badge} ${clientName} ${locationStr} ${channelStr} ${pc.dim(`[${id.slice(0, 8)}]`)}`
    );
  },

  sessionEnd(id, client) {
    const badge = pc.bold(pc.dim("DISCONN"));
    const clientName = client?.clientName ? pc.dim(client.clientName) : pc.dim("Session");
    console.log(
      `${getTimestamp()} ${pc.cyan("[mcp]")} ${badge} ${clientName} closed ${pc.dim(`[${id.slice(0, 8)}]`)}`
    );
  },

  // Tool executions (Clean, aligned columns)
  toolContext(contextFile) {
    const action = pc.bold(pc.white("CONTEXT"));
    console.log(`${this.mcpPrefix()} ${action} ${pc.dim("Guidelines loaded from")} ${pc.white(contextFile || "manifest")}`);
  },

  toolList(dir, count) {
    const action = pc.bold(pc.blue("LIST   "));
    const pathStr = dir === "." ? "." : dir;
    console.log(`${this.mcpPrefix()} ${action} ${pc.white(pathStr)} ${pc.dim("·")} ${pc.cyan(`${count} files`)}`);
  },

  toolRead(relPath, byteSize) {
    const action = pc.bold(pc.green("READ   "));
    console.log(
      `${this.mcpPrefix()} ${action} ${pc.white(relPath)} ${pc.dim("·")} ${pc.dim(formatBytes(byteSize))}`
    );
  },

  toolSearch(query, matchCount, fileCount) {
    const action = pc.bold(pc.cyan("SEARCH "));
    const matchStr = `${matchCount} ${matchCount === 1 ? "match" : "matches"}`;
    const fileStr = `${fileCount} ${fileCount === 1 ? "file" : "files"}`;
    console.log(
      `${this.mcpPrefix()} ${action} "${pc.white(query)}" ${pc.dim("·")} ${pc.green(matchStr)} in ${fileStr}`
    );
  },

  toolWrite(relPath, byteSize) {
    const action = pc.bold(pc.yellow("WRITE  "));
    console.log(
      `${this.mcpPrefix()} ${action} ${pc.white(relPath)} ${pc.dim("·")} ${pc.yellow(`${formatBytes(byteSize)} written`)}`
    );
  },

  toolDelete(relPath) {
    const action = pc.bold(pc.red("DELETE "));
    console.log(`${this.mcpPrefix()} ${action} ${pc.white(relPath)} ${pc.dim("·")} ${pc.red("deleted")}`);
  },

  toolExec(cmd, exitCode, durationMs) {
    const action = pc.bold(pc.magenta("EXEC   "));
    const statusStr =
      exitCode === 0
        ? pc.green(`exit 0`)
        : pc.red(`exit ${exitCode}`);
    console.log(
      `${this.mcpPrefix()} ${action} ${pc.white(cmd)} ${pc.dim("·")} ${statusStr} ${pc.dim(`(${durationMs}ms)`)}`
    );
  },

  // Blocked / Security Warnings
  blocked(actionName, target, reason) {
    const badge = pc.bold(pc.red("BLOCKED"));
    const action = pc.bold(actionName.toUpperCase().padEnd(6));
    console.warn(
      `${this.mcpPrefix()} ${badge} ${action} ${pc.white(target)} ${pc.dim("·")} ${pc.yellow(reason)}`
    );
  },

  // Tool Warnings / Errors
  warn(actionName, target, message) {
    const badge = pc.bold(pc.yellow("WARN   "));
    const action = pc.bold(actionName.toUpperCase().padEnd(6));
    console.warn(
      `${this.mcpPrefix()} ${badge} ${action} ${pc.white(target)} ${pc.dim("·")} ${message}`
    );
  },

  error(msg, err) {
    console.error(`${this.mcpPrefix()} ${pc.red(msg)}`, err ? pc.dim(err.message || err) : "");
  },

  // Tunnel events
  tunnelInfo(msg) {
    console.log(`${this.tunnelPrefix()} ${msg}`);
  },

  tunnelWarn(msg) {
    console.warn(`${this.tunnelPrefix()} ${pc.yellow(msg)}`);
  },

  tunnelError(msg, err) {
    console.error(`${this.tunnelPrefix()} ${pc.red(msg)}`, err ? pc.dim(err.message || err) : "");
  },

  // Server events
  serverInfo(msg) {
    console.log(`${this.serverPrefix()} ${msg}`);
  },
};
