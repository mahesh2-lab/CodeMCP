import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isUrlAllowed,
  isSensitivePath,
  reservePort,
} from "../src/services/browser.js";
import { assertBrowserCommand } from "../src/tools/browser.js";

test("allows loopback http/ws URLs", () => {
  assert.equal(isUrlAllowed("http://localhost:3000/"), true);
  assert.equal(isUrlAllowed("http://127.0.0.1:5173/app"), true);
  assert.equal(isUrlAllowed("http://[::1]:8080/"), true);
  assert.equal(isUrlAllowed("ws://localhost:3000/_next/webpack-hmr"), true);
});

test("allows inline schemes used by normal pages", () => {
  assert.equal(isUrlAllowed("data:image/png;base64,AAAA"), true);
  assert.equal(isUrlAllowed("blob:http://localhost:3000/abc"), true);
  assert.equal(isUrlAllowed("about:blank"), true);
});

test("blocks external hosts by default", () => {
  assert.equal(isUrlAllowed("https://example.com/"), false);
  assert.equal(isUrlAllowed("https://fonts.googleapis.com/css"), false);
  assert.equal(isUrlAllowed("http://169.254.169.254/latest/meta-data"), false);
});

test("allows external hosts only when explicitly enabled", () => {
  assert.equal(isUrlAllowed("https://example.com/", { allowExternal: true }), true);
});

test("blocks dangerous schemes even when external is enabled", () => {
  assert.equal(isUrlAllowed("file:///etc/passwd", { allowExternal: true }), false);
  assert.equal(isUrlAllowed("ftp://localhost/x", { allowExternal: true }), false);
  assert.equal(isUrlAllowed("javascript:alert(1)", { allowExternal: true }), false);
});

test("blocks lookalike and obfuscated hostnames", () => {
  assert.equal(isUrlAllowed("http://localhost.evil.com/"), false);
  assert.equal(isUrlAllowed("http://127.0.0.1.evil.com/"), false);
  assert.equal(isUrlAllowed("http://localhost:3000@evil.com/"), false);
  assert.equal(isUrlAllowed("http://0.0.0.0:3000/"), false);
  assert.equal(isUrlAllowed("http://[::ffff:127.0.0.1]:3000/"), false);
});

test("blocks reserved ports (the CodeMCP server itself)", () => {
  reservePort(4173);
  assert.equal(isUrlAllowed("http://localhost:4173/mcp"), false);
  assert.equal(isUrlAllowed("http://127.0.0.1:4173/"), false);
  assert.equal(isUrlAllowed("http://localhost:3000/"), true);
});

test("per-session port allowlist blocks other local services", () => {
  const allowedPorts = new Set([3000, 4000]);
  assert.equal(isUrlAllowed("http://localhost:3000/", { allowedPorts }), true);
  assert.equal(isUrlAllowed("http://localhost:4000/api", { allowedPorts }), true);
  assert.equal(isUrlAllowed("http://localhost:5432/", { allowedPorts }), false); // e.g. a database UI
  assert.equal(isUrlAllowed("http://localhost:4040/", { allowedPorts }), false); // e.g. ngrok inspector
  assert.equal(isUrlAllowed("http://localhost/", { allowedPorts }), false); // implicit :80
});

test("blocks sensitive paths even on the allowed port", () => {
  const allowedPorts = new Set([3000]);
  for (const p of [
    "/.env",
    "/.env.local",
    "/.git/config",
    "/.codemcp/memory.json",
    "/.ssh/id_rsa",
    "/id_ed25519",
    "/.npmrc",
    "/codemcp.json",
    "/@fs/etc/passwd",
    "/@fs/C:/Users/me/.env",
    "/%2eenv",
    "/%252eenv",
    "/static/..%2f.env",
    "/.git%2fconfig",
  ]) {
    assert.equal(
      isUrlAllowed(`http://localhost:3000${p}`, { allowedPorts }),
      false,
      `expected ${p} to be blocked`,
    );
  }
});

test("allows normal app paths, including look-alikes", () => {
  const allowedPorts = new Set([3000]);
  for (const p of [
    "/",
    "/login",
    "/api/credentials",
    "/assets/index-abc123.js",
    "/node_modules/.vite/deps/react.js",
    "/.well-known/security.txt",
    "/environment",
    "/.environment-banner.png",
    "/_next/static/chunks/main.js",
  ]) {
    assert.equal(
      isUrlAllowed(`http://localhost:3000${p}`, { allowedPorts }),
      true,
      `expected ${p} to be allowed`,
    );
  }
});

test("isSensitivePath refuses malformed percent-encoding", () => {
  assert.equal(isSensitivePath("/%E0%A4%A"), true);
});

test("rejects garbage input", () => {
  assert.equal(isUrlAllowed("not a url"), false);
  assert.equal(isUrlAllowed(""), false);
});

test("browser_start command allowlist: permits dev-server launchers", () => {
  assert.doesNotThrow(() => assertBrowserCommand("npm", ["run", "dev"]));
  assert.doesNotThrow(() => assertBrowserCommand("npm", ["start"]));
  assert.doesNotThrow(() => assertBrowserCommand("pnpm", ["dev"]));
  assert.doesNotThrow(() => assertBrowserCommand("yarn", ["preview"]));
  assert.doesNotThrow(() => assertBrowserCommand("npm.cmd", ["run", "dev"]));
  assert.doesNotThrow(() => assertBrowserCommand("node", ["server.js"]));
  assert.doesNotThrow(() => assertBrowserCommand("python3", ["app.py"]));
});

test("browser_start command allowlist: blocks remote-code and unrelated tools", () => {
  assert.throws(() => assertBrowserCommand("npx", ["vite"]), /only starts apps via/);
  assert.throws(() => assertBrowserCommand("git", ["status"]), /only starts apps via/);
  assert.throws(() => assertBrowserCommand("pip", ["install", "x"]), /only starts apps via/);
  assert.throws(() => assertBrowserCommand("cargo", ["run"]), /only starts apps via/);
  assert.throws(() => assertBrowserCommand("npm", ["exec", "evil"]), /allows only/);
  assert.throws(() => assertBrowserCommand("npm", ["install"]), /allows only/);
  assert.throws(() => assertBrowserCommand("pnpm", ["dlx", "evil"]), /allows only/);
  assert.throws(() => assertBrowserCommand("npm", ["--prefix", "x", "run", "dev"]), /allows only/);
  assert.throws(() => assertBrowserCommand("npm", []), /allows only/);
});
