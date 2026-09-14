import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pc from "picocolors";
import { stripAnsi } from "./box.js";

let defaultPkgVersion = "1.1.2";
try {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const pkgPath = path.resolve(currentDir, "../../package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    if (pkg.version) defaultPkgVersion = pkg.version;
  }
} catch {}

/**
 * Returns the fully styled, comprehensive CodeMCP help screen.
 *
 * @param {string} pkgVersion
 * @returns {string}
 */
export function getCustomHelpText(pkgVersion = defaultPkgVersion) {
  const title = pc.bold(pc.bgCyan(pc.black(` CodeMCP v${pkgVersion} `)));

  // Section Header Helper
  const section = (name) => pc.bold(pc.cyan(`\n  ${name.toUpperCase()}\n`));
  const cmd = (name, desc, alias = "") => {
    const aliasStr = alias ? pc.dim(` (${alias})`) : "";
    return `    ${pc.green(name.padEnd(26))}${pc.white(desc)}${aliasStr}`;
  };
  const opt = (flags, desc) => {
    return `    ${pc.yellow(flags.padEnd(26))}${pc.white(desc)}`;
  };
  const example = (cmdStr, comment) => {
    return `    ${pc.cyan("$ " + cmdStr.padEnd(28))} ${pc.dim("# " + comment)}`;
  };

  const width = 68;
  const renderBoxRow = (text) => {
    const visLen = stripAnsi(text).length;
    const pad = Math.max(width - visLen - 2, 0);
    return pc.cyan("│") + "  " + text + " ".repeat(pad) + pc.cyan("│");
  };

  const titleVisibleLen = stripAnsi(title).length;
  const topDashes = Math.max(width - titleVisibleLen - 3, 2);

  const output = [];

  // 1. Box Header
  output.push("");
  output.push(pc.cyan("┌─ ") + title + pc.cyan(" " + "─".repeat(topDashes) + "┐"));
  output.push(pc.cyan("│") + " ".repeat(width) + pc.cyan("│"));
  output.push(renderBoxRow(pc.bold("Model Context Protocol (MCP) Server for Local Projects")));
  output.push(renderBoxRow(pc.dim("Connect local code to AI assistants with zero configuration.")));
  output.push(pc.cyan("│") + " ".repeat(width) + pc.cyan("│"));
  output.push(pc.cyan("└" + "─".repeat(width) + "┘"));

  // 2. Usage
  output.push(section("Usage"));
  output.push(`    ${pc.bold("codemcp")} ${pc.dim("[options] [path]")}`);
  output.push(`    ${pc.bold("codemcp")} ${pc.cyan("<command>")} ${pc.dim("[options]")}`);

  // 3. Commands
  output.push(section("Commands"));
  output.push(cmd("start [path]", "Start the MCP server for a project", "default"));
  output.push(cmd("init [path]", "Interactive setup to create codemcp.json & CONTEXT.md"));
  output.push(cmd("info [path]", "Display project metadata, permissions, and indexed files"));
  output.push(cmd("approval [on|off]", "View or toggle change approval in codemcp.json", "approve"));
  output.push(cmd("credentials <action>", "Manage encrypted machine-vault tokens", "status/set/del"));

  // 4. Options & Flags
  output.push(section("Options & Flags"));
  output.push(opt("-a, --approval [mode]", "Require confirmation before applying file edits"));
  output.push(opt("-c, --confirm", "Short alias for -a / --approval"));
  output.push(opt("--ask", "Intuitive alias for -a / --approval"));
  output.push(opt("--no-approval", "Disable confirmation prompts and auto-apply edits"));
  output.push(opt("-p, --port <number>", "Local port to listen on (default: 4173)"));
  output.push(opt("--no-tunnel", "Disable public ngrok tunnel (localhost only)"));
  output.push(opt("-y, --yes", "Skip interactive prompts during init"));
  output.push(opt("-V, --version", "Output the version number"));
  output.push(opt("-h, --help", "Display this help message"));

  // 5. Examples
  output.push(section("Quick Examples"));
  output.push(example("codemcp", "Serve current folder with public HTTPS tunnel"));
  output.push(example("codemcp -a", "Ask for confirmation before AI modifies files"));
  output.push(example("codemcp --no-tunnel", "Run locally on http://localhost:4173/mcp"));
  output.push(example("codemcp ./my-project", "Serve a specific project directory"));
  output.push(example("codemcp approval on", "Permanently turn on change approval"));
  output.push(example("codemcp info", "View project info and indexed file count"));
  output.push(example("codemcp credentials status", "Check stored encrypted credentials"));

  // 6. Footer
  output.push(section("Help & Documentation"));
  output.push(`    ${pc.dim("GitHub  :")} ${pc.cyan("https://github.com/mahesh2-lab/CodeMCP")}`);
  output.push(`    ${pc.dim("Protocol:")} ${pc.cyan("https://modelcontextprotocol.io")}\n`);

  return output.join("\n");
}
