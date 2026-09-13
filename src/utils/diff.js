import pc from "picocolors";

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
    // For very large files, fallback to simple header summary
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

  // Standard dynamic programming LCS
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

  // Backtrack to reconstruct diff operations
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
 * Formats a diff into colorized terminal output with optional line limit.
 *
 * @param {ReturnType<typeof computeLineDiff>} diff
 * @param {object} [options]
 * @param {number} [options.maxLines=25]
 * @param {number} [options.contextRadius=2] - Number of unchanged lines around changes
 * @returns {string}
 */
export function formatDiffPreview(diff, options = {}) {
  const { maxLines = 25, contextRadius = 2 } = options;
  const { lines, additions, deletions } = diff;

  if (lines.length === 0) {
    return pc.dim("  (No changes)");
  }

  // Identify lines that should be visible (changes + surrounding context)
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

  const output = [];
  let shownCount = 0;
  let inSkippedBlock = false;

  for (let idx = 0; idx < lines.length; idx++) {
    if (shownCount >= maxLines) {
      const remaining = lines.length - idx;
      output.push(pc.dim(`  ... [${remaining} more lines hidden] ...`));
      break;
    }

    if (!isInteresting[idx]) {
      if (!inSkippedBlock) {
        output.push(pc.dim("  @@ ... @@"));
        inSkippedBlock = true;
      }
      continue;
    }

    inSkippedBlock = false;
    const item = lines[idx];
    shownCount++;

    if (item.type === "add") {
      const lineNum = String(item.newLine || "").padStart(4, " ");
      output.push(pc.green(`+ ${pc.dim(lineNum)} | ${item.text}`));
    } else if (item.type === "del") {
      const lineNum = String(item.oldLine || "").padStart(4, " ");
      output.push(pc.red(`- ${pc.dim(lineNum)} | ${item.text}`));
    } else {
      const lineNum = String(item.newLine || item.oldLine || "").padStart(4, " ");
      output.push(pc.dim(`  ${lineNum} | ${item.text}`));
    }
  }

  const stats = `${pc.green(`+${additions}`)} ${pc.red(`-${deletions}`)}`;
  return {
    rendered: output.join("\n"),
    stats,
    additions,
    deletions,
  };
}
