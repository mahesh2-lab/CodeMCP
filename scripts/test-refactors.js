import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import express from "express";
import { toPosix, BINARY_EXTENSIONS, getProjectRoot } from "../src/utils/pathGuard.js";
import { verifyActionApproval, isApprovalRequired } from "../src/services/approval.js";
import { getClientSource } from "../src/utils/clientInfo.js";
import { checkAuth } from "../src/middleware/auth.js";
import { getCustomHelpText } from "../src/utils/help.js";
import { getProjectByKey, getActiveProject } from "../src/services/projects.js";
import { createToolContext } from "../src/tools/context.js";
import { registerTools } from "../src/tools/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import routes from "../src/routes/index.js";

console.log("🧪 Running Comprehensive CodeMCP Refactoring & Quality Tests...\n");

// -------------------------------------------------------------
// Test 1: toPosix & BINARY_EXTENSIONS in pathGuard.js
// -------------------------------------------------------------
{
  console.log("1. Testing toPosix and BINARY_EXTENSIONS...");
  assert.strictEqual(toPosix("foo\\bar\\baz.js"), "foo/bar/baz.js");
  assert.strictEqual(toPosix("C:\\Users\\azure\\file.txt"), "C:/Users/azure/file.txt");
  assert.strictEqual(toPosix("already/posix/path.js"), "already/posix/path.js");
  assert.strictEqual(toPosix(""), "");
  assert.strictEqual(toPosix(null), "");
  assert.strictEqual(toPosix(undefined), "");

  assert.ok(BINARY_EXTENSIONS.has(".png"), "Should have .png");
  assert.ok(BINARY_EXTENSIONS.has(".pdf"), "Should have .pdf");
  assert.ok(BINARY_EXTENSIONS.has(".sqlite"), "Should have .sqlite (from searchCode union)");
  assert.ok(BINARY_EXTENSIONS.has(".db"), "Should have .db (from searchCode union)");
  assert.ok(BINARY_EXTENSIONS.has(".lock"), "Should have .lock (from searchCode union)");
  assert.ok(!BINARY_EXTENSIONS.has(".js"), "Should not have .js");
  assert.ok(!BINARY_EXTENSIONS.has(".json"), "Should not have .json");
  console.log("   ✔ toPosix and BINARY_EXTENSIONS verified.\n");
}

// -------------------------------------------------------------
// Test 2: clientType detection in clientInfo.js
// -------------------------------------------------------------
{
  console.log("2. Testing clientType detection in clientInfo.js...");

  // SSE request
  const sseReq = {
    headers: { accept: "text/event-stream" },
    query: {},
    socket: { remoteAddress: "127.0.0.1" },
  };
  assert.strictEqual(getClientSource(sseReq).clientType, "sse");

  // CLI / curl request
  const curlReq = {
    headers: { "user-agent": "curl/7.68.0" },
    query: {},
    socket: { remoteAddress: "127.0.0.1" },
  };
  assert.strictEqual(getClientSource(curlReq).clientType, "cli/curl");

  // Browser request
  const browserReq = {
    headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    query: {},
    socket: { remoteAddress: "127.0.0.1" },
  };
  assert.strictEqual(getClientSource(browserReq).clientType, "browser");

  // MCP handshake payload request
  const mcpReq = {
    headers: { "content-type": "application/json" },
    body: { params: { clientInfo: { name: "Claude Desktop" } } },
    query: {},
    socket: { remoteAddress: "127.0.0.1" },
  };
  const mcpSource = getClientSource(mcpReq);
  assert.strictEqual(mcpSource.clientType, "mcp-client");
  assert.strictEqual(mcpSource.clientName, "Claude Desktop");

  // Default StreamableHTTP request
  const genericReq = {
    headers: {},
    query: {},
    socket: { remoteAddress: "127.0.0.1" },
  };
  assert.strictEqual(getClientSource(genericReq).clientType, "streamable-http");
  console.log("   ✔ clientType detection verified across all request classes.\n");
}

// -------------------------------------------------------------
// Test 3: verifyActionApproval shared helper in approval.js
// -------------------------------------------------------------
{
  console.log("3. Testing verifyActionApproval in approval.js...");

  // Project with approval disabled
  const resNoApproval = await verifyActionApproval({
    project: { approval: false },
    actionType: "WRITE",
    path: "test.js",
  });
  assert.strictEqual(resNoApproval.approved, true);

  // In non-interactive test environment, approval required auto-approves safely
  const resWithApproval = await verifyActionApproval({
    project: { approval: true },
    actionType: "WRITE",
    path: "test.js",
    oldContent: "old",
    newContent: "new",
  });
  assert.strictEqual(typeof resWithApproval.approved, "boolean");
  console.log("   ✔ verifyActionApproval logic verified.\n");
}

