import test from "node:test";
import assert from "node:assert/strict";
import { validateApiKey } from "../src/tunnel/ngrok.js";

test("Ngrok API Key - Empty or missing key fails validation", async () => {
  const resEmpty = await validateApiKey("");
  assert.equal(resEmpty.ok, false);
  assert.ok(resEmpty.error);

  const resNull = await validateApiKey(null);
  assert.equal(resNull.ok, false);
  assert.ok(resNull.error);
});

test("Ngrok API Key - Invalid key fails ngrok API verification", async () => {
  const result = await validateApiKey("invalid_dummy_key_12345");
  assert.equal(result.ok, false);
  assert.ok(result.error);
});
