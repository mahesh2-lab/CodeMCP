import pc from "picocolors";
import {
  getAllCredentials,
  setCredential,
  deleteCredential,
  clearAllCredentials,
  VAULT_FILE,
} from "../utils/credentials.js";

/**
 * Prints the status of all securely stored credential keys with masked values.
 */
export function printCredentialsStatus() {
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
    const masked =
      val.length > 8 ? `${val.slice(0, 4)}...${val.slice(-4)}` : "********";
    console.log(`  ${pc.cyan(key.padEnd(20))} : ${pc.green(masked)}`);
  }
  console.log();
}

/**
 * Registers all credentials subcommands onto the Commander instance.
 *
 * @param {import("commander").Command} program
 */
export function registerCredentialsCommands(program) {
  const credCmd = program
    .command("credentials")
    .description(
      "Manage encrypted credentials stored in ~/.codemcp/credentials.enc",
    )
    .action(() => {
      printCredentialsStatus();
    });

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
    .alias("del")
    .alias("rm")
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

  return credCmd;
}
