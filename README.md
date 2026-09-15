<p align="center">
  <a href="https://code-mcp.vercel.app/">
    <img src="assets/banner.png" alt="CodeMCP - Model Context Protocol server for local projects" width="100%" />
  </a>
</p>

<div align="center">

# CodeMCP

**The Project-Scoped Model Context Protocol Server for Local Codebases**

[![npm version](https://img.shields.io/npm/v/@mahesh2-lab/codemcp?style=flat-square&color=black&labelColor=222)](https://www.npmjs.com/package/@mahesh2-lab/codemcp)
[![Website](https://img.shields.io/badge/Website-code--mcp.vercel.app-000000?style=flat-square&logo=vercel&logoColor=white)](https://code-mcp.vercel.app/)
[![Protocol](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-6366f1?style=flat-square&labelColor=222)](https://modelcontextprotocol.io/)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-339933?style=flat-square&labelColor=222)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow?style=flat-square&labelColor=222)](LICENSE)

<p align="center">
  Connect AI assistants and MCP clients to your local project with authenticated Streamable HTTP,<br>
  project-scoped tools, approval workflows, cross-session memory, and sandboxed execution.
</p>

<p align="center">
  <a href="https://code-mcp.vercel.app/">Website</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-authentication-and-client-connection">Authentication</a> •
  <a href="#-mcp-tools">Tools</a> •
  <a href="#-security-model">Security</a> •
  <a href="#-development">Development</a>
</p>

</div>

---

## ⚡ Overview

CodeMCP gives an assistant a bounded view of a project, with tools for inspecting files, searching source, applying changes, running allowlisted development commands, and preserving handoff notes between sessions. It runs as an Express server, can expose itself through an ngrok tunnel, and protects the MCP endpoint with an OAuth 2.0 authorization-code flow with PKCE.

## 🌟 Features

- **Project-scoped context:** Serve one project with `codemcp.json`, `CONTEXT.md`, `.mcpignore`, and `.gitignore` support.
- **MCP tools:** Inspect files, search code, write and delete files, run safe commands, and manage project context and memory.
- **Authenticated HTTP:** Connect through Streamable HTTP with OAuth 2.0, PKCE, and bearer tokens.
- **Permission modes:** Choose `read`, `write`, or `both` for each project.
- **Optional ngrok tunnel:** Give remote MCP clients a public HTTPS endpoint.
- **Approval prompts:** Review file changes, deletions, and commands before they run.
- **Cross-assistant memory:** Save handoffs and recent workspace activity in `.codemcp/memory.json`.
- **Security sandbox:** Block path traversal, sensitive files, symlink escapes, unsafe commands, and secret environment variables.
- **Fast search:** Use ripgrep with a JavaScript fallback and ignored-file filtering.
- **Credential vault:** Store generated credentials securely outside the project.
- **Notifications and logs:** See client connections, tool activity, blocked actions, and native desktop alerts.
- **Developer tooling:** Use CLI setup commands, watch mode, tests, esbuild builds, and CI for Node 18, 20, and 22.

## Requirements

- Node.js 18 or newer.
- npm (the repository uses npm in CI). pnpm, yarn, or npx can also launch the published package.
- An MCP client that supports Streamable HTTP and OAuth 2.0 for a protected remote endpoint.
- An ngrok account and API key only when the public tunnel is enabled.

## Quick start

Run from the project you want to expose:

```bash
npx @mahesh2-lab/codemcp --no-tunnel
```

The default local endpoint is `http://localhost:4173/mcp`. CodeMCP creates `codemcp.json`, `.mcpignore`, and `CONTEXT.md` when needed. The server also prints the resolved project, permission mode, owner password, and endpoint.

For a public HTTPS endpoint, omit `--no-tunnel`:

```bash
npx @mahesh2-lab/codemcp
```

On first tunnel setup, CodeMCP opens the ngrok API-key page and prompts for a key. Credentials generated or entered through CodeMCP may be stored outside the project in `~/.codemcp/credentials.enc`; environment variables take precedence and are not automatically persisted.

### Install globally

```bash
npm install --global @mahesh2-lab/codemcp
codemcp --no-tunnel
```

The package also exposes the legacy aliases `coduit` and `devnet-mcp`.

## CLI

Running `codemcp` starts the server for the current directory. An existing directory passed as the first argument is treated as the project path.

```text
codemcp [options] [path]
codemcp <command> [options]
```

### Commands

| Command | Purpose |
| --- | --- |
| `codemcp start [path]` | Start the MCP server. The default port is `4173`; if occupied, the next available port is selected, scanning up to 50 ports. |
| `codemcp init [path]` | Create or update `codemcp.json`, `.mcpignore`, and `CONTEXT.md`. Prompts for project name, description, and permissions when interactive. |
| `codemcp info [path]` | Display project metadata, permission and approval state, context file, and indexed source-file count. |
| `codemcp approval [on\|off]` | Show or persist the `approval` value in `codemcp.json`. `approve` is an alias. |
| `codemcp credentials` | Show encrypted-vault keys with masked values. `status` is an alias. |
| `codemcp credentials set <key> <value>` | Add or update a vault value. |
| `codemcp credentials delete <key>` | Remove one vault value. |
| `codemcp credentials clear` | Remove all vault values. |

### Start options

| Option | Meaning |
| --- | --- |
| `-p, --port <number>` | Preferred local port; default `4173`. |
| `-a, --approval [mode]` | Require confirmation. Modes understood by the approval service include `true`/`always`, `false`/`never`, and `destructive`. |
| `-c, --confirm` | Alias for `--approval`. |
| `--ask` | Alias for `--approval`. |
| `--no-approval` | Disable confirmation prompts and auto-apply changes. |
| `--no-confirm` | Alias for `--no-approval`. |
| `--no-tunnel` | Disable ngrok and use the local endpoint only. |
| `--no-notify` | Set the notification-disable flag for the process. |
| `-y, --yes` | Skip initialization prompts and use detected defaults. |
| `-V, --version` | Print the package version. |
| `-h, --help` | Print the full CLI help. |

Examples:

```bash
codemcp ./my-project --no-tunnel
codemcp start ./my-project --port 5000 --approval destructive
codemcp approval on
codemcp approval off
codemcp info ./my-project
codemcp credentials status
codemcp credentials set NGROK_API_KEY <your-ngrok-api-key>
```

## Project configuration

`codemcp.json` is read from the project root. `codemcp init` creates the following shape:

```json
{
  "id": "my-project",
  "name": "My project",
  "description": "Project overview and guidelines for AI assistants.",
  "permission": "both",
  "approval": false,
  "contextFile": "CONTEXT.md"
}
```

Supported project fields include:

| Field | Values / behavior |
| --- | --- |
| `id` | Project identifier returned by `get_project_context`. |
| `name` | Display name. |
| `description` | Project description injected into MCP instructions. |
| `permission` | `read`, `write`, or `both`; default `both`. |
| `approval` | `false`, `true`/`always`, or `destructive`. |
| `contextFile` | Relative context filename. `CONTEXT.md` is the normal value; if it is missing, project discovery can fall back to `README.md`. |
| `context` | Inline context fallback. |
| `allowedCommands` | Optional additional executable names for `execute_command`. |

Permissions determine tool registration:

| Permission | Registered tools |
| --- | --- |
| `read` | Context and memory tools, `list_files`, `read_file`, `search_code` |
| `write` | Context and memory tools, `write_file`, `delete_file`, `execute_command` |
| `both` | All tools |

`codemcp init` also creates `.mcpignore` with defaults for `.env`, `.env.*`, `node_modules`, `.git`, `dist`, `build`, and `.DS_Store`. If a `.gitignore` exists, initialization ensures `.env` and `.env.*` are present there too. Both ignore files are honored by project inspection and search.

## Authentication and client connection

The `/mcp` route is protected. It does not use an `API_KEY` header. Requests must include an OAuth access token:

```http
Authorization: Bearer <access-token>
```

CodeMCP implements the following OAuth endpoints:

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/.well-known/oauth-authorization-server` | `GET` | RFC 8414 authorization-server metadata. |
| `/.well-known/oauth-protected-resource` | `GET` | RFC 9728 protected-resource metadata. |
| `/register` | `POST` | RFC 7591 dynamic client registration. At least one `redirect_uri` is required. |
| `/authorize` | `GET` | Render the owner-password authorization page. Requires `response_type=code`, a registered client, a registered redirect URI, and PKCE `S256`. |
| `/authorize` | `POST` | Verify the owner password and redirect with a one-use authorization code. |
| `/token` | `POST` | Exchange the code and PKCE verifier for a one-hour HS256 JWT bearer token. Only `authorization_code` is supported. |
| `/mcp` | `POST`, `GET`, `DELETE` | Authenticated Streamable HTTP MCP traffic and session lifecycle. |
| `/health` | `GET` | Unauthenticated liveness response containing `status` and `projectRoot`. |

An OAuth-capable MCP client should use the discovery metadata, register itself, generate a PKCE `S256` challenge, open `/authorize`, and ask for the owner password shown at server startup. The resulting bearer token is then used for `/mcp`. Authorization codes expire after five minutes and are single-use. The server keeps client registrations, authorization codes, and MCP sessions in memory; restart requires clients to authenticate again.

For a browser or basic HTTP check, an authenticated `GET /mcp` returns a JSON status object. An unauthenticated request returns `401` and a `WWW-Authenticate` header containing the protected-resource metadata URL.

## MCP tools

All file paths are relative to the configured project root. Tool responses contain machine-readable `structuredContent` plus a text representation.

| Tool | Inputs | Behavior |
| --- | --- | --- |
| `get_project_context` | None | Returns project metadata, description, context-file contents, latest handoff, and up to five recent actions. |
| `list_files` | `path?`, `maxFiles?` | Recursively lists allowed files. Defaults to `.` and 1,000 files; maximum is 10,000. Reports truncation. |
| `read_file` | `path` | Reads UTF-8 text up to 10 MB. Binary files and disallowed file types are rejected. |
| `search_code` | `query`, `path?`, `isRegex?`, `caseSensitive?`, `maxResults?` | Searches with ripgrep, falling back to a JavaScript walker. Query length is limited to 500 characters; default results are 30 and maximum is 100. Search files are limited to 2 MB. |
| `write_file` | `path`, `content`, `summary?` | Creates or overwrites a project file. Approval can show an LCS diff before writing. |
| `delete_file` | `path`, `summary?` | Deletes one file after path checks and optional approval. Directories cannot be deleted. |
| `execute_command` | `command?` or `binary` + `args?`, `timeoutMs?`, `summary?` | Runs an allowlisted binary with `shell: false`, a clean environment, and a timeout clamped to 1-60 seconds (default 30 seconds). |
| `record_memory` | `summary`, `decisions?`, `nextSteps?` | Saves a project handoff note in `.codemcp/memory.json`. |
| `get_memory` | None | Returns the handoff and complete rolling action journal. |

### Command execution policy

The default executable allowlist is:

```text
git npm npx pnpm yarn node python python3 pip pytest cargo rustc go tsc esbuild vitest jest rg
```

`ALLOWED_COMMANDS` or `ALLOWED_BINARIES` can add comma-separated names, and `allowedCommands` can add project-specific names. CodeMCP rejects shell operators (`|`, `&`, `;`, redirection, backticks, `$`, and newlines), direct binary paths, Node/Python inline evaluation, unsafe Git configuration flags, and arguments that escape the project or reference protected files. Command output is capped at 500 KB.

## Approval workflow

Approval is disabled by default in a newly initialized project. Enable it in configuration or at launch:

```bash
codemcp --approval
codemcp --approval destructive
codemcp approval on
```

`destructive` prompts for `delete_file` and `execute_command`, but not ordinary writes. For an interactive write, the terminal shows a bounded diff and accepts:

```text
y  accept
n  reject
d  show the full diff
q  cancel the operation
```

`APPROVAL_TIMEOUT_MS` controls the prompt timeout and defaults to 15 minutes. In a non-interactive process, `APPROVAL_NON_INTERACTIVE=auto` accepts approval requests; `reject`, `deny`, or `false` rejects them.

## Environment variables

Environment variables take precedence over values in the encrypted credential vault when both exist.

| Variable | Purpose |
| --- | --- |
| `PROJECT_ROOT` | Project root when no path argument is supplied. |
| `PORT` | Preferred server port. |
| `PUBLIC_URL` / `SERVER_URL` | Explicit public base URL used in OAuth metadata and token claims. |
| `OWNER_PASSWORD` | Owner password for OAuth authorization. If absent, a random password is generated, persisted in the vault, and rotated every seven days. |
| `JWT_SECRET` | JWT signing secret. If absent, a stable random secret is generated and persisted in the vault. |
| `NGROK_ENABLED` | Set to `false` to skip tunnel startup. |
| `NGROK_API_KEY` | ngrok API key used for validation and provisioning. |
| `NGROK_AUTHTOKEN` | Existing ngrok authtoken; otherwise CodeMCP provisions one. |
| `NGROK_DOMAIN` | Existing reserved ngrok domain; otherwise CodeMCP reuses or creates one. |
| `APPROVAL_MODE` / `CONFIRM_CHANGES` | Runtime approval override: `true`, `false`, `always`, `never`, or `destructive`. |
| `APPROVAL_TIMEOUT_MS` | Approval prompt timeout. |
| `APPROVAL_NON_INTERACTIVE` | Non-TTY approval policy; default `auto`. |
| `ALLOWED_COMMANDS` / `ALLOWED_BINARIES` | Comma-separated additional command binaries. |
| `ALLOWED_ENV_VARS` | Comma-separated additional variables exposed to executed commands. |
| `IGNORED_DIRS` | Comma-separated additional ignored path segments. |
| `ALLOWED_EXTENSIONS` | Optional comma-separated file extensions allowed by file listing and reads. |

## Security model

- Every relative file path is checked for traversal, absolute paths, null bytes, and symlink escapes from the project root.
- `.env` variants, `.git`, `.codemcp`, `.ssh`, `.npmrc`, `.pypirc`, SSH key names, and `credentials.enc` are blocked. Built-in ignored directories include `node_modules`, `dist`, `build`, `.next`, `venv`, and `__pycache__`.
- Executed processes receive an allowlisted environment rather than the full parent environment. Secrets such as `OWNER_PASSWORD`, `JWT_SECRET`, and API keys are not passed by default.
- Credentials are stored in `~/.codemcp/credentials.enc` using AES-256-GCM with a machine-derived key. The vault directory and file use owner-only permissions where supported.
- The default CORS policy allows cross-origin MCP clients, so a public tunnel should be paired with OAuth and a strong owner password. Do not expose the local endpoint to an untrusted network without authentication.
- The generated password is printed at startup. Treat it as a secret. Set `OWNER_PASSWORD` explicitly when you need a managed password that is not rotated automatically.

## HTTP and session behavior

- Express listens on the selected port and automatically selects an available port if the requested port is busy. Use the printed local URL and protect any non-local exposure with authentication.
- MCP uses `POST /mcp` for JSON-RPC requests, `GET /mcp` for an active stream or status inspection after authentication, and `DELETE /mcp` to close a session.
- Sessions are stored in memory and evicted after 30 minutes without access. A cleanup sweep runs every five minutes.
- `/health` responds with JSON such as `{ "status": "ok", "projectRoot": "..." }`.
- `SIGINT`, `SIGTERM`, `SIGHUP`, and Windows `SIGBREAK` close active sockets, the HTTP server, and the tunnel with a short forced-shutdown safety timeout.

## Development

Install dependencies and run the source CLI:

```bash
npm ci
npm run dev
```

Available package scripts:

| Script | Command |
| --- | --- |
| `npm start` | Run the bundled `dist/cli.js`. |
| `npm run dev` | Run `bin/cli.js` with Node's watch mode. |
| `npm test` | Run the 32 tests under `tests/` with Node's built-in test runner. |
| `npm run build` | Recreate `dist/cli.js`, `dist/server.js`, and copied runtime assets with esbuild. |
| `npm run compile` | Alias for `npm run build`. |
| `npm run test:integration` | Run `scripts/test-client.js` against `MCP_URL` or `http://localhost:4173/mcp`. The script sends an optional `API_KEY` header but does not implement the current OAuth flow, so it is a legacy smoke client and is not a complete authenticated test of the default server. |
| `npm run prepublishOnly` | Build before publishing. |

Useful direct verification scripts are available as `node scripts/test-approval.js`, `node scripts/test-memory.js`, and `node scripts/test-refactors.js`.

The GitHub Actions workflow tests Node 18, 20, and 22 on Ubuntu and Windows. It runs `npm ci`, `npm test`, and `npm run build`.

## Repository layout

```text
bin/cli.js                 CLI definition and default-command dispatch
src/server.js              Express app, startup, tunnel, and shutdown lifecycle
src/routes/                Health, OAuth, and Streamable HTTP MCP routes
src/middleware/auth.js     OAuth bearer-token protection for /mcp
src/services/              Approval, memory, OAuth, and project discovery
src/tools/                 MCP tool implementations and permission registry
src/tunnel/ngrok.js        ngrok key, token, domain, and tunnel management
src/utils/                 Credentials, paths, diffs, logging, notifications, and ports
tests/                     Node test-runner tests
scripts/build.js           esbuild distribution build
scripts/test-client.js     Streamable HTTP MCP integration client
assets/                    Banner and notification icon
dist/                      Generated package artifacts (created by npm run build)
codemcp.json               This repository's project manifest
CONTEXT.md                 AI context and project guidelines
.mcpignore                MCP-specific ignored paths
info.md                    Extended internal architecture specification
```

## Troubleshooting

**The server asks for an ngrok API key.** Use `--no-tunnel` for local-only operation, or provide a valid `NGROK_API_KEY` through the environment or `codemcp credentials set NGROK_API_KEY <key>`.

**The displayed port is not 4173.** CodeMCP automatically moves to the first available port in its 50-port probe range. Use the printed local URL.

**An MCP client receives `401`.** Complete the OAuth discovery, registration, authorization, and PKCE token exchange, then send `Authorization: Bearer <access-token>` to `/mcp`. `API_KEY` is not an accepted authentication mechanism.

**A file or command is blocked.** Check project-root containment, `.mcpignore`, `.gitignore`, built-in sensitive-path rules, the permission tier, and the command allowlist. Protected files and shell operators cannot be enabled through normal project configuration.

**A change does not apply.** Check the approval prompt, `APPROVAL_MODE`, `CONFIRM_CHANGES`, and `APPROVAL_NON_INTERACTIVE`. A non-TTY process rejects requests when the latter is `reject`, `deny`, or `false`.

**A source file cannot be read.** `read_file` only accepts text files up to 10 MB and rejects detected binary content. `ALLOWED_EXTENSIONS` can narrow access further; it cannot bypass sensitive-path rules.

## Limitations

- OAuth client registrations, authorization codes, JWT validation state, and MCP sessions are in memory. Restarting the server requires clients to reconnect and authenticate.
- The MCP server is scoped to one project root per process.
- Only the explicit command allowlist is executable, and raw shell pipelines are intentionally unsupported.
- ngrok setup requires network access and an ngrok account when tunneling is enabled.
- `--no-notify` is exposed as a CLI option and sets `NOTIFY=false`; notification calls are currently implemented in the logger/notification module and do not otherwise use that variable as a runtime gate.

## Contributing

1. Fork the repository and create a focused branch.
2. Run `npm ci`, `npm test`, and `npm run build`.
3. Keep changes scoped, update tests for behavior changes, and update this README when public commands, configuration, or protocol behavior changes.
4. Open a pull request with the behavior, validation commands, and any security implications described.

## Links and license

- Website: [code-mcp.vercel.app](https://code-mcp.vercel.app/)
- npm: [@mahesh2-lab/codemcp](https://www.npmjs.com/package/@mahesh2-lab/codemcp)
- Source and issues: [github.com/mahesh2-lab/CodeMCP](https://github.com/mahesh2-lab/CodeMCP)
- Protocol: [modelcontextprotocol.io](https://modelcontextprotocol.io/)

CodeMCP is released under the [MIT License](LICENSE).
