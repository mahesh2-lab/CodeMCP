# CodeMCP

> **The Modern CLI for Project-Scoped AI Context & Tools**

[![License: MIT](https://img.shields.io/badge/license-MIT-yellow?style=flat-square&labelColor=222)](LICENSE)
[![Node Version](https://img.shields.io/badge/node-%3E%3D20.0.0-green?style=flat-square&labelColor=222)](https://nodejs.org/)
[![Documentation](https://img.shields.io/badge/docs-codemcp.heymahesh.in%2Fdocs-6366f1?style=flat-square&labelColor=222)](https://codemcp.heymahesh.in/docs)

CodeMCP is a developer CLI tool that exposes your local codebase to AI assistants with zero manual configuration. It manages project indexing, safe file operations with interactive terminal approvals, background daemon processes, secure local tunneling, and encrypted machine-level credential storage.

📖 **For full documentation and client connection guides, visit:**  
**[https://codemcp.heymahesh.in/docs](https://codemcp.heymahesh.in/docs)**

---

## Installation

Run instantly without installation:
```bash
npx @mahesh2-lab/codemcp
```

Or install globally:
```bash
npm install -g @mahesh2-lab/codemcp
# or
pnpm add -g @mahesh2-lab/codemcp
```

---

## Quick Usage

```bash
# Serve current folder in foreground
codemcp

# Run in background (detached daemon mode, like docker run -d)
codemcp -d

# Inspect active session, URLs, and owner password
codemcp info -s

# View output logs of background daemon
codemcp logs

# Stop the running background daemon
codemcp stop
```

---

## CLI Commands

| Command | Description |
| :--- | :--- |
| `codemcp [path]` | Start the server for current directory or `[path]` (default) |
| `codemcp start [path]` | Explicitly start server with custom flags |
| `codemcp stop [path]` | Terminate the active background daemon |
| `codemcp logs [path]` | View recent output logs from background server |
| `codemcp info [path]` | Display indexed files, project metadata, and session status |
| `codemcp approval [on\|off]` | View or permanently toggle interactive change approvals |
| `codemcp credentials <action>` | Manage encrypted machine vault tokens (`status`, `set`, `del`, `clear`) |
| `codemcp init [path]` | Interactive setup to create `codemcp.json` and `CONTEXT.md` |

---

## Command Reference & Examples

### 1. Starting the Server

```bash
# Start current directory with default settings (port 4173 + HTTPS tunnel)
codemcp

# Target a specific project path
codemcp ./my-project

# Run locally without public ngrok tunnel (localhost only)
codemcp --no-tunnel

# Specify a custom listening port
codemcp -p 5000

# Require terminal confirmation before any files are modified
codemcp -a
# or use aliases
codemcp --ask
codemcp -c
```

### 2. Detached Mode (Background Daemon)

Run CodeMCP as a background service without keeping a terminal tab open:

```bash
# Launch server in background
codemcp -d

# Tail background server logs (defaults to 50 lines)
codemcp logs

# Tail specific number of log lines
codemcp logs -n 100

# Stop the background process cleanly
codemcp stop
```

### 3. Session & Project Inspection (`info`)

```bash
# View project metadata, configuration file, and indexed source files
codemcp info

# View active session, local/global URLs, daemon status, and owner password
codemcp info -s
# or
codemcp info session

# Output only the raw owner authentication password (useful for scripting)
codemcp info -p

# Display both project overview and session information
codemcp info -a
```

### 4. Interactive Change Approvals (`approval`)

Enforce human-in-the-loop confirmation before files are written or commands are executed:

```bash
# Check current approval status in codemcp.json
codemcp approval

# Enable interactive terminal diff review before file modifications
codemcp approval on

# Disable approval prompts and auto-apply modifications
codemcp approval off
```

### 5. Encrypted Credential Vault (`credentials`)

Store sensitive API tokens (such as `NGROK_AUTHTOKEN`, `NGROK_API_KEY`, or custom keys) in a machine-bound encrypted vault outside your git repositories (`~/.codemcp/credentials.enc`):

```bash
# Check stored credentials with values masked
codemcp credentials status

# Save an API token to the secure vault
codemcp credentials set NGROK_AUTHTOKEN <your-token>
codemcp credentials set NGROK_API_KEY <your-api-key>

# Delete a credential from the vault
codemcp credentials del NGROK_AUTHTOKEN

# Clear all stored credentials
codemcp credentials clear
```

---

## CLI Options & Flags

| Flag | Short | Description |
| :--- | :--- | :--- |
| `--detach` | `-d` | Run server in background daemon mode |
| `--session` | `-s` | Show session URLs, daemon status, and password (with `info`) |
| `--password` | `-p` | Print owner authentication password directly (with `info`) |
| `--all` | `-a` | Show both project overview and session info (with `info`) |
| `--port <number>` | `-p` | Set local HTTP port (default: `4173`) |
| `--no-tunnel` | | Disable public HTTPS ngrok tunnel (localhost only) |
| `--no-notify` | | Disable desktop OS notifications |
| `--approval [mode]`| `-a` | Require confirmation before applying edits (`true`, `false`, `destructive`) |
| `--ask` | | Alias for `--approval` |
| `--confirm` | `-c` | Alias for `--approval` |
| `--no-approval` | | Disable confirmation prompts and auto-apply edits |
| `--lines <count>` | `-n` | Number of log lines to output (with `logs`, default: `50`) |
| `--yes` | `-y` | Skip interactive prompts during `init` |
| `--version` | `-V` | Output version number |
| `--help` | `-h` | Display terminal help screen |

---

## Documentation

For AI client configuration guides (Claude Desktop, Cursor, Windsurf, Claude Code, Cline), protocol details, architecture, and security practices, refer to the official documentation:

👉 **[https://codemcp.heymahesh.in/docs](https://codemcp.heymahesh.in/docs)**

---

## License

[MIT](LICENSE) © [Mahesh](https://github.com/mahesh2-lab)
