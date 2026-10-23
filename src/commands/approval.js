import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";

/**
 * Handles the 'codemcp approval [state]' CLI command.
 *
 * @param {string} [state] - "on", "off", "true", "false", or undefined to query
 */
export function approvalCommand(state) {
  const configPath = path.join(process.cwd(), "codemcp.json");
  if (!fs.existsSync(configPath)) {
    console.log(pc.yellow(`No codemcp.json found in ${process.cwd()}.`));
    return;
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (!state) {
      const current = manifest.approval
        ? pc.green("ON (Ask before changes)")
        : pc.dim("OFF (Auto-apply)");
      console.log(`\n  Approval is currently: ${current}`);
      console.log(
        `  To change: ${pc.cyan("codemcp approval on")} or ${pc.cyan("codemcp approval off")}\n`,
      );
      return;
    }
    const normalized = state.toLowerCase();
    const enable = ["on", "true", "yes", "1"].includes(normalized);
    manifest.approval = enable;
    fs.writeFileSync(
      configPath,
      JSON.stringify(manifest, null, 2) + "\n",
      "utf8",
    );
    console.log(
      pc.green(
        `✔ Approval set to ${enable ? pc.bold("ON (Ask before changes)") : pc.dim("OFF (Auto-apply)")} in codemcp.json\n`,
      ),
    );
  } catch (err) {
    console.error(pc.red(`Failed to update codemcp.json: ${err.message}`));
  }
}
