import test from "node:test";
import assert from "node:assert/strict";
import { sessions, cleanupInactiveSessions, SESSION_TTL_MS } from "../src/routes/mcp.js";

test("MCP Sessions - inactive session cleanup", () => {
  const now = Date.now();
  let closed = false;

  // Active session
  sessions.set("session-active", {
    lastAccessed: now - 5000,
    client: { clientName: "active-client" },
    transport: { close: () => {} },
  });

  // Expired session
  sessions.set("session-expired", {
    lastAccessed: now - SESSION_TTL_MS - 10000,
    client: { clientName: "expired-client" },
    transport: {
      close: () => {
        closed = true;
      },
    },
  });

  assert.equal(sessions.has("session-active"), true);
  assert.equal(sessions.has("session-expired"), true);

  cleanupInactiveSessions(now);

  assert.equal(sessions.has("session-active"), true);
  assert.equal(sessions.has("session-expired"), false);
  assert.equal(closed, true);

  // Clean up
  sessions.delete("session-active");
});
