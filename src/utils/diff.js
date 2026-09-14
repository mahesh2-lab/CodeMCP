import pc from "picocolors";

const ANSI_REGEX = /[\u001b\x1b]\[[0-9;]*[a-zA-Z]/g;
export function stripAnsi(str) {
  return String(str || "").replace(ANSI_REGEX, "");
}

/**
 * Computes line-by-line diff between two text strings using Longest Common Subsequence (LCS).
 *
 * @param {string} oldStr - Original text content
 * @param {string} newStr - Proposed text content
 * @returns {{ lines: Array<{ type: 'add'|'del'|'same', text: string, oldLine?: number, newLine?: number }>, additions: number, deletions: number }}
 */
export function computeLineDiff(oldStr = "", newStr = "") {
  const oldLines = oldStr === "" ? [] : oldStr.split(/\r?\n/);
  const newLines = newStr === "" ? [] : newStr.split(/\r?\n/);

  const n = oldLines.length;
  const m = newLines.length;

  // Build LCS matrix for modest file sizes
  // Cap at 2000 lines to avoid high memory/cpu overhead
  if (n * m > 4_000_000) {
    return {
      lines: [
        ...oldLines.slice(0, 10).map((l, i) => ({ type: "del", text: l, oldLine: i + 1 })),
        { type: "same", text: `... (${n} lines removed, ${m} lines added) ...` },
        ...newLines.slice(0, 10).map((l, i) => ({ type: "add", text: l, newLine: i + 1 })),
      ],
      additions: m,
      deletions: n,
    };
  }

  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (oldLines[i] === newLines[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const result = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: "same", text: oldLines[i - 1], oldLine: i, newLine: j });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "add", text: newLines[j - 1], newLine: j });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      result.unshift({ type: "del", text: oldLines[i - 1], oldLine: i });
      i--;
    }
  }

  let additions = 0;
  let deletions = 0;
  for (const item of result) {
    if (item.type === "add") additions++;
    else if (item.type === "del") deletions++;
  }

  return { lines: result, additions, deletions };
}

/**
 * Truncates text to max length with '...'
 *
 * @param {string} text
 * @param {number} maxLen
 * @returns {string}
 */
function truncateLine(text, maxLen) {
  if (!text || text.length <= maxLen) return text;
  return text.slice(0, Math.max(0, maxLen - 3)) + "...";
}

/**
 * Formats diff lines specifically for rendering inside the approval box.
 *
 * @param {ReturnType<typeof computeLineDiff>} diff
 * @param {object} [options]
 * @param {number} [options.maxLines=14]
 * @param {number} [options.maxLineWidth=64]
 * @param {number} [options.contextRadius=2]
 * @returns {{ rows: string[], stats: string, additions: number, deletions: number }}
 */
export function formatDiffBoxLines(diff, options = {}) {
  const { maxLines = 14, maxLineWidth = 64, contextRadius = 2 } = options;
  const { lines, additions, deletions } = diff;

  if (lines.length === 0) {
    return {
      rows: [pc.dim("  (No changes)")],
      stats: `${pc.green("+0")} ${pc.red("-0")}`,
      additions: 0,
      deletions: 0,
    };
  }

  // Identify lines to display (changes + context)
  const isInteresting = new Array(lines.length).fill(false);
  for (let idx = 0; idx < lines.length; idx++) {
    if (lines[idx].type !== "same") {
      const start = Math.max(0, idx - contextRadius);
      const end = Math.min(lines.length - 1, idx + contextRadius);
      for (let k = start; k <= end; k++) {
        isInteresting[k] = true;
      }
    }
  }

  const rows = [];
  let shownCount = 0;
  let inSkippedBlock = false;
  const firstInteresting = isInteresting.indexOf(true);

  if (firstInteresting > 0) {
    rows.push(pc.dim(" ..."));
  }

  for (let idx = Math.max(0, firstInteresting); idx < lines.length; idx++) {
    if (shownCount >= maxLines) {
      const remaining = lines.length - idx;
      rows.push(pc.dim(` ... ${remaining} more lines`));
      break;
    }

    if (!isInteresting[idx]) {
      if (!inSkippedBlock) {
        rows.push(pc.dim(" ..."));
        inSkippedBlock = true;
      }
      continue;
    }

    inSkippedBlock = false;
    const item = lines[idx];
    shownCount++;

    const maxTextLen = Math.max(10, maxLineWidth - 4);
    const text = truncateLine(item.text, maxTextLen);

    if (item.type === "add") {
      rows.push(pc.green(` + ${text}`));
    } else if (item.type === "del") {
      rows.push(pc.red(` - ${text}`));
    } else {
      rows.push(pc.dim(`   ${text}`));
    }
  }

  const stats = `${pc.green(`+${additions}`)} ${pc.red(`-${deletions}`)}`;
  return {
    rows,
    stats,
    additions,
    deletions,
  };
}

/**
 * Formats a full diff without line limits for user inspection.
 *
 * @param {ReturnType<typeof computeLineDiff>} diff
 * @returns {string}
 */
export function formatFullDiff(diff) {
  const { lines, additions, deletions } = diff;
  const output = [];

  for (const item of lines) {
    if (item.type === "add") {
      output.push(pc.green(`+ ${item.text}`));
    } else if (item.type === "del") {
      output.push(pc.red(`- ${item.text}`));
    } else {
      output.push(pc.dim(`  ${item.text}`));
    }
  }

  const summary = `${pc.green(`+${additions}`)} ${pc.red(`-${deletions}`)}`;
  return output.join("\n") + `\n\nTotal: ${summary}`;
}

export function formatDiffPreview(diff, options = {}) {
  const res = formatDiffBoxLines(diff, options);
  return {
    rendered: res.rows.join("\n"),
    stats: res.stats,
    additions: res.additions,
    deletions: res.deletions,
  };
}
