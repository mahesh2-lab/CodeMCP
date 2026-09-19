# @mahesh2-lab/codemcp

> **The Project-Scoped Model Context Protocol Server for Local Codebases**

[![npm version](https://img.shields.io/npm/v/@mahesh2-lab/codemcp?style=flat-square&color=black&labelColor=222)](https://www.npmjs.com/package/@mahesh2-lab/codemcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow?style=flat-square&labelColor=222)](LICENSE)
[![Protocol](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-6366f1?style=flat-square&labelColor=222)](https://modelcontextprotocol.io/)

CodeMCP connects AI assistants (Claude, Cursor, Windsurf, etc.) to your local project codebase through authenticated Streamable HTTP with sandboxed tools, interactive terminal approvals, and cross-session memory.

---

## 🚀 Quick Start

Run directly inside any project folder using `npx` (no installation required):

```bash
# Start with a secure public HTTPS tunnel (for remote AI clients like Claude)
npx @mahesh2-lab/codemcp

# Or start for local-only access (for local AI clients like Cursor / Claude Desktop)
npx @mahesh2-lab/codemcp --no-tunnel
```

When started, CodeMCP will automatically:
1. Detect or initialize project metadata (`codemcp.json`, `.mcpignore`, `CONTEXT.md`).
2. Display your **Local URL**, **Global URL** (if tunneled), and a secure **Owner Password**.
3. Listen for incoming MCP tool requests.

---

## 📦 Global Installation

If you prefer to install CodeMCP globally:

```bash
npm install --global @mahesh2-lab/codemcp
```

Then run it from anywhere:

```bash
# In the current directory:
codemcp

# Or specify a target directory:
codemcp ./path/to/project --no-tunnel
```

---

## 🤖 Connecting to Your AI Client

### 1. Claude Desktop

Add CodeMCP to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "my-project": {
      "command": "npx",
      "args": ["-y", "@mahesh2-lab/codemcp", "--no-tunnel", "/absolute/path/to/project"]
    }
  }
}
```

### 2. Claude Code, Cursor, Windsurf & Remote Clients

1. Run CodeMCP in your terminal:
   ```bash
   codemcp
   ```
2. Copy the **Global URL** (e.g., `https://your-domain.ngrok-free.app/mcp`) or **Local URL** (`http://localhost:4173/mcp`).
3. Add it as an HTTP MCP Server in your client settings.
4. When your client prompts for authentication, open the URL and enter the **Owner Password** displayed in the CodeMCP terminal.

---

## 🛡️ Interactive Approvals

By default, CodeMCP protects your codebase by asking for confirmation in the terminal before making changes:

```text
┌─ Action Approval Required ───────────────────────────────────────┐
│ Action    : WRITE                                                │
│ Target    : src/index.js                                         │
│ Summary   : Add error handling for API requests                  │
├──────────────────────────────────────────────────────────────────┤
--- old
+++ new
@@ -1,3 +1,5 @@
+try {
   fetchData();
+} catch (err) { console.error(err); }
└──────────────────────────────────────────────────────────────────┘

Approve this action?
 [y] Allow once      [a] Always allow for session
 [n] Reject          [d] View full diff       [q] Cancel
```

### Approval Shortcuts

| Key | Action |
| :---: | :--- |
| **`y`** | **Allow once**: Approves this single operation. |
| **`a`** | **Always allow**: Approves this operation and all future operations for the current session. |
| **`n`** | **Reject**: Blocks the operation with a rejection message returned to the AI. |
| **`d`** | **View full diff**: Expands the entire unified diff. |
| **`q`** | **Cancel**: Aborts the operation immediately. |

To disable approval prompts completely:
```bash
codemcp --no-approval
# Or persist in configuration:
codemcp approval off
```

To require approval only for deletions and commands:
```bash
codemcp --approval destructive
```

---

## ⌨️ Common CLI Commands & Options

### Commands

| Command | Description |
| :--- | :--- |
| `codemcp [path]` | Start the MCP server for the given project (defaults to current directory). |
| `codemcp init [path]` | Create or update `codemcp.json`, `.mcpignore`, and `CONTEXT.md`. |
| `codemcp info [path]` | Display project permissions, status, and indexed file count. |
| `codemcp approval <on\|off>` | Turn approval prompts on or off in `codemcp.json`. |
| `codemcp credentials status` | Inspect stored encrypted credentials. |
| `codemcp credentials set <key> <val>` | Store credentials securely (e.g. `NGROK_API_KEY`). |

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `-p, --port <number>` | Port to listen on (auto-detects next free port if busy) | `4173` |
| `--no-tunnel` | Run locally without creating an ngrok tunnel | Tunneled |
| `-a, --approval <mode>` | Approval mode: `true`/`always`, `destructive`, or `false`/`never` | `true` |
| `--no-approval` | Disable all confirmation prompts (auto-apply changes) | Prompting |
| `-y, --yes` | Skip interactive setup prompts and accept defaults | Interactive |
| `-h, --help` | Show CLI help | |

---

## ⚙️ Configuration (`codemcp.json`)

CodeMCP reads `codemcp.json` in your project root:

```json
{
  "id": "my-project",
  "name": "My Project",
  "description": "Project overview and guidelines for AI assistants.",
  "permission": "both",
  "approval": true,
  "contextFile": "CONTEXT.md"
}
```

- **`permission`**: `"both"` (read & write), `"read"` (read-only), or `"write"`.
- **`approval`**: `true` (ask before changes), `false` (no prompt), or `"destructive"` (prompts only for deletes & shell commands).
- **`contextFile`**: Markdown file injected into AI system instructions (defaults to `CONTEXT.md`).

---

## 🧰 Available Tools

When connected, AI assistants can use these project-scoped tools:

- 📖 **Read & Explore**: `list_files`, `find_file`, `read_file`, `search_code` (fast ripgrep search)
- ✏️ **Edit & Write**: `write_file`, `edit_file`, `delete_file`
- 💻 **Execute**: `execute_command` (runs allowlisted dev binaries like `git`, `npm`, `node`, `pytest`, `cargo`, etc.)
- 🧠 **Context & Memory**: `get_project_context`, `record_memory`, `get_memory`, `finish`

---

## 🔗 Links & Resources

- **Full Documentation & Source**: [github.com/mahesh2-lab/CodeMCP](https://github.com/mahesh2-lab/CodeMCP)
- **Website**: [code-mcp.vercel.app](https://code-mcp.vercel.app/)
- **Model Context Protocol**: [modelcontextprotocol.io](https://modelcontextprotocol.io/)
- **License**: MIT
