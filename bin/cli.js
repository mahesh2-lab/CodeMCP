#!/usr/bin/env node
import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pc from "picocolors";
import { getCustomHelpText } from "../src/utils/help.js";
import {
  startServer,
  app,
  setupShutdownHandlers,
} from "../src/server.js";
import {
  startCommand,
  initProject,
  infoProject,
  approvalCommand,
  registerCredentialsCommands,
  stopCommand,
  logsCommand,
} from "../src/commands/index.js";

setupShutdownHandlers();
export { startServer, app };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");

let pkgVersion = "2.1.2";
try {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"),
  );
  if (pkg.version) pkgVersion = pkg.version;
} catch (err) {
  // Fallback to default version if unreadable
}

const program = new Command();

program
  .name("codemcp")
  .description(
    pc.cyan(
      "Project-scoped MCP server providing context, file access, and execution tools for AI assistants",
    ),
  )
  .version(pkgVersion);

program.helpInformation = () => getCustomHelpText(pkgVersion);

// 1. Start Command (default)
program
  .command("start [path]")
  .description("Start the MCP server for a project (default)")
  .option("-d, --detach", "Run the MCP server in the background (detached mode)")
  .option("-p, --port <number>", "Local port to listen on", "4173")
  .option("--no-tunnel", "Disable automatic ngrok tunnel")
  .option("--no-notify", "Disable OS desktop notifications")
  .option("-y, --yes", "Skip interactive prompts and use detected defaults")
  .option(
    "-a, --approval [mode]",
    "Require confirmation before applying file modifications",
  )
  .option("-c, --confirm", "Alias for -a / --approval")
  .option("--ask", "Alias for -a / --approval")
  .option(
    "--no-approval",
    "Disable confirmation prompts and auto-apply modifications",
  )
  .option("--no-confirm", "Alias for --no-approval")
  .option("--no-update-check", "Skip checking for updated versions on npm")
  .action(async (targetPath, options) => {
    await startCommand(targetPath, options);
  });

// 2. Stop Command
program
  .command("stop [path]")
  .description("Stop a running background CodeMCP server for a project")
  .action((targetPath) => {
    stopCommand(targetPath);
  });

// 3. Logs Command
program
  .command("logs [path]")
  .description("View recent log output from the background CodeMCP server")
  .option("-n, --lines <number>", "Number of log lines to show", "50")
  .action((targetPath, options) => {
    logsCommand(targetPath, options);
  });

// 4. Init Command
program
  .command("init [path]")
  .description("Interactive setup to create codemcp.json in the project folder")
  .option("-y, --yes", "Skip interactive prompts and use detected defaults")
  .option("--no-update-check", "Skip checking for updated versions on npm")
  .action(async (targetPath, options) => {
    try {
      await initProject(targetPath || process.cwd(), options);
    } catch (err) {
      console.error(pc.red(`Initialization failed: ${err.message}`));
      process.exit(1);
    }
  });

// 5. Info Command
program
  .command("info [path]")
  .description("Display project metadata, indexed files, and session/auth information")
  .option("-s, --session", "Display active session, daemon status, and connection credentials")
  .option("-p, --password", "Display the owner authentication password")
  .option("-a, --all", "Display both project metadata and session information")
  .action((targetPath, options) => {
    let effectivePath = targetPath;
    if (targetPath === "session" || targetPath === "auth") {
      options.session = true;
      effectivePath = undefined;
    } else if (targetPath === "password") {
      options.password = true;
      effectivePath = undefined;
    }
    infoProject(effectivePath || process.cwd(), options);
  });

// 6. Approval Command
program
  .command("approval [state]")
  .alias("approve")
  .description(
    "View or toggle approval in codemcp.json (e.g. 'codemcp approval on' or 'codemcp approval off')",
  )
  .action((state) => {
    approvalCommand(state);
  });

// 7. Credentials Commands
registerCredentialsCommands(program);

// Dispatcher logic: fallback to "start" if an option, project path, or no argument is given
const explicitCommands = new Set([
  "start",
  "init",
  "info",
  "stop",
  "logs",
  "credentials",
  "approval",
  "approve",
  "help",
]);
const helpOrVersion = new Set(["--help", "-h", "--version", "-v", "-V", "help"]);
const firstArg = process.argv[2];

if (!firstArg || (!explicitCommands.has(firstArg) && !helpOrVersion.has(firstArg))) {
  process.argv.splice(2, 0, "start");
}

program.parse(process.argv);
