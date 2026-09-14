# CodeMCP ⚡

[![npm version](https://img.shields.io/npm/v/@mahesh2-lab/codemcp.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@mahesh2-lab/codemcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg?style=flat-square)](https://nodejs.org/)
[![Protocol: MCP](https://img.shields.io/badge/protocol-Model%20Context%20Protocol-6366f1.svg?style=flat-square)](https://modelcontextprotocol.io)

**Connect your local codebase to any AI assistant in seconds.**

CodeMCP is a zero-setup **Model Context Protocol (MCP)** server. It gives AI tools (Claude, Cursor, VS Code, Windsurf, web agents) safe access to inspect files, search code, execute commands, remember architectural context across sessions, and make edits in your project—without manual copy-pasting.

---

## ✨ Highlights

* ⚡ **Zero Setup**: Run `npx @mahesh2-lab/codemcp` in any project folder and start immediately.
* ✋ **Review Changes (Accept / Reject)**: Interactive terminal review box with colorized line diffs before any AI edits touch your disk.
* 🧠 **Cross-Assistant Session Memory**: Automatically tracks decisions, file activity, and handoff notes in `.codemcp/memory.json` across Claude, Cursor, and ChatGPT.
* 🔔 **Desktop Notifications**: System Toast notifications on Windows, macOS, and Linux whenever files are created, updated, or awaiting review.
* 🌐 **Instant Public URL**: Built-in automated HTTPS tunnel via `@ngrok/ngrok` so web-based AI tools can connect to your local machine.
* 🛡️ **Sandbox Security**: Blocks path traversal (`../`), protects sensitive files (`.env*`, `.git`, SSH keys), and prevents dangerous bash commands.
* 📋 **Project Guidelines (`CONTEXT.md`)**: Automatically injects your architecture rules and coding standards directly into the AI's prompt.
* 🎚️ **Permission Tiers**: Choose `read-only`, `write-only`, or full `read & write` access.
* 📊 **Aligned Telemetry Logs**: Clean column-aligned request logs (`req_XXXX`) with client detection and timing.

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

When started, CodeMCP prints your project details and endpoints:

```text
┌─  CodeMCP Project Agent (MCP)  ────────────────────────────────┐
│                                                                │
│  Project    : my-app (my-app)                                  │
│  Root       : /Users/you/projects/my-app                       │
│  Config     : codemcp.json                                     │
│  Permission : Read & Write                                     │
│  Approval   : Enabled (Ask before changes)                     │
│  Context    : CONTEXT.md                                       │
│  Local URL  : http://localhost:4173/mcp                        │
│  Global URL : https://your-tunnel.ngrok-free.app/mcp           │
│                                                                │
└────────────────────────────────────────────────────────────────┘
  Waiting for AI client requests... (tool activity appears below)
```

---

## ✋ Accept & Reject Changes (Interactive Review)

Never let an AI assistant overwrite files without your permission. When approval mode is active, CodeMCP pauses the AI and presents a clean, enclosed diff preview in your terminal:

```text
15:09:21 req_8043 ⚠ WRITE    index.html

 ┌─ ⚠ AI CHANGE APPROVAL REQUIRED ────────────────────────────────────┐
 │ WRITE FILE                                                          │
 │ index.html                                                          │
 │ Modified · +12 -2 lines                                             │
 │                                                                     │
 │  ...                                                                │
 │    </head>                                                          │
 │    <body>                                                           │
 │  - <header class="container"><nav><a class="logo" href="#">Code...  │
 │  + <header class="container"><nav><a class="logo" href="#">Code...  │
 │    <main>                                                           │
 │  - <section class="hero" style="border-top:0"><div class="eyebro... │
 │  + <section class="hero" style="border-top:0"><div class="eyebro... │
 │  + <div class="stats"><div class="stat"><span class="stat-num">...  │
 │  + </div></section>                                                 │
 │    <section id="features"><div class="container"><div class="...    │
 │    <section id="how" class="code-section"><div class="container...  │
 │  ...                                                                │
 │    → delete_file                                                    │
 │  ... 19 more lines                                                  │
 └─────────────────────────────────────────────────────────────────────┘

• Claude-User · Read & Write · Approval ON · Requests 4
────────────────────────────────────────────────────
Apply changes? [y] Accept  [n] Reject  [d] Full diff  [q] Quit: y

✓ Change accepted
  index.html · 7.2 KB written

15:09:43 req_8043 ✓ WRITE    index.html · 7.2 KB written
```

### Instant Controls (Raw Keypress)
* **`y`** (or **Enter**): Accepts and writes the change immediately.
* **`n`** (or **Esc**): Rejects the change. The file remains untouched and the AI is informed of the rejection.
* **`d`**: Expands and prints the full, untruncated diff with complete context.
* **`q`**: Aborts and rejects the request.

### Enabling or Disabling Change Approval:
* **CLI flags** on launch:
  ```bash
  codemcp --approval       # or codemcp -a
  codemcp --no-approval    # bypass prompts (auto-apply)
  ```
* **Persistent setting** in your project:
  ```bash
  codemcp approval on      # Sets approval: true in codemcp.json
  codemcp approval off     # Sets approval: false in codemcp.json
  ```
* **Destructive-only mode**:
  In `codemcp.json`, set `"approval": "destructive"` to only require confirmation on file deletions and terminal command executions.

---

## 🧠 Cross-Assistant Session Memory

CodeMCP maintains a persistent, project-scoped memory journal in `.codemcp/memory.json`. When switching between different AI assistants (e.g., from Claude Desktop to Cursor to ChatGPT), context is preserved automatically.

### What Memory Tracks:
1. **Architectural Decisions**: Key patterns and libraries chosen by previous assistants.
2. **Project Summaries**: High-level notes on ongoing refactors and milestones.
3. **Pending Next Steps**: Checklists of pending items left by the prior agent.
4. **Recent Activity Journal**: A rolling record of the last 15 file modifications and executions.

### Memory Handshake:
Every time an AI client connects, CodeMCP automatically injects recent memory directly into the system prompt:
```text
--- Cross-Assistant Session Memory ---
[Project Session Notes: CodeMCP (Claude Desktop - 9/14/2026, 3:15 PM)]
• Summary: Added approval review diff box and status bar
• Architectural Decisions: Used AsyncLocalStorage for request ID tracing
• Pending Next Steps: Verify terminal keypress handlers
[Recent Workspace Activity]
  - [WRITE] src/utils/logger.js — Aligned column logging
  - [WRITE] src/services/approval.js — Box rendering & status footer
```

AI assistants can also explicitly call `record_memory` to leave handoff notes for succeeding models, or call `get_memory` to inspect the full project log.

---

## 🔔 Native Desktop Notifications

CodeMCP alerts you in real time via your operating system's native notification system:
* **Windows**: Rich Toast Notifications via WinRT PowerShell.
* **macOS**: Native Notification Center banners via AppleScript.
* **Linux**: Freedesktop notifications via `notify-send`.

Notifications trigger when:
* ⚠️ An AI change requires interactive approval in your terminal.
* 📝 A file is modified or created by the AI.
* 🗑️ A file is deleted from the workspace.
* 🛑 An unsafe action or path traversal attack is blocked.

*(To disable notifications, launch with `--no-notify` or set `NOTIFY=false`)*.

---

## 📊 Real-Time Telemetry & Aligned Logs

CodeMCP provides clean, column-aligned logs with microsecond request IDs (`req_XXXX`) to make concurrent agent activities easy to follow:

```text
15:05:31        ✓ CONNECT  Claude-User (ngrok tunnel)
15:05:32 req_0557 → READ     index.html · 4.0 KB
15:05:38 req_6111 → READ     assets/style.css · 7.2 KB
15:08:57 req_6578 → READ     index.html · 4.0 KB
15:09:21 req_8043 ⚠ WRITE    index.html
15:09:43 req_8043 ✓ WRITE    index.html · 7.2 KB written
15:09:50 req_9120 → SEARCH   "calculator" · 2 matches in 1 file
15:10:05 req_1042 ✓ EXEC     npm test · exit 0 (140ms)
```

---

## 🔌 Connecting to Your AI Assistant

### 1. Cursor / VS Code / Windsurf
In your editor's MCP server configuration (e.g. `Settings` -> `MCP`):
* **Transport**: `HTTP` or `SSE`
* **URL**: `http://localhost:4173/mcp` (or your Global Ngrok URL)

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

### 3. Web AI & Remote Connectors (ChatGPT / Claude Web / Anthropic Console)
1. Copy the **Global URL** printed in your terminal (e.g., `https://<domain>.ngrok-free.app/mcp`).
2. In your web AI platform, navigate to **Connectors / MCP Integrations** -> **Add Custom Connector**.
3. Paste the URL. (Authentication: None or Bearer Token if configured).

---

## 🔐 Encrypted Credential Vault & Auth

CodeMCP eliminates plain-text tokens by storing sensitive credentials in an encrypted, machine-bound vault at `~/.codemcp/credentials.enc` using **AES-256-GCM**:

```bash
# View stored credentials (masked)
codemcp credentials status

# Store or update a token in the vault
codemcp credentials set NGROK_API_KEY <your-api-key>

# Delete a specific key
codemcp credentials delete NGROK_API_KEY

# Clear the vault entirely
codemcp credentials clear
```

### Enforcing API Key Authentication
To secure your MCP server with a Bearer token:
```bash
# Pass via environment variable
export API_KEY="your-secret-token"
codemcp
```
When set, all `/mcp` endpoints require the header `Authorization: Bearer your-secret-token`.

---

## ⚙️ Configuration (`codemcp.json`)

You can customize project settings with a `codemcp.json` file in your project root:

```json
{
  "id": "my-app",
  "name": "My Application",
  "description": "Full-stack Node.js web application",
  "permission": "both",
  "approval": true,
  "contextFile": "CONTEXT.md"
}
```

| Field | Options | Description |
| :--- | :--- | :--- |
| `permission` | `"both"` (default), `"read"`, `"write"` | Controls whether AI can read, write, or both. |
| `approval` | `true`, `false`, `"destructive"` | Require confirmation before applying file modifications. |
| `contextFile` | `"CONTEXT.md"` | Path to your coding conventions file. |
| `techStack` | `["Node.js", "React", "Tailwind"]` | Tech stack tags provided to the AI. |

---

## 🧠 Teaching the AI Your Rules (`CONTEXT.md`)

Create a `CONTEXT.md` in your project root. CodeMCP loads these guidelines and presents them to the AI model on connection:

```markdown
# Coding Standards & Architecture
- Architecture: Feature-sliced modular architecture under `src/modules/`
- Formatting: 2 spaces, double quotes, semicolons required
- State Management: Use Zustand stores in `src/store/`
- Testing: Write Vitest unit tests in `__tests__/` alongside source files
```

---

## 🧰 Available Tools for AI

| Tool Name | Parameters | Description |
| :--- | :--- | :--- |
| `list_files` | `path`, `maxFiles` | Explores the project folder tree respecting `.gitignore` and `.mcpignore`. |
| `read_file` | `path` | Reads text file contents safely up to 10 MB. |
| `search_code` | `query`, `path`, `isRegex`, `caseSensitive` | Fast multi-file search powered by embedded native ripgrep with JS fallback. |
| `write_file` | `path`, `content`, `summary` | Creates or updates files inside the project (prompts for Approval if enabled). |
| `delete_file` | `path`, `summary` | Deletes a project file (prompts for Approval if enabled). |
| `execute_command` | `command`, `timeout` | Runs project terminal commands in an isolated environment with security blacklists. |
| `record_memory` | `summary`, `decisions`, `nextSteps` | Saves architectural decisions, session summaries, and handoff checklists for other AI assistants. |
| `get_memory` | *(none)* | Retrieves cross-assistant session memory, architecture notes, and recent file activity. |
| `get_project_context` | *(none)* | Returns project metadata, instructions, and loaded `CONTEXT.md` guidelines. |

---

## 🛠️ CLI Commands Reference

| Command | Options | What it does |
| :--- | :--- | :--- |
| `codemcp [path]` | `-p, --port <port>`<br>`-a, --approval [mode]`<br>`--no-approval`<br>`--no-tunnel`<br>`--no-notify`<br>`-y, --yes` | Starts the server for the specified folder (defaults to current directory). |
| `codemcp init [path]` | `-y, --yes` | Interactive setup wizard creating `codemcp.json`, `.mcpignore`, and `CONTEXT.md`. |
| `codemcp info [path]` | *(none)* | Displays project metadata, permissions, active context file, and indexed file count. |
| `codemcp approval [on\|off]` | *(none)* | Views or toggles change approval directly in `codemcp.json`. |
| `codemcp credentials` | `status`, `set <k> <v>`, `delete <k>`, `clear` | Manages machine-bound encrypted credentials in `~/.codemcp/credentials.enc`. |

---

## 🔒 Security Architecture

* **Path Traversal Containment**: PathGuard resolves and canonicalizes paths, blocking traversal (`../../`) and system directories (`/etc`, `C:\Windows`).
* **Protected Blacklists**: Files matching `.env*`, `.git`, `node_modules`, `~/.codemcp/credentials.enc`, and SSH keys are hidden and write-protected.
* **Execution Guardrails**: The terminal execution tool blocks destructive commands (e.g. `rm -rf /`, `del /f /s`, `format`, `sudo`, `curl | bash`) and limits runtime to 30 seconds.
* **Encrypted Vault**: Credentials and tunnel tokens are encrypted with AES-256-GCM using hardware-derived keys.

---

## License

[MIT](LICENSE) © [CodeMCP Contributors](https://github.com/mahesh2-lab/CodeMCP)
