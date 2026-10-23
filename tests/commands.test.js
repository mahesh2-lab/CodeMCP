import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { approvalCommand } from "../src/commands/approval.js";
import { logsCommand } from "../src/commands/logs.js";
import { printCredentialsStatus } from "../src/commands/credentials.js";
import { getDaemonLogPath } from "../src/utils/daemon.js";

describe("CLI Commands Modules", () => {
  let tmpDir;
  let originalCwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codemcp-commands-test-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  test("approvalCommand toggles approval on and off in codemcp.json", () => {
    const configPath = path.join(tmpDir, "codemcp.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({ name: "test-approval-proj", approval: false }, null, 2),
      "utf8",
    );

    // Turn ON
    approvalCommand("on");
    let manifest = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.equal(manifest.approval, true);

    // Turn OFF
    approvalCommand("off");
    manifest = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.equal(manifest.approval, false);

    // Query current state (no argument)
    approvalCommand();
    manifest = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.equal(manifest.approval, false);
  });

  test("logsCommand reads output from daemon log file", () => {
    const logPath = getDaemonLogPath(tmpDir);
    fs.writeFileSync(logPath, "Log line 1\nLog line 2\nLog line 3\n", "utf8");

    // Must execute without throwing
    logsCommand(tmpDir, { lines: "2" });
  });

  test("printCredentialsStatus executes without error", () => {
    assert.doesNotThrow(() => {
      printCredentialsStatus();
    });
  });
});
