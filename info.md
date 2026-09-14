# CodeMCP — Complete Technical Specification & System Architecture Manual

> **Package**: `@mahesh2-lab/codemcp`  
> **Current Version**: `1.1.2`  
> **License**: MIT  
> **Module System**: ECMAScript Modules (`"type": "module"`)  
> **Runtime Requirement**: Node.js `>=18.0.0`  
> **Primary Binaries**: `codemcp`, `coduit`, `devnet-mcp`  
> **Artifacts**: `dist/server.js`, `dist/cli.js`  

---

## Table of Contents

1. [Executive Overview & Purpose](#1-executive-overview--purpose)
2. [High-Level Architecture & Communication Flow](#2-high-level-architecture--communication-flow)
3. [Package Structure & File Manifest](#3-package-structure--file-manifest)
4. [CLI Engine & Command Specifications](#4-cli-engine--command-specifications)
5. [Server Lifecycle, HTTP & Session Management](#5-server-lifecycle-http--session-management)
6. [Tunneling Subsystem (@ngrok/ngrok Automation)](#6-tunneling-subsystem-ngrokngrok-automation)
7. [Cryptographic Credential Vault (~/.codemcp/credentials.enc)](#7-cryptographic-credential-vault-codemcpcredentialsenc)
8. [Project Discovery & Configuration System](#8-project-discovery--configuration-system)
9. [PathGuard & File Sandboxing Subsystem](#9-pathguard--file-sandboxing-subsystem)
10. [Exhaustive MCP Tools Reference](#10-exhaustive-mcp-tools-reference)
    - [10.1 get_project_context](#101-get_project_context)
    - [10.2 list_files](#102-list_files)
    - [10.3 read_file](#103-read_file)
    - [10.4 search_code](#104-search_code)
    - [10.5 write_file](#105-write_file)
    - [10.6 delete_file](#106-delete_file)
    - [10.7 execute_command & Security Sandbox](#107-execute_command--security-sandbox)
    - [10.8 record_memory](#108-record_memory)
    - [10.9 get_memory](#109-get_memory)
    - [10.10 Cross-Assistant Session Memory Architecture](#1010-cross-assistant-session-memory-architecture)
    - [10.11 Native OS Desktop Notifications Subsystem](#1011-native-os-desktop-notifications-subsystem)
11. [Client Identification & Request Telemetry](#11-client-identification--request-telemetry)
12. [Structured Logging & Terminal UI Rendering](#12-structured-logging--terminal-ui-rendering)
13. [Build, Bundling & Obfuscation Pipeline](#13-build-bundling--obfuscation-pipeline)
14. [Test Suite & Integration Verification Client](#14-test-suite--integration-verification-client)
15. [Comprehensive Environment Variables Reference](#15-comprehensive-environment-variables-reference)
16. [Client Integration Guides (Claude, Cursor, Generic MCP)](#16-client-integration-guides-claude-cursor-generic-mcp)

---

## 1. Executive Overview & Purpose

**CodeMCP** is a zero-configuration, production-grade Model Context Protocol (MCP) server designed to connect local code repositories directly to AI assistants, LLM agents, and developer IDEs (such as Claude Desktop, Cursor, Windsurf, Anthropic API clients, and custom MCP clients).

### Core Problems Solved:
1. **Manual Copy-Pasting Elimination**: AI models can dynamically traverse, search, inspect, and update code directly on your filesystem.
2. **Instant Remote Access**: Built-in automated ngrok tunneling provisions a public, secure HTTPS endpoint on startup without requiring manual port forwarding or reverse proxy setup.
3. **Machine-Bound Credential Protection**: Eliminates plain-text `.env` tokens by using a local AES-256-GCM encrypted vault tied to the host's hardware and user profile fingerprint.
4. **Strict Sandbox Containment**: PathGuard prevents directory escape attacks (`../../`), blocks access to sensitive system directories (`/etc`, `C:\Windows`), and filters repository internals (`.git`, `node_modules`, `.env`).
5. **Execution Guardrails**: The terminal execution tool enforces strict project folder scoping, environment secret stripping, and blocks destructive commands (e.g. `rm -rf /`, `del /f /s`, `format`, `sudo`, `curl | bash`).

---

## 2. High-Level Architecture & Communication Flow

```
+-------------------------------------------------------------------------------+
|                       AI Clients & MCP Consumers                              |
|   (Claude Desktop, Cursor, Windsurf, Custom Agents, Remote Web Connectors)    |
+-------------------------------------------------------------------------------+
                                      |
                         HTTP / StreamableHTTP (POST / GET)
                         Headers: Mcp-Session-Id, Authorization
                                      |
                                      v
+-------------------------------------------------------------------------------+
|                           Networking Layer                                    |
|   - Local Loopback: http://localhost:4173/mcp                                 |
|   - Public HTTPS Tunnel: https://<domain>.ngrok-free.app/mcp                  |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
|                       Express HTTP & Transport Routing                        |
|   - CORS Middleware (exposedHeaders: Mcp-Session-Id)                          |
|   - Health Route: GET /health                                                 |
|   - MCP Handler: POST /mcp, GET /mcp, DELETE /mcp                             |
|   - Client Profiler (IP, User-Agent, Origin, MCP ClientInfo)                   |
|   - Session Manager (StreamableHTTPServerTransport Map keyed by UUID)         |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
|                         Model Context Protocol Layer                          |
|   - McpServer (Version 1.0.0, Project instructions injection)                |
|   - Permission Filter: "both" | "read" | "write"                              |
+-------------------------------------------------------------------------------+
       |                   |                 |                 |          |
       v                   v                 v                 v          v
+-------------+    +---------------+   +------------+   +-----------+  +----------+
| Context Tool|    | File Inspect  |   | File Search|   | File Write|  | Execution|
| get_project_|    |  list_files   |   |search_code |   | write_file|  | execute_ |
|   context   |    |   read_file   |   | (regex &   |   |delete_file|  |  command |
|             |    |               |   |  literal)  |   |           |  | (Sandboxed|
+-------------+    +---------------+   +------------+   +-----------+  +----------+
       |                   |                 |                 |          |
       +-------------------+-----------------+-----------------+----------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
|                    Security & Sandboxing Subsystem                            |
|   - PathGuard: resolveSafe, assertExistsAndAllowed, isIgnored                 |
|   - Multi-segment ignore checking (.git, node_modules, .env, .mcpignore)      |
|   - Execution Guard: RESTRICTED_RULES, Project Scope Confinement, Env Scrub  |
|   - Cryptographic Vault: AES-256-GCM machine-fingerprinted encryption         |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
|                        Local Host Filesystem & OS                             |
+-------------------------------------------------------------------------------+
```

---

## 3. Package Structure & File Manifest

```
CodeMCP/
├── bin/
│   └── cli.js                     # CLI entrypoint; Commander.js command parser
├── dist/                          # Compiled & obfuscated distribution artifacts
│   ├── cli.js                     # Obfuscated executable CLI bundle (Node.js 18 ESM)
│   └── server.js                  # Obfuscated standalone server bundle
├── scripts/
│   ├── build.js                   # Esbuild & JavaScriptObfuscator compilation script
│   └── test-client.js             # Automated MCP client integration test runner
├── src/
│   ├── commands/
│   │   ├── info.js                # Implementation of `codemcp info`
│   │   └── init.js                # Interactive clack/prompts setup for codemcp.json
│   ├── middleware/
│   │   └── auth.js                # Optional Bearer token authorization middleware
│   ├── routes/
│   │   ├── health.js              # GET /health healthcheck route
│   │   ├── index.js               # Root Express router aggregator
│   │   └── mcp.js                 # POST, GET, DELETE /mcp StreamableHTTP endpoint
│   ├── services/
│   │   ├── approval.js            # Interactive terminal review, line diff preview & approval
│   │   ├── memory.js              # Cross-assistant session memory store & activity journal
│   │   └── projects.js            # Project configuration discovery & active context
│   ├── tools/
│   │   ├── context.js             # Scoped tool context & unified execution wrapper
│   │   ├── deleteFile.js          # MCP Tool: delete_file
│   │   ├── executeCommand.js      # MCP Tool: execute_command (Hardened sandbox)
│   │   ├── index.js               # Tool registry & permission filtering
│   │   ├── listFiles.js           # MCP Tool: list_files
│   │   ├── manageMemory.js        # MCP Tools: record_memory, get_memory
│   │   ├── projectContext.js      # MCP Tool: get_project_context
│   │   ├── readFile.js            # MCP Tool: read_file
│   │   ├── searchCode.js          # MCP Tool: search_code
│   │   └── writeFile.js           # MCP Tool: write_file
│   ├── tunnel/
│   │   └── ngrok.js               # @ngrok/ngrok forwarder, API provisioning, domains
│   ├── utils/
│   │   ├── box.js                 # Terminal UI box drawing with ANSI stripping & approval box
│   │   ├── clientInfo.js          # Client IP, User-Agent, Origin, and channel detector
│   │   ├── credentials.js         # Machine-fingerprint AES-256-GCM credential vault
│   │   ├── diff.js                # LCS line-diff algorithm, context radius & box formatter
│   │   ├── env.js                 # Env resolver (Process Env -> Vault -> Fallback)
│   │   ├── help.js                # Terminal help styling and command reference
│   │   ├── logger.js              # Aligned column logger with AsyncLocalStorage request IDs
│   │   ├── notify.js              # Native OS desktop Toast notification engine
│   │   ├── pathGuard.js           # Sandbox path resolution & ignore matching
│   │   └── ports.js               # Dynamic TCP port availability prober
│   └── server.js                  # Main server initialization & Express bootstrap
├── package.json                   # NPM manifest (v1.1.2, dependencies, scripts)
├── README.md                      # Public-facing user documentation
└── info.md                        # Exhaustive architectural specification (this file)
```

---

## 4. CLI Engine & Command Specifications

The CLI is implemented using `commander` (version `^15.0.0`) in `bin/cli.js`.

### Binary Names
Configured in `package.json` under the `"bin"` field:
- `codemcp` (Standard command)
- `coduit` (Legacy alias)
- `devnet-mcp` (Legacy alias)

### Implicit Default Command Dispatch
If invoked with no arguments, or if the first argument is a path (not matching an explicit command name like `start`, `init`, `info`, `approval`, `credentials`, `help`), `bin/cli.js` automatically injects the `"start"` command into `process.argv`:
```javascript
const explicitCommands = new Set(["start", "init", "info", "credentials", "approval", "approve", "help"]);
const helpOrVersion = new Set(["--help", "-h", "--version", "-v", "help"]);
const firstArg = process.argv[2];

if (!firstArg || (!explicitCommands.has(firstArg) && !helpOrVersion.has(firstArg))) {
  process.argv.splice(2, 0, "start");
}
```
*Result*: Running `codemcp` or `codemcp /path/to/repo` immediately starts the server without requiring `codemcp start`.

---

### Command Matrix

| Command | Arguments | Options | Description |
|---|---|---|---|
| `start` | `[path]` | `-p, --port <number>` (default: `4173`)<br>`-a, --approval [mode]`<br>`-c, --confirm`<br>`--ask`<br>`--no-approval`<br>`--no-confirm`<br>`--no-tunnel`<br>`--no-notify`<br>`-y, --yes` | Starts the MCP HTTP server and optional ngrok tunnel for the specified directory. Defaults to `process.cwd()`. |
| `init` | `[path]` | `-y, --yes` | Interactive wizard creating `codemcp.json`, `.mcpignore`, and `CONTEXT.md`. `-y` skips prompts using detected defaults. |
| `info` | `[path]` | *(none)* | Displays project metadata, permissions, active context file, and total indexed source file count in a styled box. |
| `approval` / `approve` | `[on\|off]` | *(none)* | Views or toggles interactive change approval in `codemcp.json` (`approval on` sets `true`, `approval off` sets `false`). |
| `credentials` / `credentials status` | *(none)* | *(none)* | Displays all encrypted keys stored in `~/.codemcp/credentials.enc` with masked values (e.g. `NGRO...abcd`). |
| `credentials set` | `<key> <value>` | *(none)* | Encrypts and saves or updates a key-value pair in `~/.codemcp/credentials.enc`. |
| `credentials delete` | `<key>` | *(none)* | Deletes a stored key from the encrypted vault. |
| `credentials clear` | *(none)* | *(none)* | Purges all credentials from the vault, resetting it to an empty encrypted container. |

---

## 5. Server Lifecycle, HTTP & Session Management

The server layer (`src/server.js` and `src/routes/mcp.js`) is built on **Express 4.21** and `@modelcontextprotocol/sdk` (version `^1.30.0`).

### 1. Dynamic Port Probing
- Default configured port is `4173`.
- `findAvailablePort(requestedPort, 50)` probes up to 50 sequential TCP ports using native `node:net` servers.
- If port `4173` is busy, the server automatically shifts to `4174`, `4175`, etc., and logs a warning.

### 2. CORS Policy
Configured with open access for remote AI connectors:
- `origin: "*"`
- `exposedHeaders: ["Mcp-Session-Id"]`
- `allowedHeaders: ["Content-Type", "mcp-session-id", "Authorization"]`

### 3. StreamableHTTP Session Management
- Sessions are maintained in an in-memory `Map<string, Session>` where the key is a UUID v4 string.
- When an AI client sends a `POST /mcp` handshake without a session header:
  1. A new `McpServer` instance is created with project instructions.
  2. Tools are registered based on project permissions.
  3. `StreamableHTTPServerTransport` is instantiated with `sessionIdGenerator: () => randomUUID()`.
  4. On connection, the session is saved to `sessions.set(sessionId, { server, transport, project, client })`.
  5. Subsequent calls pass `Mcp-Session-Id: <uuid>`, which routes directly to `session.transport.handleRequest`.
  6. When the transport closes (`transport.onclose`), the session is evicted from the Map.

### 4. Endpoints

#### `POST /mcp`
- Handles MCP JSON-RPC protocol requests (initialize, tools/list, tools/call).

#### `GET /mcp`
- If passed with an active `Mcp-Session-Id`, handles SSE/HTTP stream.
- If called via a browser or HTTP client without a session ID, returns a JSON status dashboard:
```json
{
  "status": "online",
  "project": "MyProject",
  "endpoint": "/mcp",
  "transport": "StreamableHTTP",
  "detectedClient": {
    "client": "Claude Desktop",
    "type": "AI Client",
    "ip": "127.0.0.1",
    "location": "localhost",
    "channel": "local network",
    "origin": "(none)",
    "userAgent": "Claude/0.8.0"
  },
  "message": "MCP server is ready. Send POST with JSON-RPC initialize payload to start session."
}
```

#### `DELETE /mcp`
- Closes and deallocates an active session transport.

#### `GET /health`
- Lightweight liveness check:
```json
{
  "status": "ok",
  "projectRoot": "C:\\Users\\azure\\Documents\\projects\\CodeMCP"
}
```

### 5. Graceful Shutdown
Listens for `SIGINT` and `SIGTERM`:
1. Logs shutdown event.
2. Closes the ngrok tunnel listener.
3. Stops the Express HTTP listener.
4. Includes a 3-second safety unref timeout (`setTimeout`) to prevent hanging processes.

---

## 6. Tunneling Subsystem (@ngrok/ngrok Automation)

Located in `src/tunnel/ngrok.js`. Provides end-to-end automation for establishing a secure public HTTPS endpoint for remote clients.

### Automated Provisioning Lifecycle:

```
[Server Starts]
       |
       v
Check NGROK_ENABLED !== "false"
       |
       v
1. ensureApiKey()
   ├── Found in Env or Vault? ────> Proceed
   └── Missing?
       ├── Open https://dashboard.ngrok.com/api-keys in default browser
       ├── Prompt user in CLI (Masked password input via @clack/prompts)
       └── Save NGROK_API_KEY to ~/.codemcp/credentials.enc
       |
       v
2. getOrCreateToken()
   ├── Found in Env or Vault? ────> Proceed
   └── Missing?
       ├── POST https://api.ngrok.com/credentials (Headers: Bearer <API_KEY>, ngrok-version: 2)
       ├── Auto-provision authtoken with description "codemcp-agent"
       └── Save NGROK_AUTHTOKEN to ~/.codemcp/credentials.enc
       |
       v
3. getOrCreateDomain()
   ├── Found in Env or Vault? ────> Proceed
   └── Missing?
       ├── GET https://api.ngrok.com/reserved_domains
       ├── Existing domain found? ──> Save and use it
       └── None found? ─────────────> POST /reserved_domains to reserve one
       |
       v
4. ngrok.forward({ addr: PORT, authtoken, domain })
       |
       v
[Public HTTPS Global URL Established: https://<domain>.ngrok-free.app/mcp]
```

### Browser Opening Logic:
Cross-platform command execution in `openBrowser(url)`:
- **macOS**: `open "<url>"`
- **Windows**: `start "" "<url>"`
- **Linux**: `xdg-open "<url>"`

---

## 7. Cryptographic Credential Vault (~/.codemcp/credentials.enc)

Located in `src/utils/credentials.js` and `src/utils/env.js`.

### Design Philosophy
No plaintext secrets (API keys, ngrok tokens, etc.) are ever saved in project folders, git repos, or `.env` files. Secrets are stored in a dedicated, hardware-bound vault in the user's home directory.

### Cryptographic Properties
- **Algorithm**: `AES-256-GCM` (Authenticated Encryption with Associated Data).
- **Key Derivation Function (KDF)**: `crypto.pbkdf2Sync` with:
  - Salt: `"codemcp-secure-vault-salt-v1"`
  - Iterations: `100,000`
  - Output Key Length: `32 bytes` (256 bits)
  - Hash Function: `SHA-256`
- **Machine Fingerprint Seed**:
  ```javascript
  const machineFingerprint = [
    os.userInfo().username || "user",
    os.hostname() || "host",
    os.homedir() || "home",
    process.platform,
    process.arch,
  ].join("::");
  ```
- **IV (Initialization Vector)**: 12-byte (96-bit) cryptographically random buffer generated per save operation (`crypto.randomBytes(12)`).
- **Auth Tag**: 16-byte (128-bit) GCM authentication tag verifying ciphertext authenticity and integrity.
- **Filesystem Permissions**: Vault directory created with `0o700` (read/write/execute by owner only); vault file written with `0o600` (read/write by owner only).

### Vault File Schema (`~/.codemcp/credentials.enc`):
```json
{
  "version": 1,
  "iv": "6f2a... (24 hex characters)",
  "authTag": "c98b... (32 hex characters)",
  "ciphertext": "83ef... (encrypted JSON string payload)",
  "updatedAt": "2026-09-13T06:00:00.000Z"
}
```

### Multi-Key Legacy Migration
`getAllCredentials()` supports automatic backward-compatible decryption from legacy paths (`~/.coduit/credentials.enc` and `~/.devnet/credentials.enc`) and legacy salts (`coduit-mcp-secure-vault-salt-v1`, `devnet-mcp-secure-vault-salt-v1`). Decrypted keys are seamlessly migrated and saved to `~/.codemcp/credentials.enc`.

### Sensitive Key Classifier (`isSensitiveKey`):
Automatically classifies keys as sensitive if they match:
- `NGROK_API_KEY`, `NGROK_AUTHTOKEN`, `NGROK_DOMAIN`, `API_KEY`
- Regex: `/^(.*_)?(KEY|TOKEN|SECRET|PASSWORD|AUTH)$/i`

---

## 8. Project Discovery & Configuration System

Located in `src/services/projects.js`.

### Discovery Order:
1. **Target Directory**: Derived from CLI argument or `process.env.PROJECT_ROOT` or `process.cwd()`.
2. **Configuration File Resolution**:
   - Checks for `codemcp.json` in the project root (auto-initializes if missing).
   - If not found, runs auto-initialization to generate `codemcp.json`.
3. **Context File Resolution**:
   - Searches for `CONTEXT.md`.
   - Falls back to `README.md` if `CONTEXT.md` is absent.
   - File contents are loaded and injected as the base guidelines for connected AI assistants.

### `codemcp.json` Schema:

```json
{
  "id": "codemcp",
  "name": "CodeMCP",
  "description": "Project-scoped MCP server providing context, file access, and execution tools",
  "permission": "both",
  "contextFile": "CONTEXT.md",
  "techStack": ["Node.js", "Express", "MCP SDK", "esbuild"]
}
```

### Permission Tiers:
| Permission | Permitted Tools | Disallowed Tools |
|---|---|---|
| `both` (Default) | `get_project_context`, `list_files`, `read_file`, `search_code`, `write_file`, `delete_file`, `execute_command` | *(None)* |
| `read` | `get_project_context`, `list_files`, `read_file`, `search_code` | `write_file`, `delete_file`, `execute_command` |
| `write` | `get_project_context`, `write_file`, `delete_file`, `execute_command` | `list_files`, `read_file`, `search_code` |

---

## 9. PathGuard & File Sandboxing Subsystem

Located in `src/utils/pathGuard.js`.

### Security Guarantees:
- **No Path Traversal**: Rejects any relative path containing `..` or null bytes (`\0`).
- **No Absolute Path Ingestion**: File operations require relative paths. Absolute paths (`/etc/passwd`, `C:\Windows`) throw an immediate `400 Bad Request`.
- **Root Containment**: Resolves paths against `projectRoot` and computes `path.relative(projectRoot, resolved)`. If the result starts with `..` or is absolute, throws a `403 Forbidden` (`Path escapes project root`).
- **Multi-Segment Ignore Checking**: Unlike simple filename checks, `isIgnored()` splits relative paths into segments. If *any* directory segment matches an ignore pattern, access is forbidden.
- **Sensitive File Protection**: Always forbids:
  - Any `.env` file or variant (`.env`, `.env.local`, `.env.production`, `subfolder/.env`)
  - Git repository internal directories (`.git/`)
  - Vault and SSH files (`.codemcp/`, `id_rsa`, `id_ecdsa`, `id_ed25519`, `credentials.enc`)

### Ignore Pattern Sources:
- Hardcoded defaults: `node_modules`, `.git`, `.env`, `.env.*`, `dist`, `build`, `.next`, `venv`, `__pycache__`
- Patterns parsed from `.mcpignore`
- Patterns parsed from `.gitignore`
- Additional directory patterns from `process.env.IGNORED_DIRS` (comma-delimited)

---

## 10. Exhaustive MCP Tools Reference

### 10.1 `get_project_context`
- **File**: `src/tools/projectContext.js`
- **Description**: Returns metadata, description, tech stack, and contextual guidelines for this project.
- **Input Schema**: `{}` (No arguments required)
- **Output Schema**:
  - `id`: `z.string()`
  - `name`: `z.string()`
  - `description`: `z.string()`
  - `techStack`: `z.array(z.string())`
  - `context`: `z.string()` (Full contents of `CONTEXT.md` or `README.md`)

---

### 10.2 `list_files`
- **File**: `src/tools/listFiles.js`
- **Description**: Recursively lists source files in the project or a subfolder. Call this before reading a specific file to discover project structure.
- **Input Schema**:
  - `path`: `z.string().optional()` — Subfolder relative to project root. Defaults to `"."`.
- **Output Schema**:
  - `count`: `z.number()`
  - `path`: `z.string()`
  - `files`: `z.array(z.string())` (Posix-normalized relative paths, sorted alphabetically)
- **Behavior**: Ignores files and directories matching `.mcpignore`, `.gitignore`, and built-in rules.

---

### 10.3 `read_file`
- **File**: `src/tools/readFile.js`
- **Description**: Reads one file's full contents given a path relative to the project root.
- **Input Schema**:
  - `path`: `z.string()` — File path relative to project root (e.g. `src/server.js` or `package.json`).
- **Output Schema**:
  - `path`: `z.string()` (Posix-normalized relative path)
  - `size`: `z.number()` (File size in bytes)
  - `content`: `z.string()` (Full UTF-8 file contents)
- **Error Handling**: Returns `404` for missing files, `403` for ignored or sensitive files, `403` for out-of-scope files.

---

### 10.4 `search_code`
- **File**: `src/tools/searchCode.js`
- **Description**: Searches for a text string or pattern across project source files (respects `.mcpignore`). Returns matching files and line numbers.
- **Input Schema**:
  - `query`: `z.string()` — Text or regex pattern to search for.
  - `isRegex`: `z.boolean().optional()` — Treat query as regex (default: `false`).
  - `caseSensitive`: `z.boolean().optional()` — Match case sensitively (default: `false`).
  - `maxResults`: `z.number().optional()` — Maximum line matches (default: `30`, min: `1`, max: `100`).
- **Output Schema**:
  - `query`: `z.string()`
  - `totalMatches`: `z.number()`
  - `matchedFilesCount`: `z.number()`
  - `matches`: `z.array(z.object({ file: z.string(), line: z.number(), content: z.string() }))`
- **Exclusions**: Skips binary/minified files (`.png`, `.jpg`, `.jpeg`, `.gif`, `.ico`, `.pdf`, `.zip`, `.tar`, `.gz`, `.exe`, `.dll`, `.so`, `.dylib`, `.woff`, `.woff2`, `.ttf`). Snippets are capped at 160 characters.

---

### 10.5 `write_file`
- **File**: `src/tools/writeFile.js`
- **Description**: Creates or overwrites a file with the specified content inside the project directory.
- **Input Schema**:
  - `path`: `z.string()` — File path relative to the project root (e.g. `src/utils/helper.js`).
  - `content`: `z.string()` — Complete text content to write.
- **Output Schema**:
  - `success`: `z.boolean()`
  - `path`: `z.string()`
  - `bytesWritten`: `z.number()`
  - `message`: `z.string()`
- **Behavior**: Automatically creates intermediate parent directories (`fs.mkdirSync(dir, { recursive: true })`).

---

### 10.6 `delete_file`
- **File**: `src/tools/deleteFile.js`
- **Description**: Deletes a file within the project folder. Use with caution for refactoring or cleanup.
- **Input Schema**:
  - `path`: `z.string()` — File path relative to project root to delete (e.g. `temp.js`).
- **Output Schema**:
  - `success`: `z.boolean()`
  - `path`: `z.string()`
  - `message`: `z.string()`
- **Safety**: Only operates on files (`stat.isFile()`). Directories cannot be deleted via this tool to prevent accidental tree loss.

---

### 10.7 `execute_command` & Security Sandbox
- **File**: `src/tools/executeCommand.js`
- **Description**: Executes a terminal/build/test command inside the project directory. Performs system safety checks before running.
- **Input Schema**:
  - `command`: `z.string()` — Shell command to execute (e.g. `npm test`, `git status`).
  - `timeoutMs`: `z.number().optional()` — Timeout in milliseconds (default: `30000`, min: `1000`, max: `60000`).
- **Output Schema**:
  - `command`: `z.string()`
  - `exitCode`: `z.number()`
  - `durationMs`: `z.number()`
  - `stdout`: `z.string()`
  - `stderr`: `z.string()`
  - `timedOut`: `z.boolean()`

#### Security Policy Matrix:
Every command is pre-screened by `validateSystemAndCommand(command, projectRoot)` against 8 strict security categories:

| Threat Category | Enforced Pattern / Rule | Security Reason |
|---|---|---|
| **Directory Traversal** | `/(^\|[\s"'`\/\\=])\.\.([\/\\]\|\s\|$)/` | Blocks `..` path segments navigating outside project root. |
| **Directory Escape** | `/\b(cd\|chdir\|pushd)\s+([a-zA-Z]:[/\\]?\|[/~\\\$%]\|(\.\.))/i` | Blocks changing working directory to root, drive, parent, or home. |
| **Outside Absolute Paths** | Path inspection of `[a-zA-Z]:\` or `/path` | Rejects any absolute path that does not resolve inside `projectRoot`. |
| **Outside System Access** | `/(^\|[\s"'`=])\/(etc\|var\|usr\|bin\|sbin\|root\|home\|opt\|boot\|dev\|sys\|proc)\b/i`<br>`/(^\|[\s"'`=])(~[\/\\]\|\$HOME\b\|%USERPROFILE%\|%APPDATA%)/i` | Blocks references to host OS system and user profile directories. |
| **Sensitive File Access** | `/(^\|[\s"'`\/\\=])\.env(\.[a-zA-Z0-9_.-]+)?(\b\|[\s"'`\/\\=]\|$)/i`<br>`/\b(id_rsa\|id_ecdsa\|id_ed25519\|\.codemcp\|credentials\.enc\|\.ssh)\b/i`<br>`/(^\|[\s"'`\/\\=])\.git[\/\\](config\|credentials\|HEAD\|hooks)/i` | Blocks any command attempting to read, copy, or print sensitive files. |
| **Destructive Deletion** | `/\b(rmdir\|rd)\s+.*\/s/i`<br>`/\bdel\s+.*\/f\s+\/s/i`<br>`/\b(del\|erase)\s+.*(\*\|\/s\|\/f)/i`<br>`/\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f*\|-f*r)\s+([\/~*.]\|(\.\.))/i` | Prevents broad recursive file or directory tree destruction. |
| **Disk & Partition Ops** | `/\b(format\|diskpart\|bcdedit\|chkdsk\|fdisk\|mkfs\|parted)\b/i`<br>`/\b(mkfs\|dd\s+if=)\b/i` | Blocks low-level partition, filesystem formatting, or disk modifications. |
| **Privilege Escalation** | `/\b(sudo\|runas\|doas\|pbrun\|su\s+-\|su\s+[a-zA-Z0-9_-]+)\b/i` | Blocks execution as superuser, root, or elevated administrator. |
| **Service & OS Lifecycle** | `/\b(shutdown\|restart-computer\|stop-computer\|reboot\|halt\|poweroff\|init\s+[06])\b/i`<br>`/\b(sc\s+(create\|delete\|config\|start\|stop)\|systemctl\|service)\b/i` | Blocks modifying background OS services or shutting down the machine. |
| **Remote Shells & Injection** | `/\b(curl\|wget)\b.*\|\s*(sh\|bash\|zsh\|cmd\|powershell\|pwsh)\b/i`<br>`/\b(Invoke-WebRequest\|iwr\|curl)\b.*\|\s*(iex\|Invoke-Expression)\b/i`<br>`/\bpowershell.*(-enc\|-encodedcommand\|-executionpolicy\s+bypass\|-ep\s+bypass)\b/i`<br>`/\b(nc\|ncat\|netcat)\s+.*-e\b/i` | Blocks piping remote downloads into shell execution or opening reverse shells. |
| **Fork Bombs** | `/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/` | Blocks denial-of-service fork bombs. |

#### Environment Scrubbing:
Child processes run with a sanitized environment. All variables matching `/(API_KEY|AUTHTOKEN|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|PRIVATE_KEY)/i` (such as `NGROK_API_KEY`, `NGROK_AUTHTOKEN`, `AWS_SECRET_ACCESS_KEY`, etc.) are stripped before invocation.

---

### 10.8 `record_memory`
- **File**: `src/tools/manageMemory.js`
- **Description**: Records cross-assistant memory, architectural decisions, and next steps for other AI models working in this project.
- **Input Schema**:
  - `summary`: `z.string()` — Concise overview of work completed or current state.
  - `decisions`: `z.string().optional()` — Key architectural or technical decisions adopted.
  - `nextSteps`: `z.string().optional()` — Pending tasks or recommendations for succeeding assistants.
- **Output Schema**:
  - `success`: `z.boolean()`
  - `message`: `z.string()`
  - `memory`: `z.object()`
- **Persistence**: Saved directly to `.codemcp/memory.json` in the project root with atomic write operations.

---

### 10.9 `get_memory`
- **File**: `src/tools/manageMemory.js`
- **Description**: Retrieves cross-assistant session memory, previous handoffs, decisions, and recent file activity history.
- **Input Schema**: *(none)*
- **Output Schema**:
  - `projectId`: `z.string()`
  - `projectName`: `z.string()`
  - `lastHandoff`: `z.object().nullable()`
  - `recentActions`: `z.array(z.object())`
- **Utility**: Allows an agent to quickly discover context left behind by previous sessions without re-indexing all source files.

---

### 10.10 Cross-Assistant Session Memory Architecture
Located in `src/services/memory.js`.

CodeMCP acts as a universal context bridge across disparate AI assistants (e.g. Claude Desktop, Cursor IDE, Windsurf, ChatGPT). 

#### Memory Data Model (`.codemcp/memory.json`):
```json
{
  "version": 1,
  "projectId": "my-app",
  "projectName": "My Application",
  "projectRoot": "/Users/you/projects/my-app",
  "lastHandoff": {
    "summary": "Implemented approval prompt box with diff preview",
    "decisions": "Used AsyncLocalStorage for request ID tracking across async calls",
    "nextSteps": "Verify terminal raw mode keypress compatibility",
    "client": "Claude Desktop",
    "updatedAt": "2026-09-14T09:45:00.000Z"
  },
  "recentActions": [
    {
      "timestamp": "2026-09-14T09:40:12.000Z",
      "action": "WRITE",
      "target": "src/utils/logger.js",
      "client": "Claude Desktop",
      "details": "Updated 6059 bytes",
      "summary": "Added aligned column logging with req_XXXX IDs"
    }
  ]
}
```

#### Features:
1. **Automatic Prompt Injection**: During MCP connection initialization, recent memory is automatically formatted and appended to the MCP server's system instructions under `--- Cross-Assistant Session Memory ---`.
2. **Rolling Activity Journal**: Automatically captures every `WRITE`, `DELETE`, and `EXEC` action up to a rolling window of 15 actions.
3. **Project Isolation**: Guarantees that workspaces each maintain isolated memory stores keyed by normalized path.

---

### 10.11 Native OS Desktop Notifications Subsystem
Located in `src/utils/notify.js`.

Provides instant desktop awareness for human developers during autonomous agent execution.

#### Platform Adapters:
- **Windows (10/11)**: Native WinRT XML Toast notifications invoked via PowerShell (`[Windows.UI.Notifications.ToastNotificationManager]`). Custom sender name `"CodeMCP"` and icon embedding (`icon.png`).
- **macOS**: Native Notification Center banners via `osascript` AppleScript (`display notification with title ...`).
- **Linux**: Freedesktop desktop notifications via `notify-send`.

#### Triggers:
- **Approval Required**: Alerted when an AI change is paused awaiting terminal confirmation.
- **File Modifications**: Alerted when files are written or updated.
- **File Deletions**: Alerted when files are deleted.
- **Security Blocks**: Alerted when path traversal or forbidden commands are intercepted.

*(Can be disabled globally with the `--no-notify` CLI flag or by setting `NOTIFY=false`)*.

---

## 11. Client Identification & Request Telemetry

Located in `src/utils/clientInfo.js`.

During incoming HTTP requests, CodeMCP performs automatic client detection:
1. **Network Location**:
   - Reads `x-forwarded-for` (first IP) or socket `remoteAddress`.
   - Resolves `::1` or `127.0.0.1` to `"localhost"`.
   - Classifies channel as `"ngrok tunnel"` if the `Host` header contains `ngrok`, otherwise `"local network"`.
2. **Client Name Detection**:
   - Priority 1: MCP handshake initialization payload (`req.body.params.clientInfo.name`).
   - Priority 2: Non-browser `User-Agent` token (e.g. `Claude/0.8.0`, `Cursor/1.2.0`).
   - Priority 3: Origin or Referer hostname.
   - Fallback: `"AI Client"`.

---

## 12. Structured Logging & Terminal UI Rendering

Located in `src/utils/logger.js`, `src/utils/diff.js`, `src/services/approval.js`, and `src/utils/box.js`.

### Aligned Action Column Layout
Every tool execution outputs a uniform, column-aligned log line:
`HH:MM:SS req_XXXX <ICON> <ACTION>   <TARGET> · <DETAILS>`

| Badge | Color | Action | Example Output |
|---|---|---|---|
| `✓ CONNECT` | Green | Session opened | `15:05:31        ✓ CONNECT  Claude-User (ngrok tunnel)` |
| `→ READ` | Cyan | Read file | `15:05:32 req_0557 → READ     index.html · 4.0 KB` |
| `→ LIST` | Cyan | List files | `15:05:33 req_0558 → LIST     src · 12 files` |
| `→ SEARCH` | Cyan | Code search | `15:05:34 req_0559 → SEARCH   "port" · 3 matches in 1 file` |
| `⚠ WRITE` | Yellow | Write pending review | `15:09:21 req_8043 ⚠ WRITE    index.html` |
| `✓ WRITE` | Green | Write complete | `15:09:43 req_8043 ✓ WRITE    index.html · 7.2 KB written` |
| `⚠ DELETE` | Yellow | Delete pending review | `15:09:50 req_8044 ⚠ DELETE   temp.txt` |
| `✓ DELETE` | Red | File deleted | `15:09:55 req_8044 ✓ DELETE   temp.txt · deleted` |
| `✓ EXEC` | Green | Shell command exit 0 | `15:10:05 req_8045 ✓ EXEC     npm test · exit 0 (140ms)` |
| `✖ BLOCKED` | Red | Security reject | `15:10:06 req_8046 ✖ BLOCKED  cat .env · Sensitive file access prohibited` |
| `✖ REJECT` | Red | User rejected in CLI | `15:10:07 req_8047 ✖ REJECT   index.html · rejected by user` |
| `⚠ WARN` | Yellow | Tool warning | `15:10:08 req_8048 ⚠ WARN     missing.txt · File not found` |
| `- DISCONN` | Dim | Session closed | `15:15:12        - DISCONN  Claude-User closed` |

### Request Tracing with AsyncLocalStorage
- CodeMCP tracks every tool call with an isolated, asynchronous request ID (`req_XXXX`) generated via `logger.generateRequestId()`.
- The request ID is preserved throughout asynchronous file reads, diff computations, and interactive terminal review pauses.

### Change Approval Box (`src/utils/box.js` & `src/services/approval.js`)
When approval mode is enabled, proposed changes pause the tool call and render an enclosed, color-coded line diff:

```text
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
 │  ... 19 more lines                                                  │
 └─────────────────────────────────────────────────────────────────────┘

• Claude-User · Read & Write · Approval ON · Requests 4
────────────────────────────────────────────────────
Apply changes? [y] Accept  [n] Reject  [d] Full diff  [q] Quit: y

✓ Change accepted
  index.html · 7.2 KB written
```

#### Diff Algorithm (`src/utils/diff.js`):
- Longest Common Subsequence (LCS) dynamic programming matrix.
- Context radius of 2 lines around changes.
- Automatic line-length truncation with `...` to prevent terminal line wrapping inside borders.
- Full diff expansion mode (`d`) for viewing complete uncompressed file context.

---

## 13. Build, Bundling & Obfuscation Pipeline

Located in `scripts/build.js`.

The project is compiled into self-contained, obfuscated distributable files in `dist/` before publishing to NPM.

### 1. Bundling with `esbuild` (`^0.28.2`)
- **Server Bundle**: `src/server.js` -> `dist/server.js`
  - Target: `node18`
  - Format: `esm`
  - Packages: `external` (all dependencies from `package.json` kept external)
  - Banner: `import { createRequire } from "node:module"; const require = createRequire(import.meta.url);`
- **CLI Bundle**: `bin/cli.js` -> `dist/cli.js`
  - External: All dependencies + `./server.js`

### 2. Obfuscation with `javascript-obfuscator` (`^5.7.0`)
Applied to both `dist/server.js` and `dist/cli.js` with settings:
- `controlFlowFlattening: true` (threshold: `0.75`)
- `identifierNamesGenerator: "hexadecimal"`
- `numbersToExpressions: true`
- `simplify: true`
- `splitStrings: true` (chunk length: `10`)
- `stringArray: true`
- `stringArrayCallsTransform: true`
- `stringArrayEncoding: ["base64", "rc4"]`
- `stringArrayThreshold: 0.8`

### 3. Shebang & Execution Permissions
- Strips any existing shebang before obfuscating `dist/cli.js`.
- Prepends `#!/usr/bin/env node\n`.
- Sets file mode to executable: `0o755`.

---

## 14. Test Suite & Integration Verification Client

Located in `scripts/test-client.js`.

Connects as a real MCP client using `@modelcontextprotocol/sdk/client` and `StreamableHTTPClientTransport`.

### Test Coverage Checklist:
1. Handshake & instruction exchange.
2. Tool discovery (`listTools`).
3. Context retrieval (`get_project_context`).
4. Directory listing (`list_files`).
5. File reading (`read_file`).
6. Path traversal rejection (`read_file('../../../etc/passwd')`).
7. Non-existent file error handling (`read_file('missing.txt')`).
8. Sensitive file blocking (`read_file('.env')`).
9. Text & pattern search (`search_code`).
10. File write and immediate read-back (`write_file`).
11. File deletion verification (`delete_file`).
12. Safe command execution (`execute_command('node -v')`).
13. Dangerous command blocking (`execute_command('cat .env')`, `execute_command('cd ..')`).

Run tests locally via:
```bash
npm test
```

---

## 15. Comprehensive Environment Variables Reference

| Variable | Type | Default | Description | Sensitive? |
|---|---|---|---|---|
| `PORT` | Number | `4173` | Preferred local HTTP listening port. Automatically increments if occupied. | No |
| `PROJECT_ROOT` | String | `process.cwd()` | Absolute or relative path to the directory being served. | No |
| `NGROK_ENABLED` | Boolean string | `"true"` | Set to `"false"` to disable ngrok tunneling (equivalent to `--no-tunnel`). | No |
| `NGROK_API_KEY` | String | `""` | ngrok Account API Key for provisioning authtokens and domains. | **Yes** (Vaulted) |
| `NGROK_AUTHTOKEN` | String | `""` | ngrok Tunnel Authtoken. Automatically generated if API key is provided. | **Yes** (Vaulted) |
| `NGROK_DOMAIN` | String | `""` | Custom or reserved ngrok domain (e.g. `my-project.ngrok-free.app`). | **Yes** (Vaulted) |
| `API_KEY` | String | `""` | Optional Bearer token required by `auth.js` middleware if enabled. | **Yes** (Vaulted) |
| `ALLOWED_EXTENSIONS` | String | `""` (All) | Comma-delimited list of permitted file extensions (e.g. `.js,.ts,.json`). | No |
| `IGNORED_DIRS` | String | `""` | Additional comma-delimited directories to ignore during indexing. | No |
| `APPROVAL_MODE` | String | `""` | Require confirmation before applying changes (`"true"`, `"false"`, `"destructive"`). | No |
| `CONFIRM_CHANGES` | String | `""` | Alias for `APPROVAL_MODE`. | No |
| `NOTIFY` | Boolean string | `"true"` | Set to `"false"` to suppress native OS desktop Toast notifications. | No |
| `APPROVAL_TIMEOUT_MS` | Number | `900000` (15 min) | Milliseconds before an unconfirmed approval prompt times out and rejects. | No |
| `MCP_URL` | String | `http://localhost:4173/mcp` | Target endpoint used by test runner (`scripts/test-client.js`). | No |

---

## 16. Client Integration Guides (Claude, Cursor, Generic MCP)

### 1. Claude Desktop
Add to your `claude_desktop_config.json`:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "my-project": {
      "command": "npx",
      "args": [
        "-y",
        "@mahesh2-lab/codemcp",
        "start",
        "C:\\path\\to\\your\\project",
        "--no-tunnel"
      ]
    }
  }
}
```

### 2. Cursor IDE
In Cursor Settings -> **Features** -> **MCP**:
- **Name**: `codemcp`
- **Type**: `command`
- **Command**: `npx -y @mahesh2-lab/codemcp /path/to/project --no-tunnel`

### 3. Remote AI Agents (via Public Tunnel)
When started without `--no-tunnel`, CodeMCP outputs a public URL:
```
https://<your-subdomain>.ngrok-free.app/mcp
```
Configure your remote web connector or agent with:
- **Server URL**: `https://<your-subdomain>.ngrok-free.app/mcp`
- **Transport**: `StreamableHTTP` or `HTTP`
- **Headers**:
  ```json
  {
    "ngrok-skip-browser-warning": "true"
  }
  ```
