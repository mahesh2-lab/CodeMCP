import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  startServer,
  handleShutdown,
  resetShutdownState,
} from "../src/server.js";

describe("Server Shutdown", () => {
  let originalExit;
  let exitCode = null;
  let exitCodes = [];

  beforeEach(() => {
    resetShutdownState();
    originalExit = process.exit;
    exitCode = null;
    exitCodes = [];
    process.exit = (code) => {
      exitCode = code;
      exitCodes.push(code);
    };
  });

  afterEach(() => {
    resetShutdownState();
    process.exit = originalExit;
  });

  it("handles shutdown cleanly with open connections", async () => {
    process.env.NGROK_ENABLED = "false";
    const { port } = await startServer({ port: 0 });

    // Open a persistent connection (simulating SSE / keep-alive)
    const req = http.get(`http://localhost:${port}/`, (res) => {
      res.resume();
    });
    req.on("error", () => {}); // Connection destruction error is expected

    await new Promise((r) => setTimeout(r, 100));

    await handleShutdown("SIGINT");

    assert.equal(exitCode, 0, "process.exit should be called with 0");
  });

  it("terminates immediately with code 130 on consecutive SIGINT (force quit)", async () => {
    process.env.NGROK_ENABLED = "false";
    await startServer({ port: 0 });

    // First signal initiates shutdown
    const shutdownPromise = handleShutdown("SIGINT");

    // Second signal during shutdown triggers immediate force quit
    await handleShutdown("SIGINT");

    assert.ok(
      exitCodes.includes(130),
      "process.exit should be called with 130 on second Ctrl+C",
    );
    await shutdownPromise;
  });

  it("handles SIGTERM signal cleanly", async () => {
    process.env.NGROK_ENABLED = "false";
    await startServer({ port: 0 });

    await handleShutdown("SIGTERM");
    assert.equal(
      exitCode,
      0,
      "process.exit should be called with 0 on SIGTERM",
    );
  });
});
