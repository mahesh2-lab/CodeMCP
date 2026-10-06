import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  tokenizeCommand,
  validateExecution,
  buildCleanEnv,
  runExecFileWithTimeout,
} from "../src/tools/executeCommand.js";
import { PathGuardError, getProjectRoot } from "../src/utils/pathGuard.js";

test("ExecuteCommand - Tokenizer handles words, quotes, and whitespace", () => {
  assert.deepEqual(tokenizeCommand("npm test"), ["npm", "test"]);
  assert.deepEqual(
    tokenizeCommand('git commit -m "initial commit" --quiet'),
    ["git", "commit", "-m", "initial commit", "--quiet"]
  );
  assert.deepEqual(
    tokenizeCommand("node 'script file.js'"),
    ["node", "script file.js"]
  );
});

test("ExecuteCommand - Tokenizer allows quotes and complex command strings", () => {
  assert.deepEqual(tokenizeCommand("npm test && rm -rf dist"), [
    "npm",
    "test",
    "&&",
    "rm",
    "-rf",
    "dist",
  ]);
  assert.deepEqual(tokenizeCommand("npm test; whoami"), [
    "npm",
    "test;",
    "whoami",
  ]);
});

test("ExecuteCommand - Validator permits arbitrary binaries including curl", () => {
  const root = getProjectRoot();

  assert.doesNotThrow(() => validateExecution("node", ["--version"], root));
  assert.doesNotThrow(() => validateExecution("git", ["status"], root));
  assert.doesNotThrow(() => validateExecution("npm", ["test"], root));
  assert.doesNotThrow(() => validateExecution("whoami", [], root));
  assert.doesNotThrow(() => validateExecution("curl", ["https://example.com"], root));
  assert.doesNotThrow(() => validateExecution("bash", ["-c", "id"], root));
});

test("ExecuteCommand - Validator permits runtime eval flags like node -e and python -c", () => {
  const root = getProjectRoot();

  assert.doesNotThrow(() =>
    validateExecution("node", ["-e", "console.log(process.env)"], root),
  );
  assert.doesNotThrow(() =>
    validateExecution("node", ["--eval=console.log(1)"], root),
  );
  assert.doesNotThrow(() =>
    validateExecution("python", ["-c", "import os; print(os.environ)"], root),
  );
  assert.doesNotThrow(() =>
    validateExecution("python", ["-cprint(1)"], root),
  );
  assert.doesNotThrow(() =>
    validateExecution("git", ["-c", "core.pager=cat", "status"], root),
  );
});

test("ExecuteCommand - Environment passes system environment to executed processes", () => {
  const root = getProjectRoot();
  process.env.TEST_CUSTOM_KEY = "custom_val";

  try {
    const clean = buildCleanEnv(root);
    assert.equal(clean.PROJECT_ROOT, root);
    assert.equal(clean.TEST_CUSTOM_KEY, "custom_val");
  } finally {
    delete process.env.TEST_CUSTOM_KEY;
  }
});

test("ExecuteCommand - execFile executes safe binary without shell", async () => {
  const root = getProjectRoot();
  const cleanEnv = buildCleanEnv(root);

  const result = await runExecFileWithTimeout({
    binary: "node",
    args: ["--version"],
    cwd: root,
    timeout: 5000,
    env: cleanEnv,
  });

  assert.equal(result.exitCode, 0);
  assert.ok(result.stdout.startsWith("v"));
});

test("ExecuteCommand - runs npm --version safely without spawn EINVAL", async () => {
  const root = getProjectRoot();
  const cleanEnv = buildCleanEnv(root);

  const result = await runExecFileWithTimeout({
    binary: "npm",
    args: ["--version"],
    cwd: root,
    timeout: 15000,
    env: cleanEnv,
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+/);
});
