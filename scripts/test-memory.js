import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { getProjectRoot } from "../src/utils/pathGuard.js";
import {
  loadMemory,
  recordAction,
  recordHandoff,
  formatMemoryForInstructions,
  getMemoryFilePath,
  clearMemoryCache,
} from "../src/services/memory.js";

console.log("🧪 Running CodeMCP Native Memory Verification Tests...\n");

const root = getProjectRoot();
const memFile = getMemoryFilePath(root);

// 1. Test loadMemory initial state
{
  console.log("1. Testing initial memory loading...");
  const memory = await loadMemory(root);
  assert.ok(memory, "Memory object should exist");
  assert.strictEqual(memory.version, 1);
  assert.ok(Array.isArray(memory.recentActions));
  console.log("   ✔ loadMemory initialized safely.\n");
}

// 2. Test recordHandoff
{
  console.log("2. Testing recordHandoff...");
  const updated = await recordHandoff(root, {
    summary: "Implemented native cross-assistant memory context",
    decisions: "Used zero-dependency file-based memory in .codemcp/memory.json",
    nextSteps: "Run comprehensive test client checks",
    client: "Cursor Test Agent",
  });

  assert.strictEqual(updated.lastHandoff.summary, "Implemented native cross-assistant memory context");
  assert.strictEqual(updated.lastHandoff.client, "Cursor Test Agent");
  assert.ok(updated.lastHandoff.updatedAt);
  console.log("   ✔ recordHandoff updated state.\n");
}

// 3. Test recordAction and rolling limit
{
  console.log("3. Testing recordAction and rolling limit (max 15)...");
  for (let i = 1; i <= 20; i++) {
    await recordAction(root, {
      action: "WRITE",
      target: `src/file_${i}.js`,
      client: "Claude Desktop",
      details: `${i * 100} bytes`,
    });
  }

  const memory = await loadMemory(root);
  assert.strictEqual(memory.recentActions.length, 15, "Should cap at max 15 recent actions");
  assert.strictEqual(memory.recentActions[14].target, "src/file_20.js");
  console.log("   ✔ recordAction capped at rolling 15 actions.\n");
}

// 4. Test formatMemoryForInstructions
{
  console.log("4. Testing formatMemoryForInstructions formatting...");
  const formatted = await formatMemoryForInstructions(root);
  assert.ok(formatted.includes("Cursor Test Agent"));
  assert.ok(formatted.includes("Implemented native cross-assistant memory context"));
  assert.ok(formatted.includes("Recent Workspace Activity"));
  assert.ok(formatted.includes("src/file_20.js"));
  console.log("   ✔ Formatted output preview:\n" + formatted + "\n");
}

// 5. Verify physical persistence on disk
{
  console.log("5. Testing physical disk persistence in .codemcp/memory.json...");
  const diskRaw = await fs.readFile(memFile, "utf8");
  const diskData = JSON.parse(diskRaw);
  assert.strictEqual(diskData.lastHandoff.summary, "Implemented native cross-assistant memory context");
  assert.strictEqual(diskData.recentActions.length, 15);
  console.log("   ✔ Memory correctly persisted to " + memFile + "\n");
}

// 6. Test strict project isolation between multiple distinct projects
{
  console.log("6. Testing strict project isolation between different projects...");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codemcp-proj-iso-"));
  const projectA = {
    id: "proj-alpha",
    name: "Project Alpha",
    root: path.join(tempDir, "alpha"),
  };
  const projectB = {
    id: "proj-beta",
    name: "Project Beta",
    root: path.join(tempDir, "beta"),
  };

  await fs.mkdir(projectA.root, { recursive: true });
  await fs.mkdir(projectB.root, { recursive: true });

  // Record separate memories for Project A and Project B
  await recordHandoff(projectA, {
    summary: "Alpha Core Engine Completed",
    decisions: "Using Microservices",
    nextSteps: "Deploy to staging",
    client: "Claude Desktop",
  });

  await recordAction(projectA, {
    action: "WRITE",
    target: "src/alphaEngine.js",
    client: "Claude Desktop",
  });

  await recordHandoff(projectB, {
    summary: "Beta Frontend Redesign",
    decisions: "Using Vanilla CSS",
    nextSteps: "Conduct UI audit",
    client: "Cursor Agent",
  });

  await recordAction(projectB, {
    action: "WRITE",
    target: "src/betaView.js",
    client: "Cursor Agent",
  });

  // Verify Project A memory has no Project B data
  const memoryA = await loadMemory(projectA);
  assert.strictEqual(memoryA.projectId, "proj-alpha");
  assert.strictEqual(memoryA.projectName, "Project Alpha");
  assert.strictEqual(memoryA.lastHandoff.summary, "Alpha Core Engine Completed");
  assert.strictEqual(memoryA.recentActions.length, 1);
  assert.strictEqual(memoryA.recentActions[0].target, "src/alphaEngine.js");

  // Verify Project B memory has no Project A data
  const memoryB = await loadMemory(projectB);
  assert.strictEqual(memoryB.projectId, "proj-beta");
  assert.strictEqual(memoryB.projectName, "Project Beta");
  assert.strictEqual(memoryB.lastHandoff.summary, "Beta Frontend Redesign");
  assert.strictEqual(memoryB.recentActions.length, 1);
  assert.strictEqual(memoryB.recentActions[0].target, "src/betaView.js");

  // Verify physical file separation
  const fileA = getMemoryFilePath(projectA);
  const fileB = getMemoryFilePath(projectB);
  assert.notStrictEqual(fileA, fileB);

  const fileAExists = await fs.stat(fileA).then(() => true).catch(() => false);
  const fileBExists = await fs.stat(fileB).then(() => true).catch(() => false);
  assert.ok(fileAExists, "Project Alpha memory file must exist in alpha directory");
  assert.ok(fileBExists, "Project Beta memory file must exist in beta directory");

  // Clean up temp directories
  await fs.rm(tempDir, { recursive: true, force: true });
  clearMemoryCache(projectA);
  clearMemoryCache(projectB);

  console.log("   ✔ Complete memory and cache isolation verified between Project Alpha and Project Beta.\n");
}

// 7. Test rich action metadata (details, summary, preview)
{
  console.log("7. Testing rich action metadata (summary, preview, details)...");
  await recordAction(root, {
    action: "WRITE",
    target: "index.html",
    client: "openai-mcp",
    details: "Created 8803 bytes (245 lines)",
    summary: 'HTML page: "CodeMCP Dashboard"',
    preview: '<!DOCTYPE html> <html lang="en"> <head> <title>CodeMCP Dashboard</title>...',
  });

  const memory = await loadMemory(root);
  const latestAction = memory.recentActions[memory.recentActions.length - 1];
  assert.strictEqual(latestAction.target, "index.html");
  assert.strictEqual(latestAction.summary, 'HTML page: "CodeMCP Dashboard"');
  assert.strictEqual(latestAction.details, "Created 8803 bytes (245 lines)");
  assert.ok(latestAction.preview);

  const formatted = await formatMemoryForInstructions(root);
  assert.ok(formatted.includes('HTML page: "CodeMCP Dashboard"'));
  console.log("   ✔ Rich action item verified with summary & preview:\n" + JSON.stringify(latestAction, null, 2) + "\n");
}

console.log("🎉 All Native Memory verification tests passed successfully!");
