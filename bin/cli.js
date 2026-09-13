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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");

let pkgVersion = "1.0.2";
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  if (pkg.version) pkgVersion = pkg.version;
} catch {}

const program = new Command();

program
  .name("codemcp")
  .description(pc.cyan("Project-scoped MCP server providing context, file access, and execution tools for AI assistants"))
  .version(pkgVersion);

async function launchServer(targetPath, options = {}) {
  if (options.tunnel === false) {
    process.env.NGROK_ENABLED = "false";
  }
  if (options.port) {
    process.env.PORT = String(options.port);
  }

  let targetDir;
  if (targetPath) {
    targetDir = path.resolve(process.cwd(), targetPath);
  } else if (process.cwd() !== packageRoot) {
    targetDir = process.cwd();
  } else {
    targetDir = path.resolve(packageRoot, process.env.PROJECT_ROOT || "./test-project");
  }

  process.env.PROJECT_ROOT = targetDir;

  await import("../src/server.js");
}

program
  .command("start [path]")
  .description("Start the MCP server for a project (default)")
  .option("-p, --port <number>", "Local port to listen on", "4173")
  .option("--no-tunnel", "Disable automatic ngrok tunnel")
  .action(async (targetPath, options) => {
    await launchServer(targetPath, options);
  });

program
  .command("init [path]")
  .description("Interactive setup to create project.json in the project folder")
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


const explicitCommands = new Set(["start", "init", "info", "credentials", "help"]);
const helpOrVersion = new Set(["--help", "-h", "--version", "-v", "help"]);
const firstArg = process.argv[2];

if (!firstArg || (!explicitCommands.has(firstArg) && !helpOrVersion.has(firstArg))) {
  process.argv.splice(2, 0, "start");
}

program.parse(process.argv);
