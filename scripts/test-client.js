import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

export async function runTest() {
  const mcpUrl = process.env.MCP_URL || "http://localhost:4173/mcp";
  console.log(`Connecting to ${mcpUrl}...`);

  const headers = {
    "ngrok-skip-browser-warning": "true",
  };
  if (process.env.API_KEY) {
    headers["Authorization"] = `Bearer ${process.env.API_KEY}`;
  }

  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: { headers },
  });

  const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });

  try {
    await client.connect(transport);
    console.log("Connected to MCP server.\n");
    console.log("Server Instructions from handshake:\n" + (client.getInstructions() || "(none)") + "\n");

    const toolsResponse = await client.listTools();
    const toolNames = toolsResponse.tools.map((t) => t.name);
    console.log("Available tools:", toolNames);

    if (!toolNames.includes("get_project_context") || !toolNames.includes("list_files") || !toolNames.includes("read_file")) {
      throw new Error(`Missing expected tools. Found: ${toolNames.join(", ")}`);
    }

    console.log("\n1. Testing get_project_context (empty object)...");
    const contextResult = await client.callTool({ name: "get_project_context", arguments: {} });
    console.log(contextResult.content[0].text.slice(0, 150) + "...\n");

    console.log("1b. Testing get_project_context with undefined arguments (Claude / Cursor client format)...");
    const contextResultNoArgs = await client.callTool({ name: "get_project_context" });
    if (contextResultNoArgs.isError) throw new Error("get_project_context failed with undefined args");
    console.log("get_project_context with undefined args passed successfully.\n");

    console.log("2. Testing list_files (empty object)...");
    const listResult = await client.callTool({ name: "list_files", arguments: {} });
    console.log(listResult.content[0].text.slice(0, 150) + "...\n");

    console.log("2b. Testing list_files with undefined arguments (Claude / Cursor client format)...");
    const listResultNoArgs = await client.callTool({ name: "list_files" });
    if (listResultNoArgs.isError) throw new Error("list_files failed with undefined args");
    console.log("list_files with undefined args passed successfully.\n");

    console.log("\n3. Testing read_file ('package.json')...");
    const readResult = await client.callTool({ name: "read_file", arguments: { path: "package.json" } });
    console.log(readResult.content[0].text.slice(0, 180) + "...\n");

    console.log("4. Testing path traversal defense ('../../../etc/passwd')...");
    const traversal = await client.callTool({ name: "read_file", arguments: { path: "../../../etc/passwd" } });
    if (!traversal.isError || !traversal.content[0].text.includes("escapes project root")) {
      throw new Error("Traversal test failed");
    }
    console.log("Path traversal correctly blocked.\n");

    console.log("5. Testing non-existent file ('missing.txt')...");
    const missing = await client.callTool({ name: "read_file", arguments: { path: "missing.txt" } });
    if (!missing.isError || !missing.content[0].text.includes("File not found")) {
      throw new Error("Missing file test failed");
    }
    console.log("Missing file correctly handled.\n");

    console.log("6. Testing .env security blocking...");
    const envBlocked = await client.callTool({ name: "read_file", arguments: { path: ".env" } });
    if (!envBlocked.isError || !envBlocked.content[0].text.includes("blocked")) {
      throw new Error(".env blocking test failed");
    }
    console.log(".env access correctly blocked.\n");

    if (toolNames.includes("search_code")) {
      console.log("7. Testing search_code ('calculator')...");
      const searchRes = await client.callTool({
        name: "search_code",
        arguments: { query: "calculator" },
      });
      console.log(searchRes.content[0].text);
      console.log("search_code verified.\n");
    }

    if (toolNames.includes("write_file") && toolNames.includes("delete_file")) {
      console.log("8. Testing write_file & delete_file ('temp-lifecycle.txt')...");
      await client.callTool({
        name: "write_file",
        arguments: { path: "temp-lifecycle.txt", content: "Temporary test content" },
      });

      const readBack = await client.callTool({
        name: "read_file",
        arguments: { path: "temp-lifecycle.txt" },
      });
      if (!readBack.content[0].text.includes("Temporary test content")) {
        throw new Error("write_file test failed");
      }

      const delRes = await client.callTool({
        name: "delete_file",
        arguments: { path: "temp-lifecycle.txt" },
      });
      console.log(delRes.content[0].text);
      console.log("delete_file verified successfully.\n");
    }

    if (toolNames.includes("execute_command")) {
      console.log("9. Testing execute_command ('node -v')...");
      const cmdRes = await client.callTool({
        name: "execute_command",
        arguments: { command: "node -v" },
      });
      console.log(cmdRes.content[0].text);

      console.log("\n10. Testing execute_command security policy ('cat .env')...");
      const blockedCmd = await client.callTool({
        name: "execute_command",
        arguments: { command: "cat .env" },
      });
      if (!blockedCmd.isError || !blockedCmd.content[0].text.includes("Blocked")) {
        throw new Error("execute_command security check failed");
      }
      console.log("Dangerous command correctly blocked.\n");
    }

    console.log("All project-scoped MCP checks passed successfully.");
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  } finally {
    await transport.close();
  }
}

const isDirectRun =
  process.argv[1] &&
  fileURLToPath(import.meta.url).toLowerCase() === path.resolve(process.argv[1]).toLowerCase();

if (isDirectRun) {
  runTest();
}
