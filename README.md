<p align="center">
  <a href="https://github.com/mahesh2-lab/CodeMCP" target="_blank" rel="noopener noreferrer">
    <img src="https://raw.githubusercontent.com/mahesh2-lab/CodeMCP/refs/heads/main/assets/banner.png" alt="CodeMCP — The Zero-Config Model Context Protocol Server" width="100%" style="border-radius: 10px; max-width: 960px;" />
  </a>
</p>

<div align="center">

# CodeMCP

**The Enterprise-Grade, Zero-Config Model Context Protocol (MCP) Server for Local Codebases**

[![npm version](https://img.shields.io/npm/v/@mahesh2-lab/codemcp?style=flat-square&color=black&labelColor=222)](https://www.npmjs.com/package/@mahesh2-lab/codemcp)
[![npm downloads](https://img.shields.io/npm/dm/@mahesh2-lab/codemcp?style=flat-square&color=blue&labelColor=222)](https://www.npmjs.com/package/@mahesh2-lab/codemcp)
[![Protocol](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-6366f1?style=flat-square&labelColor=222)](https://modelcontextprotocol.io)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-339933?style=flat-square&labelColor=222)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow?style=flat-square&labelColor=222)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square&labelColor=222)](https://github.com/mahesh2-lab/CodeMCP/pulls)

<p align="center">
  Connect any AI assistant — <b>Claude Desktop</b>, <b>Cursor IDE</b>, <b>Windsurf</b>, or <b>ChatGPT</b> — directly to your local codebase.<br>
  Built-in <b>interactive change approval</b>, <b>cross-assistant session memory</b>, <b>ripgrep search</b>, and <b>sandboxed security</b>.
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-why-codemcp">Why CodeMCP</a> •
  <a href="#-interactive-change-approval-human-in-the-loop">Change Approval</a> •
  <a href="#-cross-assistant-session-memory">Memory Engine</a> •
  <a href="#-client-integrations">Client Setup</a> •
  <a href="#-available-mcp-tools">Tools Reference</a> •
  <a href="#-security-architecture">Security</a>
</p>

</div>

---

## ⚡ Overview

**CodeMCP** is a developer-first Model Context Protocol (MCP) server that empowers LLM coding assistants to navigate, understand, and safely modify your local projects without the friction of copying and pasting code.

Traditional MCP setups require complicated STDIO pipelines, manual JSON plumbing, and lack safety guardrails. **CodeMCP runs as a self-contained, interactive CLI service** with an automated public HTTPS tunnel, real-time column-aligned telemetry, native desktop alerts, and human-in-the-loop diff approval before any write or delete touches your disk.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          AI Clients & Agents                                │
│       Claude Desktop  •  Cursor IDE  •  Windsurf  •  ChatGPT / Web          │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ StreamableHTTP / JSON-RPC
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CodeMCP Engine                                   │
│  [Auth Guard] • [Path Sandboxing] • [LCS Diff Review] • [Session Memory]   │
└──────────────────┬──────────────────────────────────────┬───────────────────┘
                   │                                      │
                   ▼                                      ▼
       Local File Operations                  External AI Tunnel
       • Safe Read/Write/Delete               • Automated Ngrok Tunnel
       • Ripgrep Multi-Search                 • Zero Port-Forwarding
       • Terminal Command Sandbox             • AES-256 Encrypted Vault
```

---

## 💎 Why CodeMCP?

| Capability | Standard File Tools | CodeMCP |
|---|:---:|:---:|
| **Zero Configuration** | ❌ Manual JSON config required | ✅ Instant `npx @mahesh2-lab/codemcp` |
| **Human-in-the-Loop Review** | ❌ Blind writes directly to disk | ✅ **Enclosed visual diff box with [y/n/d] prompts** |
| **Cross-Assistant Memory** | ❌ Context lost between models | ✅ **Persistent `.codemcp/memory.json` knowledge store** |
| **Remote Web Agent Access** | ❌ Requires router port-forwarding | ✅ **Automatic HTTPS reverse tunnel via Ngrok** |
| **Desktop Notifications** | ❌ Must stare at terminal | ✅ **Native OS toast alerts on Windows, macOS & Linux** |
| **High-Speed Code Search** | ⚠️ Slow JavaScript file walks | ✅ **Native ripgrep binary speed with fallback** |
| **Sandbox & Secret Guard** | ❌ Overwrites `.env` and `.git` | ✅ **Strict PathGuard blocking traversal & secret leaks** |

---

## 🌟 Core Capabilities

| Feature | Description |
|---|---|
| ⚡ **Zero Setup** | Launch instantly in any repository with `npx @mahesh2-lab/codemcp`. No complex configuration required. |
| ✋ **Interactive Change Review** | Beautiful terminal diff box previews proposed additions and deletions before anything writes to disk. |
| 🧠 **Cross-Assistant Memory** | Maintains a persistent `.codemcp/memory.json` knowledge store across Claude, Cursor, and ChatGPT sessions. |
| 🔔 **Desktop Notifications** | Rich Toast notifications on Windows, macOS, and Linux alert you when files are edited or approval is needed. |
| 🌐 **Automated Public Tunnel** | Built-in HTTPS reverse tunneling via `@ngrok/ngrok` so web-based agents can connect to your local repo. |
| 🛡️ **Sandbox Hardening** | PathGuard blocks path traversal (`../../`), protects secret files (`.env*`, `.git`, SSH keys), and prevents dangerous commands. |
| 📋 **Project Rules Injection** | Automatically feeds your conventions (`CONTEXT.md`) and tech stack directly into the model's instructions. |
| 📊 **Real-time Telemetry** | Column-aligned console output with request tracking (`req_XXXX`) and sub-millisecond execution timings. |

---

## 🚀 Quick Start

### Option A: Direct Run (Recommended)

Navigate into any codebase and run:

```bash
npx @mahesh2-lab/codemcp
```

### Option B: Global Installation

```bash
npm install -g @mahesh2-lab/codemcp
codemcp
```

### Startup Dashboard:

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

## ✋ Interactive Change Approval (Human-in-the-Loop)

Never worry about an AI model unexpectedly overwriting your work. When change approval is enabled, CodeMCP pauses execution and renders a focused terminal diff preview:

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

### Keypress Review Controls
* **`y`** (or **Enter**): Confirms and applies the change to disk immediately.
* **`n`** (or **Esc**): Rejects the modification. File is untouched and the agent receives the rejection.
* **`d`**: Expands and prints the complete, untruncated diff with full file context.
* **`q`**: Cancels and aborts the operation.

### Configuring Approval Mode:
* **Launch Flag**:
  ```bash
  codemcp --approval          # or codemcp -a
  codemcp --no-approval       # bypass prompts (auto-apply)
  ```
* **Persistent Setting**:
  ```bash
  codemcp approval on         # permanently enables approval in codemcp.json
  codemcp approval off        # permanently disables approval in codemcp.json
  ```
* **Destructive-Only**: Set `"approval": "destructive"` in `codemcp.json` to only prompt for file deletions and command executions.

---

## 🧠 Cross-Assistant Session Memory

When working across multiple AI clients (e.g. brainstorming in Claude Desktop, coding in Cursor IDE, and generating unit tests via ChatGPT), context is traditionally lost.

CodeMCP introduces **Cross-Assistant Memory** (`.codemcp/memory.json`):

```json
{
  "version": 1,
  "projectId": "my-app",
  "projectName": "My Application",
  "lastHandoff": {
    "summary": "Completed authentication middleware and unit test suite",
    "decisions": "Selected JWT with 15m access token and rotating refresh token in HTTP-only cookies",
    "nextSteps": "Implement rate-limiting on /auth/login and integrate Redis blacklist",
    "client": "Claude Desktop",
    "updatedAt": "2026-09-14T15:30:00.000Z"
  },
  "recentActions": [
    {
      "timestamp": "2026-09-14T15:28:10.000Z",
      "action": "WRITE",
      "target": "src/middleware/auth.js",
      "client": "Claude Desktop",
      "details": "Created 1840 bytes",
      "summary": "Implemented Bearer token validation"
    }
  ]
}
```

### How It Works:
1. **Automatic Memory Injection**: Whenever any AI client establishes a session, recent memory and the last 15 file actions are prepended to the system instructions.
2. **`record_memory` Tool**: The assistant records key architectural decisions, ongoing tasks, and notes for succeeding models.
3. **`get_memory` Tool**: Models can retrieve full past context without re-scanning files.

---

## 🔔 Native Desktop Notifications

Stay informed during long-running agent workflows without staring at the terminal:

* **Windows**: Native WinRT Toast notifications with CodeMCP branding and icon.
* **macOS**: Native Notification Center alerts via AppleScript.
* **Linux**: Freedesktop alerts via `notify-send`.

### Automatic Alerts:
* ⚠️ Change approval required in terminal.
* 📝 File written or modified.
* 🗑️ File deleted from project.
* 🛑 Forbidden path traversal or dangerous command blocked.

*(To disable notifications, launch with `--no-notify` or set `NOTIFY=false`)*.

---

## 📊 Real-Time Telemetry & Log Auditing

CodeMCP formats all activities into an aligned, column-oriented stream with microsecond request tracing:

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

## 🔌 Client Integrations

### 1. Cursor / VS Code / Windsurf
In your IDE settings -> **Features** -> **MCP**:
* **Transport**: `HTTP` or `SSE`
* **URL**: `http://localhost:4173/mcp` (or your Global Tunnel URL)

### 2. Claude Desktop
Add CodeMCP to your configuration:
* **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
* **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

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

### 3. Remote AI Agents (ChatGPT / Claude Web / Anthropic Console)
1. Start CodeMCP (public tunnel enables automatically).
2. Copy the **Global URL** (e.g. `https://<domain>.ngrok-free.app/mcp`).
3. In your web AI platform, choose **Custom Connectors / MCP** and paste the URL.

---

## 🧰 Available MCP Tools

| Tool | Parameters | Description |
|---|---|---|
| `list_files` | `path`, `maxFiles` | Explores project directories respecting `.gitignore` and `.mcpignore`. |
| `read_file` | `path` | Reads text file content safely up to 10 MB. |
| `search_code` | `query`, `path`, `isRegex`, `caseSensitive` | High-speed code search powered by native ripgrep with fallback. |
| `write_file` | `path`, `content`, `summary` | Creates or modifies project files (triggers interactive review if enabled). |
| `delete_file` | `path`, `summary` | Safely removes project files (triggers interactive review if enabled). |
| `execute_command` | `command`, `timeoutMs` | Runs project build/test commands within an isolated sandbox. |
| `record_memory` | `summary`, `decisions`, `nextSteps` | Saves architectural context, milestones, and handoffs in `.codemcp/memory.json`. |
| `get_memory` | *(none)* | Retrieves cross-assistant session memory and recent file activity history. |
| `get_project_context` | *(none)* | Loads project metadata, instructions, and `CONTEXT.md` guidelines. |

---

## 🛠️ CLI Commands Reference

```bash
# Start server in current folder
codemcp

# Start server for a specific project directory
codemcp ./path/to/project

# Enable or disable change approval
codemcp --approval
codemcp approval on
codemcp approval off

# Disable public tunnel (run locally only)
codemcp --no-tunnel

# Disable desktop notifications
codemcp --no-notify

# Manage encrypted credentials vault
codemcp credentials status
codemcp credentials set NGROK_API_KEY <token>
codemcp credentials delete NGROK_API_KEY
codemcp credentials clear

# Project metadata inspector & wizard
codemcp info
codemcp init
```

---

## 🔒 Security Architecture

* **Path Traversal Containment**: PathGuard verifies and canonicalizes every requested file path, strictly blocking traversal attacks (`../../`) and absolute system paths (`/etc`, `C:\Windows`).
* **Sensitive File Protection**: Files matching `.env*`, `.git`, `node_modules`, `~/.codemcp/credentials.enc`, and SSH keys (`id_rsa`) are write-protected and hidden from tools.
* **Command Sandboxing**: The terminal execution tool blocks destructive commands (e.g. `rm -rf /`, `del /s /q`, `format`, `sudo`, `curl | bash`) and sanitizes process environment variables to prevent secret leakage.
* **Machine-Bound Credential Vault**: Ngrok API tokens and keys are encrypted with **AES-256-GCM** using keys derived from local host machine fingerprints (`~/.codemcp/credentials.enc`).
* **Bearer Token Authentication**: Enforce bearer token authorization on all endpoints by setting `API_KEY="your-secret"`.

---

## ⚙️ Configuration (`codemcp.json`)

```json
{
  "id": "my-app",
  "name": "My Application",
  "description": "Full-stack web application",
  "permission": "both",
  "approval": true,
  "contextFile": "CONTEXT.md",
  "techStack": ["Node.js", "React", "TypeScript"]
}
```

---

## 📄 License

[MIT](LICENSE) © [CodeMCP Contributors](https://github.com/mahesh2-lab/CodeMCP)
