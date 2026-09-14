#!/usr/bin/env node
import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pc from "picocolors";
import { initProject } from "../src/commands/init.js";
import { infoProject } from "../src/commands/info.js";
import {
  getAllCredentials,
  setCredential,
  deleteCredential,
  clearAllCredentials,
  VAULT_FILE,
} from "../src/utils/credentials.js";
import { getCustomHelpText } from "../src/utils/help.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");

let pkgVersion = "1.1.2";
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  if (pkg.version) pkgVersion = pkg.version;
} catch {}

const program = new Command();

program
  .name("codemcp")
  .description(pc.cyan("Project-scoped MCP server providing context, file access, and execution tools for AI assistants"))
  .version(pkgVersion);

program.helpInformation = () => getCustomHelpText(pkgVersion);

async function launchServer(targetPath, options = {}) {
  if (options.tunnel === false) {
    process.env.NGROK_ENABLED = "false";
  }
  if (options.notify === false) {
    process.env.NOTIFY = "false";
  }
  if (options.port) {
    process.env.PORT = String(options.port);
  }

  const approvalFlag = options.approval !== undefined 
    ? options.approval 
    : (options.ask !== undefined ? options.ask : options.confirm);

  if (approvalFlag !== undefined) {
    if (typeof approvalFlag === "string") {
      process.env.APPROVAL_MODE = approvalFlag.toLowerCase();
    } else if (approvalFlag === true) {
      process.env.APPROVAL_MODE = "true";
    } else if (approvalFlag === false) {
      process.env.APPROVAL_MODE = "false";
    }
  }

  let targetDir;
  if (targetPath) {
    targetDir = path.resolve(process.cwd(), targetPath);
    if (!fs.existsSync(targetDir)) {
      console.error(pc.red(`Error: Directory not found: ${targetDir}`));
      process.exit(1);
    }
  } else {
    targetDir = path.resolve(process.cwd(), process.env.PROJECT_ROOT || ".");
  }

  process.env.PROJECT_ROOT = targetDir;

  const configPath = path.join(targetDir, "codemcp.json");
  if (!fs.existsSync(configPath)) {
    console.log(pc.yellow(`No codemcp.json found in ${targetDir}. Initializing project...\n`));
    await initProject(targetDir, options);
    if (!fs.existsSync(configPath)) {
      process.exit(0);
    }
    console.log();
  }


  await import("../src/server.js");
}

program
  .command("start [path]")
  .description("Start the MCP server for a project (default)")
  .option("-p, --port <number>", "Local port to listen on", "4173")
  .option("--no-tunnel", "Disable automatic ngrok tunnel")
  .option("--no-notify", "Disable OS desktop notifications")
  .option("-y, --yes", "Skip interactive prompts and use detected defaults")
  .option("-a, --approval [mode]", "Require confirmation before applying file modifications")
  .option("-c, --confirm", "Alias for -a / --approval")
  .option("--ask", "Alias for -a / --approval")
  .option("--no-approval", "Disable confirmation prompts and auto-apply modifications")
  .option("--no-confirm", "Alias for --no-approval")
  .action(async (targetPath, options) => {
    await launchServer(targetPath, options);
  });


program
  .command("init [path]")
  .description("Interactive setup to create codemcp.json in the project folder")

  .option("-y, --yes", "Skip interactive prompts and use detected defaults")
  .action(async (targetPath, options) => {
    try {
      await initProject(targetPath || process.cwd(), options);
    } catch (err) {
      console.error(pc.red(`Initialization failed: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command("info [path]")
  .description("Display project metadata and source file count")
  .action((targetPath) => {
    infoProject(targetPath || process.cwd());
  });

program
  .command("approval [state]")
  .alias("approve")
  .description("View or toggle approval in codemcp.json (e.g. 'codemcp approval on' or 'codemcp approval off')")
  .action((state) => {
    const configPath = path.join(process.cwd(), "codemcp.json");
    if (!fs.existsSync(configPath)) {
      console.log(pc.yellow(`No codemcp.json found in ${process.cwd()}.`));
      return;
    }
    try {
      const manifest = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (!state) {
        const current = manifest.approval ? pc.green("ON (Ask before changes)") : pc.dim("OFF (Auto-apply)");
        console.log(`\n  Approval is currently: ${current}`);
        console.log(`  To change: ${pc.cyan("codemcp approval on")} or ${pc.cyan("codemcp approval off")}\n`);
        return;
      }
      const normalized = state.toLowerCase();
      const enable = normalized === "on" || normalized === "true" || normalized === "yes" || normalized === "1";
      manifest.approval = enable;
      fs.writeFileSync(configPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
      console.log(pc.green(`✔ Approval set to ${enable ? pc.bold("ON (Ask before changes)") : pc.dim("OFF (Auto-apply)")} in codemcp.json\n`));
    } catch (err) {
      console.error(pc.red(`Failed to update codemcp.json: ${err.message}`));
    }
  });

const credCmd = program
  .command("credentials")
  .description("Manage encrypted credentials stored in ~/.codemcp/credentials.enc")
  .action(() => {
    printCredentialsStatus();
  });

function printCredentialsStatus() {
  const creds = getAllCredentials();
  const keys = Object.keys(creds);
  console.log(pc.bold("\n CodeMCP - Secure Credential Vault"));
  console.log(pc.dim(` Location: ${VAULT_FILE}\n`));
  if (keys.length === 0) {
    console.log(pc.yellow("  No credentials currently stored.\n"));
    return;
  }
  for (const key of keys) {
    const val = creds[key];
    const masked = val.length > 8 ? `${val.slice(0, 4)}...${val.slice(-4)}` : "********";
    console.log(`  ${pc.cyan(key.padEnd(20))} : ${pc.green(masked)}`);
  }
  console.log();
}

credCmd
  .command("status")
  .description("List all securely stored credential keys (values masked)")
  .action(() => {
    printCredentialsStatus();
  });

credCmd
  .command("set <key> <value>")
  .description("Set or update a credential in the secure vault")
  .action((key, value) => {
    setCredential(key, value);
    console.log(pc.green(`[OK] Saved ${pc.bold(key)} to secure vault.`));
  });

credCmd
  .command("delete <key>")
  .description("Delete a credential from the secure vault")
  .action((key) => {
    const ok = deleteCredential(key);
    if (ok) {
      console.log(pc.green(`[OK] Deleted ${pc.bold(key)} from secure vault.`));
    } else {
      console.log(pc.yellow(`Key ${pc.bold(key)} not found in vault.`));
    }
  });

credCmd
  .command("clear")
  .description("Clear all credentials in the secure vault")
  .action(() => {
    clearAllCredentials();
    console.log(pc.green("[OK] Cleared all credentials from secure vault."));
  });


const explicitCommands = new Set(["start", "init", "info", "credentials", "approval", "approve", "help"]);
const helpOrVersion = new Set(["--help", "-h", "--version", "-v", "help"]);
const firstArg = process.argv[2];

const isOption = Boolean(firstArg && firstArg.startsWith("-"));
const isExistingPath = Boolean(firstArg && fs.existsSync(path.resolve(process.cwd(), firstArg)));

if (!firstArg || isOption || isExistingPath) {
  if (!firstArg || (!explicitCommands.has(firstArg) && !helpOrVersion.has(firstArg))) {
    process.argv.splice(2, 0, "start");
  }
}

program.parse(process.argv);
