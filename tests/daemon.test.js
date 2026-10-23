import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  getDaemonStatePath,
  getDaemonLogPath,
  saveDaemonState,
  readDaemonState,
  removeDaemonState,
  isProcessRunning,
  stopDaemon,
  getDaemonLogs,
} from "../src/utils/daemon.js";
import { getCustomHelpText } from "../src/utils/help.js";
import { infoProject } from "../src/commands/info.js";

describe("Daemon / Detached Mode", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codemcp-daemon-test-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  test("getDaemonStatePath creates .codemcp directory and returns valid path", () => {
    const statePath = getDaemonStatePath(tmpDir);
    assert.ok(statePath.includes("daemon.json"));
    assert.ok(fs.existsSync(path.dirname(statePath)));
  });

  test("saveDaemonState, readDaemonState, and removeDaemonState manage lifecycle", () => {
    const dummyState = {
      pid: 12345,
      startedAt: Date.now(),
      projectRoot: tmpDir,
      port: 4173,
    };

    saveDaemonState(tmpDir, dummyState);
    const read = readDaemonState(tmpDir);
    assert.deepEqual(read, dummyState);

    removeDaemonState(tmpDir);
    const afterDelete = readDaemonState(tmpDir);
    assert.equal(afterDelete, null);
  });

  test("isProcessRunning accurately identifies current process and invalid pid", () => {
    assert.equal(isProcessRunning(process.pid), true);
    assert.equal(isProcessRunning(99999999), false);
    assert.equal(isProcessRunning(null), false);
    assert.equal(isProcessRunning(undefined), false);
  });

  test("stopDaemon handles nonexistent daemon gracefully", () => {
    const result = stopDaemon(tmpDir);
    assert.equal(result.ok, false);
    assert.ok(result.message.includes("No active background CodeMCP server"));
  });

  test("stopDaemon cleans up stale daemon state when pid is not running", () => {
    saveDaemonState(tmpDir, {
      pid: 99999999,
      startedAt: Date.now(),
      projectRoot: tmpDir,
      port: 4173,
    });

    const result = stopDaemon(tmpDir);
    assert.equal(result.ok, false);
    assert.ok(result.message.includes("no longer running"));
    assert.equal(readDaemonState(tmpDir), null);
  });

  test("getDaemonLogs reads recent log lines", () => {
    const logPath = getDaemonLogPath(tmpDir);
    fs.writeFileSync(logPath, "Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n", "utf8");

    const tail = getDaemonLogs(tmpDir, 2);
    assert.ok(tail.includes("Line 5"));
  });

  test("getCustomHelpText documents detach mode and daemon commands", () => {
    const help = getCustomHelpText();
    assert.ok(help.includes("-d, --detach"));
    assert.ok(help.includes("stop [path]"));
    assert.ok(help.includes("logs [path]"));
    assert.ok(help.includes("codemcp -d"));
  });

  test("CLI detached mode: starts background process, writes state, and stops cleanly", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "codemcp.json"),
      JSON.stringify({ name: "test-detached-proj", permission: "read" }),
      "utf8",
    );

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const cliPath = path.resolve(__dirname, "../bin/cli.js");
    const port = 49199;

    const res = spawnSync(
      process.execPath,
      [cliPath, "-d", tmpDir, "--no-tunnel", "--no-notify", "-p", String(port)],
      {
        encoding: "utf8",
        cwd: tmpDir,
        env: { ...process.env, DO_NOT_TRACK: "1" },
      },
    );

    assert.equal(res.status, 0);
    assert.ok(res.stdout.includes("CodeMCP server started in background (detached mode)"));

    // Give process a moment to initialize
    await new Promise((resolve) => setTimeout(resolve, 800));

    const state = readDaemonState(tmpDir);
    assert.ok(state);
    assert.ok(state.pid);
    assert.equal(isProcessRunning(state.pid), true);

    // Stop daemon via CLI
    const stopCliRes = spawnSync(
      process.execPath,
      [cliPath, "stop", tmpDir],
      {
        encoding: "utf8",
        cwd: tmpDir,
      },
    );
    assert.equal(stopCliRes.status, 0);
    assert.ok(stopCliRes.stdout.includes("Successfully stopped background CodeMCP server"));

    // Wait a brief moment for exit
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(isProcessRunning(state.pid), false);
    assert.equal(readDaemonState(tmpDir), null);
  });

  test("infoProject supports session and password options", () => {
    fs.writeFileSync(
      path.join(tmpDir, "codemcp.json"),
      JSON.stringify({ name: "test-info-proj", permission: "read" }),
      "utf8",
    );

    const sessionInfo = infoProject(tmpDir, { session: true });
    assert.ok(sessionInfo.password);
    assert.equal(typeof sessionInfo.password, "string");
    assert.equal(sessionInfo.project.name, "test-info-proj");

    const passInfo = infoProject(tmpDir, { password: true });
    assert.ok(passInfo.password);
    assert.equal(passInfo.password, sessionInfo.password);
  });

  test("CLI info command supports -s, -p, and 'session' argument", () => {
    fs.writeFileSync(
      path.join(tmpDir, "codemcp.json"),
      JSON.stringify({ name: "test-cli-info-proj", permission: "read" }),
      "utf8",
    );

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const cliPath = path.resolve(__dirname, "../bin/cli.js");

    const resS = spawnSync(process.execPath, [cliPath, "info", tmpDir, "-s"], { encoding: "utf8" });
    assert.equal(resS.status, 0);
    assert.ok(resS.stdout.includes("Session & Auth Info"));
    assert.ok(resS.stdout.includes("Password"));

    const resP = spawnSync(process.execPath, [cliPath, "info", tmpDir, "-p"], { encoding: "utf8" });
    assert.equal(resP.status, 0);
    assert.ok(resP.stdout.includes("Owner Password"));
  });
});
