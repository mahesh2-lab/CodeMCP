# CodeMCP ⚡

[![npm version](https://img.shields.io/npm/v/@mahesh2-lab/codemcp.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@mahesh2-lab/codemcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg?style=flat-square)](https://nodejs.org/)
[![Protocol: MCP](https://img.shields.io/badge/protocol-Model%20Context%20Protocol-6366f1.svg?style=flat-square)](https://modelcontextprotocol.io)

**Connect your local codebase to any AI assistant in seconds.**

CodeMCP is a zero-setup **Model Context Protocol (MCP)** server. It gives AI tools (Claude, Cursor, VS Code, web agents) safe access to inspect files, search code, and make edits in your project—without manual copy-pasting.

---

## ✨ Highlights

* ⚡ **Zero Setup**: Run `npx @mahesh2-lab/codemcp` in any project folder and start immediately.
* ✋ **Review Changes (Accept / Reject)**: Review colorized diffs before any AI edits are applied to your disk.
* 🌐 **Instant Public URL**: Built-in secure HTTPS tunnel so web-based AI tools can reach your local machine.
* 🛡️ **Sandbox Security**: Blocks path traversal (`../`) and protects sensitive files (`.env`, `.git`, SSH keys).
* 🧠 **Project Context**: Automatically feeds your coding guidelines and architecture rules (`CONTEXT.md`) to the AI.
* 🎚️ **Permission Modes**: Choose `read-only`, `write-only`, or full `read & write` access.

---

## 🚀 Quick Start

### 1. Run in any project

Run directly with `npx` inside your project directory:

```bash
npx @mahesh2-lab/codemcp
```

Or install globally to use the `codemcp` command anywhere:

```bash
npm install -g @mahesh2-lab/codemcp
codemcp
```

When started, CodeMCP prints your connection endpoints:

```text
┌─  CodeMCP Project Agent (MCP)  ────────────────────────────────┐
│                                                                │
│  Project    : my-app (my-app)                                  │
│  Root       : /Users/you/projects/my-app                       │
│  Permission : Read & Write                                     │
│  Approval   : Enabled (Ask before changes)                     │
│  Local URL  : http://localhost:4173/mcp                        │
│  Global URL : https://your-tunnel.ngrok-free.app/mcp           │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## ✋ Accept & Reject Changes (Interactive Review)

Never let an AI assistant overwrite files without your permission. With approval mode enabled, CodeMCP pauses the AI and shows a clean, colorized line diff in your terminal:

```text
 ⚠️  AI CHANGE APPROVAL REQUIRED 
Action : WRITE FILE
File   : src/index.js
Diff   : +4 -1
────────────────────────────────────────────────────────────
-    5 | const port = 3000;
+    5 | const port = process.env.PORT || 3000;
+    6 | app.use(cors());
────────────────────────────────────────────────────────────

Apply these changes? [Press y=Accept / n=Reject / d=Full diff]: 
```

**Single-keypress response (no need to hit Enter):**
* Press **`y`** (or **Enter**): Accepts and writes the change immediately.
* Press **`n`** (or **Esc**): Rejects the change. Your file remains untouched, and the AI is notified.
* Press **`d`**: Expands and displays the complete diff.

### How to turn on Change Approval:
* Run with the `--approval` (or `-a`) flag:
  ```bash
  codemcp --approval
  # or
  codemcp -a
  ```
* Or add `"approval": true` to your `codemcp.json`:
  ```json
  {
    "approval": true
  }
  ```
*(You can also use `codemcp --no-approval` to temporarily bypass prompts)*

---

## 🔌 Connecting to Your AI Assistant

### 1. Cursor / VS Code / Windsurf
In your editor's MCP settings, add a new server:
* **Transport**: `HTTP` or `SSE`
* **URL**: `http://localhost:4173/mcp` (or your Global tunnel URL)

### 2. Claude Desktop
Add CodeMCP to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "codemcp": {
      "command": "npx",
      "args": ["-y", "@mahesh2-lab/codemcp", "--no-tunnel", "/path/to/your/project"]
    }
  }
}
```

### 3. Web AI & Remote Connectors (ChatGPT / Claude Web)
1. Copy the **Global URL** printed in your terminal (e.g., `https://xxxx.ngrok-free.app/mcp`).
2. In your AI web client, go to **Connectors / MCP Integrations** -> **Add Custom Connector**.
3. Paste the URL. (Authentication: None).

---

## ⚙️ Configuration (`codemcp.json`)

You can customize permissions and behavior using a `codemcp.json` file in your project root (created automatically or with `codemcp init`):

```json
{
  "name": "My Project",
  "description": "Full-stack web application",
  "permission": "both",
  "approval": true,
  "contextFile": "CONTEXT.md"
}
```

| Field | Options | Description |
| :--- | :--- | :--- |
| `permission` | `"both"` (default), `"read"`, `"write"` | Control if AI can read, write, or both. |
| `approval` | `true`, `false` | When `true`, asks for confirmation before any file changes. |
| `contextFile` | `"CONTEXT.md"` | Path to your coding conventions file. |

---

## 🧠 Teaching the AI Your Rules (`CONTEXT.md`)

Create a `CONTEXT.md` in your project root. CodeMCP automatically delivers these rules to the AI model whenever it starts:

```markdown
# Project Rules
- State Management: Use Zustand in `src/store/`
- API Layer: Use TanStack Query
- Code Style: Functional React components with TypeScript
```

---

## 🛠️ Commands Reference

| Command | What it does |
| :--- | :--- |
| `codemcp` | Starts the server in the current directory. |
| `codemcp /path/to/project` | Starts the server for a specific project. |
| `codemcp --approval` (or `-a`) | Starts the server with change approval enabled. |
| `codemcp --no-approval` | Starts the server with change approval disabled. |
| `codemcp --no-tunnel` | Runs locally only (no public HTTPS tunnel). |
| `codemcp info` | Shows project summary, file count, and active permission tier. |
| `codemcp init` | Interactive setup to create `codemcp.json` and `CONTEXT.md`. |
| `codemcp credentials status` | Lists encrypted tokens stored in machine vault. |

---

## 🧰 Available Tools for AI

| Tool Name | What AI Uses It For |
| :--- | :--- |
| `list_files` | Explores the project folder tree. |
| `read_file` | Reads source code safely. |
| `search_code` | Searches files for keywords or regex patterns. |
| `write_file` | Creates or edits files (subject to Approval if enabled). |
| `delete_file` | Deletes files (subject to Approval if enabled). |
| `execute_command` | Runs project commands (e.g. tests, linting, builds). |
| `get_project_context` | Loads your tech stack and `CONTEXT.md` guidelines. |

---

## 🔒 Security

* **Sandboxed Paths**: The AI cannot read or write outside your project root (`../` traversal is blocked).
* **Protected Secrets**: Sensitive files like `.env*`, `.git`, SSH keys, and `node_modules` are hidden from tools.
* **Encrypted Vault**: Ngrok tokens are stored securely in `~/.codemcp/credentials.enc` with AES-256-GCM encryption.

---

## License

[MIT](LICENSE) © [CodeMCP Contributors](https://github.com/mahesh2-lab/CodeMCP)
