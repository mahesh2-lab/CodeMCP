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

test("ExecuteCommand - Tokenizer blocks shell chaining and redirection", () => {
  assert.throws(
    () => tokenizeCommand("npm test && rm -rf dist"),
    (err) => err instanceof PathGuardError && err.statusCode === 403
  );
  assert.throws(
    () => tokenizeCommand("npm test | cat"),
    (err) => err instanceof PathGuardError && err.statusCode === 403
  );
  assert.throws(
    () => tokenizeCommand("npm test > output.txt"),
    (err) => err instanceof PathGuardError && err.statusCode === 403
  );
  assert.throws(
    () => tokenizeCommand("npm test; whoami"),
    (err) => err instanceof PathGuardError && err.statusCode === 403
  );
});

test("ExecuteCommand - Validator blocks non-allowlisted binaries", () => {
  const root = getProjectRoot();

  // Allowlisted
  assert.doesNotThrow(() => validateExecution("node", ["--version"], root));
  assert.doesNotThrow(() => validateExecution("git", ["status"], root));
  assert.doesNotThrow(() => validateExecution("npm", ["test"], root));

  // Non-allowlisted binaries
  assert.throws(
    () => validateExecution("whoami", [], root),
    (err) => err instanceof PathGuardError && err.statusCode === 403
  );
  assert.throws(
    () => validateExecution("curl", ["https://example.com"], root),
    (err) => err instanceof PathGuardError && err.statusCode === 403
  );
  assert.throws(
    () => validateExecution("bash", ["-c", "id"], root),
    (err) => err instanceof PathGuardError && err.statusCode === 403
  );
});

test("ExecuteCommand - Validator blocks dangerous runtime eval flags", () => {
  const root = getProjectRoot();

  assert.throws(
    () => validateExecution("node", ["-e", "console.log(process.env)"], root),
    (err) => err instanceof PathGuardError && err.statusCode === 403
  );
  assert.throws(
    () => validateExecution("node", ["--eval=console.log(1)"], root),
    (err) => err instanceof PathGuardError && err.statusCode === 403
  );
  assert.throws(
    () => validateExecution("python", ["-c", "import os; print(os.environ)"], root),
    (err) => err instanceof PathGuardError && err.statusCode === 403
  );
  assert.throws(
    () => validateExecution("python", ["-cprint(1)"], root),
    (err) => err instanceof PathGuardError && err.statusCode === 403
  );
  assert.throws(
    () => validateExecution("git", ["-c", "core.pager=cat", "status"], root),
    (err) => err instanceof PathGuardError && err.statusCode === 403
  );
  assert.throws(
    () => validateExecution("git", ["--config-env=core.pager=FOO", "status"], root),
    (err) => err instanceof PathGuardError && err.statusCode === 403
  );
});

test("ExecuteCommand - Validator blocks path traversal arguments and sensitive files", () => {
  const root = getProjectRoot();

  assert.throws(
    () => validateExecution("node", ["../../../etc/passwd"], root),
    (err) => err instanceof PathGuardError && err.statusCode === 403
  );
  assert.throws(
    () => validateExecution("node", [".env"], root),
    (err) => err instanceof PathGuardError && err.statusCode === 403
  );
  assert.throws(
    () => validateExecution("node", [".npmrc"], root),
    (err) => err instanceof PathGuardError && err.statusCode === 403
  );
  assert.throws(
    () => validateExecution("node", [".ssh/id_rsa"], root),
    (err) => err instanceof PathGuardError && err.statusCode === 403
  );
});

test("ExecuteCommand - Environment allowlisting excludes sensitive variables", () => {
  const root = getProjectRoot();
  process.env.OWNER_PASSWORD = "supersecretpassword";
  process.env.JWT_SECRET = "jwtsecret123";
  process.env.CUSTOM_API_KEY = "myapikey";

  try {
    const clean = buildCleanEnv(root);
    assert.equal(clean.PROJECT_ROOT, root);
    assert.equal(clean.OWNER_PASSWORD, undefined);
    assert.equal(clean.JWT_SECRET, undefined);
    assert.equal(clean.CUSTOM_API_KEY, undefined);
  } finally {
    delete process.env.OWNER_PASSWORD;
    delete process.env.JWT_SECRET;
    delete process.env.CUSTOM_API_KEY;
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
