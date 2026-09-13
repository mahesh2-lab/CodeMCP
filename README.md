# CodeMCP

[![npm version](https://img.shields.io/npm/v/@mahesh2-lab/codemcp.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@mahesh2-lab/codemcp)
[![npm downloads](https://img.shields.io/npm/dm/@mahesh2-lab/codemcp.svg?style=flat-square&color=blue)](https://www.npmjs.com/package/@mahesh2-lab/codemcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg?style=flat-square)](https://nodejs.org/)
[![Protocol: MCP](https://img.shields.io/badge/protocol-Model%20Context%20Protocol-6366f1.svg?style=flat-square)](https://modelcontextprotocol.io)

**Zero-configuration Model Context Protocol (MCP) server that connects your local codebase to any AI assistant, agent, or IDE.**

CodeMCP allows AI assistants to directly inspect your file tree, search code, read implementation details, and make file modifications in your local project workspace without manual copy-pasting.

---

## Key Features

- ⚡ **Zero Setup**: Run immediately in any directory with `npx @mahesh2-lab/codemcp`. No complex configuration required.
- 🌐 **Instant Public HTTPS Tunnel**: Built-in ngrok tunneling provisions a secure, global HTTPS URL on launch for remote web connectors.
- 🔒 **Encrypted Credential Storage**: Machine-bound AES-256-GCM vault (`~/.codemcp/credentials.enc`) protects your tokens safely without plaintext files.
- 🛡️ **PathGuard File Sandboxing**: Prevents directory traversal (`../`) and blocks sensitive files (`.git`, `node_modules`, private keys) from being accessed.
- 🎚️ **Granular Tool Permissions**: Easily configure access tiers (`both`, `read`-only, or `write`-only) to match your workflow.
- ✋ **Interactive Accept / Reject**: Review colorized line diffs in real time before AI file modifications or deletions are applied (`--confirm` flag or `"approval": true`).
- 🧠 **Context & Guidelines Injection**: Automatically provides coding guidelines and architecture notes from `CONTEXT.md` to connected AI models.
- 🔌 **Dynamic Port Handling**: Defaults to port `4173` and automatically picks the next open port if occupied.

---

## Quick Start

### 1. Instant Run with npx (Recommended)

Run directly inside any project folder:

```bash
npx @mahesh2-lab/codemcp
```

### 2. Global Installation

Install globally to use the `codemcp` command anywhere:

```bash
npm install -g @mahesh2-lab/codemcp
```

```bash
# Serve current directory:
codemcp

# Or serve a specific project directory:
codemcp /path/to/project

# Run locally without public tunnel (localhost only):
codemcp --no-tunnel
```

### 3. Interactive Project Setup (`codemcp init`)

Set up a `codemcp.json` and a starter `CONTEXT.md` for custom permissions and project notes:

```bash
codemcp init
```

---

## Ngrok Tunnel Setup (Public HTTPS)

Web-based AI assistants and remote connectors require a public HTTPS endpoint to communicate with your local machine. CodeMCP integrates automated [ngrok](https://ngrok.com) tunneling out of the box.

### 1. Get Free ngrok Credentials

1. Create a free account at [ngrok.com/signup](https://dashboard.ngrok.com/signup).
2. Grab your **API Key** from [dashboard.ngrok.com/api-keys](https://dashboard.ngrok.com/api-keys).
3. *(Optional)* Claim your **1 free static domain** at [dashboard.ngrok.com/domains](https://dashboard.ngrok.com/domains) (e.g. `your-domain.ngrok-free.app`).

---

### 2. Configuration Options

#### Option A: Automatic Interactive Setup (Easiest)

Simply run CodeMCP in your terminal:

```bash
npx @mahesh2-lab/codemcp
```

- If `NGROK_API_KEY` is not found, CodeMCP automatically opens `https://dashboard.ngrok.com/api-keys` in your browser.
- Paste your API key when prompted in the terminal.
- CodeMCP saves it into your machine-encrypted vault (`~/.codemcp/credentials.enc`), automatically provisions a tunnel authtoken, discovers or reserves your domain, and launches your tunnel. You only need to do this once.

---

#### Option B: Configure via CodeMCP CLI

You can pre-configure credentials using the `credentials` command:

```bash
# Save your ngrok API Key (auto-provisions authtoken and domain):
codemcp credentials set NGROK_API_KEY <your-api-key>

# (Optional) Explicitly set an existing authtoken:
codemcp credentials set NGROK_AUTHTOKEN <your-authtoken>

# (Optional) Lock to a specific static or reserved domain:
codemcp credentials set NGROK_DOMAIN your-subdomain.ngrok-free.app
```

---

#### Option C: Environment Variables (CI/CD or Containers)

For automated pipelines or Docker containers, pass environment variables directly:

```bash
export NGROK_API_KEY="your_api_key"
export NGROK_AUTHTOKEN="your_authtoken"
export NGROK_DOMAIN="your-domain.ngrok-free.app"

codemcp
```

---

### 3. Disabling the Tunnel (Localhost Only)

If you are using desktop apps or editor extensions on the same machine and do not need a public internet URL, disable tunneling:

```bash
# Via CLI flag:
codemcp --no-tunnel

# Or via environment variable:
export NGROK_ENABLED=false
```

---

## Terminal Output

When started, CodeMCP prints your active connection endpoints and session status:

```text
========================================================================
  CodeMCP Project Agent (MCP)
========================================================================
  Project    : my-web-app (my-web-app)
  Root       : /home/user/projects/my-web-app
  Config     : codemcp.json
  Permission : Read & Write
  Context    : CONTEXT.md
  Local URL  : http://localhost:4173/mcp
  Global URL : https://your-subdomain.ngrok-free.app/mcp
========================================================================
  Waiting for AI client requests... (tool activity appears below)
```

---

## Connecting to AI Clients

### 1. Web Connectors & Remote AI Tools

1. In your AI assistant's settings, find **Connectors**, **Integrations**, or **MCP Servers**.
2. Select **Add Custom Connector**:
   - **Name**: `CodeMCP`
   - **URL**: Paste the **Global URL** from your terminal (e.g., `https://xxxx.ngrok.app/mcp`).
   - **Authentication**: None.
3. Save. Your assistant can now access your project's context and tools.

---

### 2. Desktop AI Applications

Add CodeMCP to your desktop MCP configuration file:

```json
{
  "mcpServers": {
    "codemcp": {
      "command": "npx",
      "args": ["-y", "@mahesh2-lab/codemcp", "--no-tunnel", "/path/to/project"]
    }
  }
}
```

---

### 3. IDEs & Code Editors (Cursor, VS Code, Windsurf)

In your editor's MCP settings, register a new server:

- **Type**: `HTTP` or `SSE`
- **URL**: `http://localhost:4173/mcp` (or your public ngrok URL)

---

### 4. Custom Agents & MCP SDK Pipelines

Connect programmatically using the official Model Context Protocol SDK:

```javascript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(new URL("http://localhost:4173/mcp"));
const client = new Client({ name: "my-agent", version: "1.0.0" }, { capabilities: {} });

await client.connect(transport);

// Fetch architecture guidelines
const context = await client.callTool({ name: "get_project_context", arguments: {} });

// List workspace files
const files = await client.callTool({ name: "list_files", arguments: { path: "." } });
```

---

## Available Tools Reference

CodeMCP exposes standard MCP tools to the AI assistant based on your configured permissions:

| Tool | Required Permission | Description |
| :--- | :--- | :--- |
| `get_project_context` | `read`, `write`, `both` | Returns project metadata, tech stack, indexed file count, and `CONTEXT.md` guidelines. |
| `list_files` | `read`, `both` | Recursively lists source files, respecting `.gitignore` and `.mcpignore` rules. |
| `read_file` | `read`, `both` | Reads the text content of a file within the project boundary. |
| `search_code` | `read`, `both` | Searches file content using exact text or regular expressions. |
| `write_file` | `write`, `both` | Creates a new file or updates an existing file within the project root. |
| `delete_file` | `write`, `both` | Deletes a file within the project boundary. |
| `execute_command` | `write`, `both` | Executes terminal commands inside the project directory and returns output. |

---

## Project Configuration

### `codemcp.json` (Configuration File)

Create a `codemcp.json` file in your project root to customize server settings (auto-created on first run or via `codemcp init`):

```json

{
  "id": "my-project",
  "name": "My Web Application",
  "description": "Full-stack web application",
  "permission": "both",
  "contextFile": "CONTEXT.md",
  "techStack": ["React", "TypeScript", "Node.js"]
}
```

#### Settings

- **`permission`**:
  - `"both"` (default): Read, search, write, delete, and execute commands.
  - `"read"`: Inspection only (`get_project_context`, `list_files`, `read_file`, `search_code`).
  - `"write"`: Modification only (`get_project_context`, `write_file`, `delete_file`, `execute_command`).
- **`contextFile`**: Relative path to guidelines file (defaults to `CONTEXT.md`).
- **`techStack`**: Array of technologies used in the project.

---

### `CONTEXT.md` (Optional)

Provide architecture rules and conventions directly to the AI model by creating a `CONTEXT.md` in your project root:

```markdown
# Project Guidelines
- State Management: Zustand store in `src/store/`
- API Layer: React Query hooks in `src/api/`
- Coding Style: TypeScript with strict mode enabled
```

---

### Ignoring Files (`.mcpignore` & `.gitignore`)

CodeMCP respects standard `.gitignore` rules. You can also create a `.mcpignore` file in your project root to exclude additional files from AI visibility:

```gitignore
# Exclude sensitive files
.env*
*.pem
*.key

# Exclude generated artifacts
dist/
coverage/
*.sqlite
```

---

## Credential Management

API keys and tokens are encrypted and stored in `~/.codemcp/credentials.enc` using AES-256-GCM.

### CLI Commands

```bash
# View stored credentials (values masked):
codemcp credentials status

# Store or update a credential:
codemcp credentials set NGROK_API_KEY <your-api-key>
codemcp credentials set NGROK_AUTHTOKEN <your-authtoken>
codemcp credentials set NGROK_DOMAIN <your-domain.ngrok.app>

# Delete a credential:
codemcp credentials delete NGROK_AUTHTOKEN

# Clear all stored credentials:
codemcp credentials clear
```

### Environment Variables

You can also configure CodeMCP with standard environment variables:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `4173` | Port to listen on (auto-increments if occupied). |
| `NGROK_ENABLED` | `true` | Set to `"false"` to disable public tunneling. |
| `NGROK_API_KEY` | `(vault)` | Ngrok account API key for provisioning. |
| `NGROK_AUTHTOKEN`| `(vault)` | Ngrok tunnel authtoken. |
| `NGROK_DOMAIN` | `(vault)` | Custom or reserved ngrok domain. |
| `PROJECT_ROOT` | `process.cwd()`| Target project directory. |

---

## CLI Reference

```text
Usage: codemcp [command] [options]

Commands:
  codemcp [path]                  Start MCP server for project (default command)
  codemcp start [path]            Explicitly start MCP server
  codemcp init [path]             Interactive setup to create codemcp.json and CONTEXT.md
  codemcp info [path]             Display project metadata and source file count
  codemcp credentials [cmd]       Manage encrypted credentials in ~/.codemcp/credentials.enc

Options:
  -p, --port <number>             Local port to listen on (default: 4173)
  --no-tunnel                     Disable public tunnel (localhost only)
  -y, --yes                       Skip prompts during init and use defaults
  -V, --version                   Display version number
  -h, --help                      Display help
```

---

## Security

- **Path Traversal Protection**: All paths are resolved and validated against the project root. Attempts to escape the directory (`../`) are blocked with a `403 Forbidden` error.
- **Sensitive File Redaction**: `.env`, `.git`, `node_modules`, secret keys, and certificates are automatically blocked from tool reading.
- **No Plaintext Secrets**: Auth tokens and API keys are stored in an encrypted machine vault outside your project repository.

---

## License

MIT © [CodeMCP Contributors](https://github.com/mahesh2-lab/CodeMCP)
