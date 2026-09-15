import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  getProjectRoot,
  resolveSafe,
  isIgnored,
  isBinaryBuffer,
  createScopedPathGuard,
  PathGuardError,
} from "../src/utils/pathGuard.js";

test("PathGuard - getProjectRoot resolves to valid path", () => {
  const root = getProjectRoot();
  assert.ok(typeof root === "string");
  assert.ok(path.isAbsolute(root));
});

test("PathGuard - resolveSafe allows paths within root", () => {
  const root = getProjectRoot();
  const safe = resolveSafe("package.json", root);
  assert.equal(safe, path.join(root, "package.json"));
});

test("PathGuard - resolveSafe blocks directory traversal", () => {
  const root = getProjectRoot();
  assert.throws(
    () => resolveSafe("../../../etc/passwd", root),
    (err) => err instanceof PathGuardError && err.statusCode === 403,
  );
  assert.throws(
    () => resolveSafe("..\\..\\Windows\\System32", root),
    (err) => err instanceof PathGuardError && err.statusCode === 403,
  );
});

test("PathGuard - isIgnored identifies ignored patterns", () => {
  const root = getProjectRoot();
  assert.equal(isIgnored(path.join(root, "node_modules", "express"), root), true);
  assert.equal(isIgnored(path.join(root, ".git", "config"), root), true);
  assert.equal(isIgnored(path.join(root, ".env"), root), true);
  assert.equal(isIgnored(path.join(root, ".npmrc"), root), true);
  assert.equal(isIgnored(path.join(root, ".pypirc"), root), true);
  assert.equal(isIgnored(path.join(root, ".ssh", "id_rsa"), root), true);
  assert.equal(isIgnored(path.join(root, "src", "index.js"), root), false);
});

test("PathGuard - isBinaryBuffer detects binary content and allows text", () => {
  const textBuffer = Buffer.from("Hello world, this is normal UTF-8 source code!");
  assert.equal(isBinaryBuffer(textBuffer), false);

  const emptyBuffer = Buffer.alloc(0);
  assert.equal(isBinaryBuffer(emptyBuffer), false);

  const binaryBuffer = Buffer.from([0x48, 0x65, 0x6c, 0x00, 0x6f]); // contains null byte
  assert.equal(isBinaryBuffer(binaryBuffer), true);
});

test("PathGuard - createScopedPathGuard binds methods to root", () => {
  const root = getProjectRoot();
  const guard = createScopedPathGuard(root);
  assert.equal(guard.root, root);
  assert.equal(guard.resolveSafe("package.json"), path.join(root, "package.json"));
  assert.throws(() => guard.resolveSafe("../escape.txt"));
});
