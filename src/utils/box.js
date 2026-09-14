import pc from "picocolors";

const ANSI_REGEX = /[\u001b\x1b]\[[0-9;]*[a-zA-Z]/g;

export function stripAnsi(str) {
  return str.replace(ANSI_REGEX, "");
}

/**
 * Prints an enclosed, perfectly-aligned full box in the terminal.
 *
 * @param {string} title - Styled or plain title (e.g. pc.bold(pc.bgCyan(pc.black(" Title "))))
 * @param {string[]} rows - Array of styled row strings
 * @param {object} [options]
 * @param {function} [options.color] - Border color function from picocolors (default: pc.cyan)
 * @param {number} [options.minWidth] - Minimum inner width (default: 64)
 */
export function printBox(title, rows, options = {}) {
  const color = options.color || pc.cyan;
  const rawRows = rows.map((r) => "  " + r);
  const visibleLengths = rawRows.map((r) => stripAnsi(r).length);
  const titleVisibleLen = stripAnsi(title).length;
  const contentMax = Math.max(...visibleLengths, titleVisibleLen + 4);
  const innerWidth = Math.max(contentMax + 2, options.minWidth || 64);
  const dashes = Math.max(innerWidth - titleVisibleLen - 3, 2);

  console.log(
    "\n" + color("┌─ ") + title + " " + color("─".repeat(dashes) + "┐"),
  );
  console.log(color("│") + " ".repeat(innerWidth) + color("│"));

  for (const row of rawRows) {
    const visLen = stripAnsi(row).length;
    const pad = Math.max(innerWidth - visLen, 0);
    console.log(color("│") + row + " ".repeat(pad) + color("│"));
  }

  console.log(color("│") + " ".repeat(innerWidth) + color("│"));
  console.log(color("└" + "─".repeat(innerWidth) + "┘"));
}

/**
 * Prints the change approval box styled exactly like the CodeMCP review box.
 *
 * @param {string} title - The title inside top border, e.g. pc.yellow("⚠") + " " + pc.bold(pc.white("AI CHANGE APPROVAL REQUIRED"))
 * @param {string[]} rows - The lines of text/diff to render inside the box
 * @param {number} [width=69] - The total inner dash width
 */
export function printApprovalBox(title, rows, width = 69) {
  const color = pc.cyan;
  const titleLen = stripAnsi(title).length;
  const dashes = Math.max(width - titleLen - 4, 2);

  console.log("\n " + color("┌─ ") + title + " " + color("─".repeat(dashes) + "┐"));

  for (const row of rows) {
    const visLen = stripAnsi(row).length;
    const pad = Math.max(width - visLen - 1, 0);
    console.log(" " + color("│") + " " + row + " ".repeat(pad) + color("│"));
  }

  console.log(" " + color("└" + "─".repeat(width) + "┘"));
}
