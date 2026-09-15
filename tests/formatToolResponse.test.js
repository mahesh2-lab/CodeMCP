import test from "node:test";
import assert from "node:assert/strict";
import { formatToolResponse, MAX_TOOL_RESPONSE_CHARS } from "../src/tools/context.js";

test("formatToolResponse - standard output", () => {
  const structured = { success: true, count: 5 };
  const res = formatToolResponse(structured);

  assert.deepEqual(res.structuredContent, structured);
  assert.equal(res.content.length, 1);
  assert.equal(res.content[0].type, "text");
  assert.ok(res.content[0].text.includes('"success": true'));
});

test("formatToolResponse - truncates oversized text", () => {
  const hugeString = "A".repeat(MAX_TOOL_RESPONSE_CHARS + 500);
  const res = formatToolResponse({}, hugeString);

  assert.ok(res.content[0].text.includes("... [Response truncated: output exceeded"));
  assert.ok(res.content[0].text.length < hugeString.length);
});
