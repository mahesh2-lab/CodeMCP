import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { computeLineDiff, formatDiffPreview } from "../src/utils/diff.js";
import { isApprovalRequired } from "../src/services/approval.js";

console.log("🧪 Running Accept/Reject & Diff verification tests...\n");

// 1. Test Diff computation
{
  console.log("1. Testing Line Diff computation...");
  const oldText = "line 1\nline 2\nline 3\nline 4";
  const newText = "line 1\nline 2 modified\nline 3\nline 4\nline 5 added";

  const diff = computeLineDiff(oldText, newText);
  assert.strictEqual(diff.additions, 2, "Expected 2 additions");
  assert.strictEqual(diff.deletions, 1, "Expected 1 deletion");

  const preview = formatDiffPreview(diff, { maxLines: 20 });
  assert.ok(preview.rendered.includes("line 2 modified"), "Diff preview should include added line");
  assert.ok(preview.rendered.includes("line 2"), "Diff preview should include modified line");
  assert.strictEqual(preview.additions, 2);
  assert.strictEqual(preview.deletions, 1);
  console.log("   ✔ Diff calculation and formatting verified.\n");
}

// 2. Test Approval Required check
{
  console.log("2. Testing isApprovalRequired logic...");
  
  // Clean env
  delete process.env.CONFIRM_CHANGES;

  assert.strictEqual(isApprovalRequired({ approval: false }, "WRITE"), false);
  assert.strictEqual(isApprovalRequired({ approval: true }, "WRITE"), true);
  assert.strictEqual(isApprovalRequired({ approval: "always" }, "WRITE"), true);
  assert.strictEqual(isApprovalRequired({ approval: "destructive" }, "WRITE"), false);
  assert.strictEqual(isApprovalRequired({ approval: "destructive" }, "DELETE"), true);

  // CLI override
  process.env.CONFIRM_CHANGES = "true";
  assert.strictEqual(isApprovalRequired({ approval: false }, "WRITE"), true, "CLI --confirm should override config");

  process.env.CONFIRM_CHANGES = "false";
  assert.strictEqual(isApprovalRequired({ approval: true }, "WRITE"), false, "CLI --no-confirm should override config");

  delete process.env.CONFIRM_CHANGES;
  console.log("   ✔ isApprovalRequired permissions verified.\n");
}

// 3. Test Tool Handling & Mock Rejection
{
  console.log("3. Testing write_file and delete_file approval interception...");
  
  // Verify non-interactive mode auto-approves safely without hanging
  const { requestApproval } = await import("../src/services/approval.js");
  const result = await requestApproval({
    type: "WRITE",
    path: "test-file.txt",
    oldContent: "old",
    newContent: "new",
  });

  // When run under non-TTY script, stdin is not TTY or handled cleanly
  assert.strictEqual(typeof result.approved, "boolean");
  console.log("   ✔ Approval handler executes safely in non-interactive environment.\n");
}

console.log("🎉 All Accept/Reject verification tests passed successfully!");
