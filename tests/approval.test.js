import test from "node:test";
import assert from "node:assert/strict";
import {
  isApprovalRequired,
  requestApproval,
  allowSessionApproval,
  isSessionApprovalAllowed,
  clearSessionApprovals,
} from "../src/services/approval.js";

test("Approval - project level approval configuration", () => {
  assert.equal(isApprovalRequired({}, "WRITE"), true);
  assert.equal(isApprovalRequired({}, "DELETE"), true);
  assert.equal(isApprovalRequired({}, "EXEC"), true);

  const projAlways = { approval: true };
  assert.equal(isApprovalRequired(projAlways, "WRITE"), true);
  assert.equal(isApprovalRequired(projAlways, "DELETE"), true);
  assert.equal(isApprovalRequired(projAlways, "EXEC"), true);

  const projDestructive = { approval: "destructive" };
  assert.equal(isApprovalRequired(projDestructive, "WRITE"), false);
  assert.equal(isApprovalRequired(projDestructive, "DELETE"), true);
  assert.equal(isApprovalRequired(projDestructive, "EXEC"), true);

  const projNone = { approval: false };
  assert.equal(isApprovalRequired(projNone, "WRITE"), false);
  assert.equal(isApprovalRequired(projNone, "DELETE"), false);
  assert.equal(isApprovalRequired(projNone, "EXEC"), false);
});

test("Approval - environment variable overrides", () => {
  const orig = process.env.APPROVAL_MODE;
  try {
    process.env.APPROVAL_MODE = "always";
    assert.equal(isApprovalRequired({ approval: false }, "WRITE"), true);

    process.env.APPROVAL_MODE = "never";
    assert.equal(isApprovalRequired({ approval: true }, "WRITE"), false);
  } finally {
    if (orig !== undefined) {
      process.env.APPROVAL_MODE = orig;
    } else {
      delete process.env.APPROVAL_MODE;
    }
  }
});

test("Approval - non-interactive environment policy enforcement", async () => {
  const origPolicy = process.env.APPROVAL_NON_INTERACTIVE;
  try {
    process.env.APPROVAL_NON_INTERACTIVE = "reject";
    const resReject = await requestApproval({
      type: "WRITE",
      path: "test.txt",
    });
    assert.equal(resReject.approved, false);
    assert.match(resReject.reason, /non-interactive environment/);

    process.env.APPROVAL_NON_INTERACTIVE = "auto";
    const resAuto = await requestApproval({ type: "WRITE", path: "test.txt" });
    assert.equal(resAuto.approved, true);
  } finally {
    if (origPolicy !== undefined) {
      process.env.APPROVAL_NON_INTERACTIVE = origPolicy;
    } else {
      delete process.env.APPROVAL_NON_INTERACTIVE;
    }
  }
});

test("Approval - session-wide approval overrides (allow once vs always allow)", () => {
  clearSessionApprovals();
  assert.equal(isSessionApprovalAllowed("WRITE"), false);
  assert.equal(isApprovalRequired({ approval: true }, "WRITE"), true);

  // Grant session approval for WRITE only
  allowSessionApproval("WRITE");
  assert.equal(isSessionApprovalAllowed("WRITE"), true);
  assert.equal(isSessionApprovalAllowed("EXEC"), false);
  assert.equal(isApprovalRequired({ approval: true }, "WRITE"), false);
  assert.equal(isApprovalRequired({ approval: true }, "EXEC"), true);

  // Clear approvals
  clearSessionApprovals();
  assert.equal(isSessionApprovalAllowed("WRITE"), false);
  assert.equal(isApprovalRequired({ approval: true }, "WRITE"), true);

  // Grant all
  allowSessionApproval("ALL");
  assert.equal(isSessionApprovalAllowed("WRITE"), true);
  assert.equal(isSessionApprovalAllowed("DELETE"), true);
  assert.equal(isSessionApprovalAllowed("EXEC"), true);
  assert.equal(isApprovalRequired({ approval: true }, "DELETE"), false);
  clearSessionApprovals();
});