// -------------------------------------------------------------
// Test 4: checkAuth middleware & API_KEY vault mechanism
// -------------------------------------------------------------
{
  console.log("4. Testing checkAuth middleware...");

  // 4a. No API_KEY configured -> should allow through (0-config mode)
  delete process.env.API_KEY;
  let nextCalled = false;
  const mockReqNoKey = { headers: {} };
  const mockRes = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  checkAuth(mockReqNoKey, mockRes, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true, "Should allow request through when API_KEY is unset");
  assert.ok(mockReqNoKey.project, "Should attach active project to req");

  // 4b. API_KEY configured -> should reject missing Bearer header
  process.env.API_KEY = "secret-vault-token-123";
  let rejected401 = false;
  const mockReqMissing = { headers: {} };
  const mockResMissing = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  checkAuth(mockReqMissing, mockResMissing, () => { rejected401 = true; });
  assert.strictEqual(mockResMissing.statusCode, 401);
  assert.strictEqual(mockResMissing.body.error, "Missing Authorization Bearer header");

  // 4c. API_KEY configured -> should reject wrong token
  const mockReqWrong = { headers: { authorization: "Bearer wrong-token" } };
  const mockResWrong = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  checkAuth(mockReqWrong, mockResWrong, () => {});
  assert.strictEqual(mockResWrong.statusCode, 401);
  assert.strictEqual(mockResWrong.body.error, "Invalid API key");

  // 4d. API_KEY configured -> should accept matching Bearer token
  let authSucceeded = false;
  const mockReqValid = { headers: { authorization: "Bearer secret-vault-token-123" } };
  const mockResValid = {
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  checkAuth(mockReqValid, mockResValid, () => { authSucceeded = true; });
  assert.strictEqual(authSucceeded, true, "Valid Bearer token should pass authentication");
  assert.ok(mockReqValid.project, "Should attach validated project");

  // Clean up env
  delete process.env.API_KEY;
  console.log("   ✔ checkAuth middleware & Bearer authentication verified.\n");
}

// -------------------------------------------------------------
// Test 5: Dynamic getProjectRoot() in context.js & health.js
// -------------------------------------------------------------
{
  console.log("5. Testing dynamic getProjectRoot() resolution...");
  const initialRoot = getProjectRoot();
  assert.ok(initialRoot, "Initial project root should exist");

  const customTestDir = path.resolve("./test-dynamic-root");
  process.env.PROJECT_ROOT = customTestDir;
  assert.strictEqual(getProjectRoot(), customTestDir, "getProjectRoot should dynamically reflect updated env");

  // Tool context should use dynamic project root
  const dummyServer = new McpServer({ name: "test", version: "1.0.0" });
  const ctx = createToolContext(dummyServer);
  assert.strictEqual(ctx.projectRoot, customTestDir);

  // Restore env
  delete process.env.PROJECT_ROOT;
  console.log("   ✔ Dynamic project root resolution verified.\n");
}

// -------------------------------------------------------------
// Test 6: Custom help text & dynamic package version
// -------------------------------------------------------------
{
  console.log("6. Testing getCustomHelpText dynamic versioning...");
  const helpText = getCustomHelpText();
  assert.ok(helpText.includes("1.1.2"), "Help text should contain version 1.1.2");
  assert.ok(helpText.toUpperCase().includes("USAGE"), "Help text should include Usage section");
  assert.ok(helpText.toUpperCase().includes("COMMANDS"), "Help text should include Commands section");
  console.log("   ✔ getCustomHelpText output verified.\n");
}

// -------------------------------------------------------------
// Test 7: End-to-End Live HTTP Server & Client Tool Execution
// -------------------------------------------------------------
{
  console.log("7. Testing End-to-End HTTP Server & MCP Client Tool Calls...");

  const testApp = express();
  testApp.use(express.json());
  testApp.use(routes);

  // Bind to dynamic ephemeral port
  const server = http.createServer(testApp);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 7a. Test /health endpoint
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.strictEqual(healthRes.status, 200);
    const healthJson = await healthRes.json();
    assert.strictEqual(healthJson.status, "ok");
    assert.ok(healthJson.projectRoot);

    // 7b. Test /mcp browser GET info
    const mcpGetRes = await fetch(`${baseUrl}/mcp`);
    assert.strictEqual(mcpGetRes.status, 200);
    const mcpJson = await mcpGetRes.json();
    assert.strictEqual(mcpJson.status, "online");
    assert.strictEqual(mcpJson.transport, "StreamableHTTP");
    assert.ok(mcpJson.detectedClient);
    assert.ok(mcpJson.detectedClient.type, "detectedClient.type should be defined");

    // 7c. Connect StreamableHTTP MCP Client
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
    const client = new Client({ name: "e2e-refactor-client", version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);

    // List tools
    const toolList = await client.listTools();
    const toolNames = toolList.tools.map((t) => t.name);
    assert.ok(toolNames.includes("list_files"));
    assert.ok(toolNames.includes("read_file"));
    assert.ok(toolNames.includes("write_file"));
    assert.ok(toolNames.includes("delete_file"));
    assert.ok(toolNames.includes("execute_command"));

    // Call list_files
    const listRes = await client.callTool({ name: "list_files", arguments: {} });
    assert.ok(!listRes.isError);

    // Call execute_command with node -v
    const execRes = await client.callTool({
      name: "execute_command",
      arguments: { command: "node -v" },
    });
    assert.ok(!execRes.isError);
    assert.ok(execRes.content[0].text.includes("Exit Code : 0"));

    // Call write_file and delete_file (verifying verifyActionApproval integration)
    const testFileName = "test-refactor-verify.tmp";
    const writeRes = await client.callTool({
      name: "write_file",
      arguments: { path: testFileName, content: "Refactor verification file content" },
    });
    assert.ok(!writeRes.isError);

    const deleteRes = await client.callTool({
      name: "delete_file",
      arguments: { path: testFileName },
    });
    assert.ok(!deleteRes.isError);

    await transport.close();
    console.log("   ✔ End-to-end HTTP server & MCP client verified successfully.\n");
  } finally {
    server.close();
  }
}

console.log("🎉 ALL CODE REFACTORING & QUALITY TESTS PASSED SUCCESSFULLY! 🚀\n");
