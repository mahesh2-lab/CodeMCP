import test from "node:test";
import assert from "node:assert/strict";
import {
  getInstallationId,
  getStatsBaseUrl,
  isTelemetryEnabled,
  sendTelemetry,
  sendHeartbeat,
  startTelemetryReporter,
  stopTelemetryReporter,
  getCodeMcpVersion,
} from "../src/services/telemetry.js";

test("Telemetry - generates and persists installation ID", () => {
  const id1 = getInstallationId();
  const id2 = getInstallationId();
  assert.ok(typeof id1 === "string" && id1.length > 5);
  assert.equal(id1, id2);
});

test("Telemetry - getCodeMcpVersion resolves non-empty version", () => {
  const v = getCodeMcpVersion();
  assert.ok(typeof v === "string" && v.length > 0);
});

test("Telemetry - getStatsBaseUrl respects configuration", () => {
  const defaultUrl = getStatsBaseUrl();
  assert.ok(defaultUrl.startsWith("http"));
  assert.equal(defaultUrl.endsWith("/"), false);
});

test("Telemetry - isTelemetryEnabled always returns true", () => {
  assert.equal(isTelemetryEnabled(), true);
  process.env.DO_NOT_TRACK = "1";
  assert.equal(isTelemetryEnabled(), true);
  delete process.env.DO_NOT_TRACK;
});

test("Telemetry - sendTelemetry fails gracefully on unreachable host without throwing", async () => {
  const originalDnt = process.env.DO_NOT_TRACK;
  const originalUrl = process.env.CODESTATS_URL;
  try {
    delete process.env.DO_NOT_TRACK;
    process.env.CODESTATS_URL = "http://127.0.0.1:59999"; // Unreachable port
    const result = await sendTelemetry("test", { test: true }, 300);
    assert.equal(result, false);
  } finally {
    if (originalDnt !== undefined) process.env.DO_NOT_TRACK = originalDnt;
    if (originalUrl !== undefined) process.env.CODESTATS_URL = originalUrl;
    else delete process.env.CODESTATS_URL;
  }
});

test("Telemetry - sendHeartbeat fails gracefully on unreachable host without throwing", async () => {
  const originalDnt = process.env.DO_NOT_TRACK;
  const originalUrl = process.env.CODESTATS_URL;
  try {
    delete process.env.DO_NOT_TRACK;
    process.env.CODESTATS_URL = "http://127.0.0.1:59999"; // Unreachable port
    const result = await sendHeartbeat(300);
    assert.equal(result, false);
  } finally {
    if (originalDnt !== undefined) process.env.DO_NOT_TRACK = originalDnt;
    if (originalUrl !== undefined) process.env.CODESTATS_URL = originalUrl;
    else delete process.env.CODESTATS_URL;
  }
});

test("Telemetry - reporter lifecycle starts and stops cleanly", async () => {
  startTelemetryReporter({
    project: { id: "test-proj", name: "Test" },
    port: 4173,
    intervalMs: 60000,
  });

  await stopTelemetryReporter(200);
  assert.ok(true);
});
