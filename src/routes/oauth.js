import { Router } from "express";
import {
  getBaseUrl,
  registerClient,
  getClient,
  verifyOwnerPassword,
  createAuthCode,
  consumeAuthCode,
  generateAccessToken,
} from "../services/oauth.js";
import { getActiveProject } from "../services/projects.js";
import { logger } from "../utils/logger.js";

const router = Router();

/**
 * RFC 8414 - OAuth 2.0 Authorization Server Metadata
 */
router.get("/.well-known/oauth-authorization-server", (req, res) => {
  const baseUrl = getBaseUrl(req);
  res.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    registration_endpoint: `${baseUrl}/register`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  });
});

/**
 * RFC 9728 - OAuth 2.0 Protected Resource Metadata
 */
router.get("/.well-known/oauth-protected-resource", (req, res) => {
  const baseUrl = getBaseUrl(req);
  res.json({
    resource: `${baseUrl}/mcp`,
    authorization_servers: [baseUrl],
    scopes_supported: ["mcp"],
    bearer_methods_supported: ["header"],
    resource_documentation: `${baseUrl}/`,
  });
});

/**
 * RFC 7591 - Dynamic Client Registration
 */
router.post("/register", (req, res) => {
  try {
    const client = registerClient(req.body);
    logger.serverInfo(
      `OAuth Dynamic Client Registered: ${client.client_name} (${client.client_id})`,
    );
    res.status(201).json(client);
  } catch (err) {
    res.status(400).json({
      error: "invalid_client_metadata",
      error_description: err.message,
    });
  }
});

function renderAuthorizeHtml({
  projectName,
  clientName,
  clientId,
  redirectUri,
  codeChallenge,
  codeChallengeMethod,
  state,
  scope,
  errorMessage = "",
}) {
  return ` 
  <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize CodeMCP - ${escapeHtml(projectName)}</title>

  <style>
    :root {
      --red: #d63638;
      --red-hover: #c52f31;
      --black: #111111;
      --text: #24292f;
      --muted: #617080;
      --border: #dfe3e8;
      --border-light: #e8ebee;
      --bg: #f7f7f7;
      --surface: #ffffff;
      --success: #1a9b4a;
      --error: #b42318;
      --error-bg: #fff4f3;
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      min-height: 100%;
    }

    body {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      background: var(--bg);
      color: var(--text);
      font-family:
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        Roboto,
        Helvetica,
        Arial,
        sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    /* Header */

    .header {
      height: 64px;
      padding: 0 32px;
      display: flex;
      align-items: center;
      background: #fff;
      border-top: 4px solid #3d4657;
      border-bottom: 1px solid var(--border-light);
    }

    .header-inner {
      width: 100%;
      max-width: 1060px;
      margin: auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--black);
      text-decoration: none;
    }

    .brand-icon {
      width: 24px;
      height: 24px;
      object-fit: contain;
    }

    .brand-name {
      color: #111;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -.25px;
    }

    .header-label {
      color: #617080;
      font-size: 12px;
      font-weight: 500;
    }

    /* Main */

    main {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding: 64px 20px 80px;
    }

    .container {
      width: 100%;
      max-width: 466px;
    }

    /* Card */

    .card {
      width: 100%;
      padding: 32px 34px;
      background: var(--surface);
      border: 1px solid #d7dce1;
      border-radius: 5px;
      box-shadow:
        0 1px 2px rgba(0, 0, 0, .03),
        0 5px 14px rgba(0, 0, 0, .035);
    }

    /* Icon */

    .product-icon {
      width: 50px;
      height: 50px;
      margin: 0 auto 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fff;
      border: 1px solid var(--border-light);
      border-radius: 8px;
      overflow: hidden;
    }

    .product-icon img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    /* Heading */

    h1 {
      margin: 0;
      color: #111;
      font-size: 21px;
      line-height: 1.3;
      font-weight: 700;
      letter-spacing: -.35px;
      text-align: center;
    }

    .description {
      max-width: 350px;
      margin: 10px auto 25px;
      color: #617080;
      font-size: 13px;
      line-height: 1.65;
      text-align: center;
    }

    .description strong {
      color: #111;
      font-weight: 600;
    }

    /* Request */

    .request-box {
      padding: 12px 14px;
      margin-bottom: 21px;
      background: #fcfcfc;
      border: 1px solid var(--border);
      border-radius: 5px;
    }

    .request-row {
      min-height: 27px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      font-size: 12px;
    }

    .request-row + .request-row {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #eceff1;
    }

    .request-label {
      color: #617080;
      font-size: 11px;
      font-weight: 500;
      white-space: nowrap;
    }

    .request-value {
      min-width: 0;
      max-width: 65%;
      overflow: hidden;
      color: #111;
      font-size: 12px;
      font-weight: 600;
      text-align: right;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .client-badge {
      display: inline-flex;
      align-items: center;
      max-width: 100%;
      padding: 4px 7px;
      overflow: hidden;
      background: #fff;
      border: 1px solid #d8dde2;
      border-radius: 4px;
      color: #111;
      font-size: 11px;
      font-weight: 500;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Error */

    .error-box {
      display: flex;
      align-items: flex-start;
      gap: 9px;
      padding: 10px 11px;
      margin-bottom: 18px;
      background: var(--error-bg);
      border: 1px solid #efc4c1;
      border-left: 3px solid var(--error);
      border-radius: 4px;
      color: var(--error);
      font-size: 12px;
      line-height: 1.5;
    }

    .error-icon {
      width: 17px;
      height: 17px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: var(--error);
      color: #fff;
      font-size: 10px;
      font-weight: 700;
    }

    /* Form */

    .form-group {
      margin-bottom: 17px;
    }

    label {
      display: block;
      margin-bottom: 5px;
      color: #111;
      font-size: 12px;
      font-weight: 600;
    }

    .label-description {
      margin-bottom: 7px;
      color: #617080;
      font-size: 11px;
      line-height: 1.45;
    }

    input[type="password"] {
      width: 100%;
      height: 40px;
      padding: 0 11px;
      background: #fff;
      border: 1px solid #bfc6ce;
      border-radius: 4px;
      color: #111;
      font-family: inherit;
      font-size: 12px;
      outline: none;
      transition:
        border-color .15s ease,
        box-shadow .15s ease;
    }

    input[type="password"]::placeholder {
      color: #9aa4af;
    }

    input[type="password"]:hover {
      border-color: #9aa1a9;
    }

    input[type="password"]:focus {
      border-color: var(--red);
      box-shadow: 0 0 0 2px rgba(214, 54, 56, .12);
    }

    /* Authorize Button */

    .authorize-button {
      position: relative;
      width: 100%;
      height: 41px;
      padding: 0;
      overflow: hidden;
      border: 1px solid var(--red);
      border-radius: 4px;
      background: var(--red);
      color: #fff;
      font-family: inherit;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition:
        background .15s ease,
        border-color .15s ease,
        box-shadow .15s ease,
        transform .1s ease;
    }

    .authorize-button:hover {
      background: var(--red-hover);
      border-color: var(--red-hover);
      box-shadow: 0 3px 8px rgba(214, 54, 56, .18);
    }

    .authorize-button:active {
      transform: translateY(1px);
    }

    .authorize-button:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px rgba(214, 54, 56, .16);
    }

    .button-content {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      transition:
        opacity .18s ease,
        transform .18s ease;
    }

    .button-arrow {
      font-size: 15px;
      transition: transform .18s ease;
    }

    .authorize-button:hover .button-arrow {
      transform: translateX(3px);
    }

    /* Loading */

    .button-loading {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      opacity: 0;
      transform: translateY(5px);
      pointer-events: none;
      transition:
        opacity .18s ease,
        transform .18s ease;
    }

    .authorize-button.loading .button-content {
      opacity: 0;
      transform: translateY(-5px);
    }

    .authorize-button.loading .button-loading {
      opacity: 1;
      transform: translateY(0);
    }

    .spinner {
      width: 13px;
      height: 13px;
      border: 2px solid rgba(255, 255, 255, .3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin .65s linear infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    .loading-dots {
      display: inline-flex;
      gap: 2px;
    }

    .loading-dots i {
      width: 3px;
      height: 3px;
      border-radius: 50%;
      background: #fff;
      opacity: .35;
      animation: dot 1.1s infinite ease-in-out;
    }

    .loading-dots i:nth-child(1) {
      animation-delay: 0s;
    }

    .loading-dots i:nth-child(2) {
      animation-delay: .13s;
    }

    .loading-dots i:nth-child(3) {
      animation-delay: .26s;
    }

    @keyframes dot {
      0%, 60%, 100% {
        opacity: .3;
        transform: translateY(0);
      }

      30% {
        opacity: 1;
        transform: translateY(-2px);
      }
    }

    /* Security */

    .security-note {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-top: 18px;
      padding: 10px 11px;
      background: #f7f9fa;
      border: 1px solid var(--border-light);
      border-radius: 4px;
      color: #617080;
      font-size: 10.5px;
      line-height: 1.55;
    }

    .security-icon {
      width: 15px;
      height: 15px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: #ddf7e5;
      color: var(--success);
      font-size: 9px;
      font-weight: 800;
    }

    /* Footer */

    footer {
      padding: 18px 20px;
      background: #fff;
      border-top: 1px solid var(--border-light);
    }

    .footer-inner {
      width: 100%;
      max-width: 1060px;
      margin: auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .footer-text,
    .footer-brand {
      color: #8b949e;
      font-size: 10px;
    }

    .footer-brand {
      font-weight: 600;
    }

    /* Mobile */

    @media (max-width: 600px) {
      .header {
        height: 58px;
        padding: 0 17px;
      }

      .header-label {
        display: none;
      }

      main {
        padding: 32px 14px 50px;
      }

      .card {
        padding: 27px 21px;
      }

      .product-icon {
        width: 48px;
        height: 48px;
      }

      h1 {
        font-size: 20px;
      }

      .description {
        font-size: 12px;
      }

      .request-box {
        padding: 11px 12px;
      }

      .request-row {
        gap: 12px;
      }

      .request-value {
        max-width: 62%;
      }

      footer {
        padding: 16px;
      }
    }
  </style>
</head>

<body>

  <header class="header">
    <div class="header-inner">

      <a href="/" class="brand">
        <img
          src="https://raw.githubusercontent.com/mahesh2-lab/CodeMCP/refs/heads/main/assets/icon.png"
          alt="CodeMCP"
          class="brand-icon"
        >
        <span class="brand-name">CodeMCP</span>
      </a>

      <span class="header-label">
        Secure authorization
      </span>

    </div>
  </header>

  <main>
    <div class="container">

      <section class="card">

        <div class="product-icon">
          <img
            src="https://raw.githubusercontent.com/mahesh2-lab/CodeMCP/refs/heads/main/assets/icon.png"
            alt="CodeMCP"
          >
        </div>

        <h1>Authorize CodeMCP</h1>

        <p class="description">
          <strong>${escapeHtml(clientName)}</strong>
          is requesting permission to connect to your
          <strong>CodeMCP</strong> project.
        </p>

        <div class="request-box">

          <div class="request-row">
            <span class="request-label">Application</span>

            <span class="request-value">
              <span class="client-badge">CodeMCP</span>
            </span>
          </div>

          <div class="request-row">
            <span class="request-label">Client</span>

            <span class="request-value">
              ${escapeHtml(clientName)}
            </span>
          </div>

          <div class="request-row">
            <span class="request-label">Project</span>

            <span class="request-value">
              ${escapeHtml(projectName)}
            </span>
          </div>

          <div class="request-row">
            <span class="request-label">Permissions</span>

            <span class="request-value">
              MCP tools &amp; file operations
            </span>
          </div>

        </div>

        ${
          errorMessage
            ? `
              <div class="error-box">
                <span class="error-icon">!</span>
                <span>${escapeHtml(errorMessage)}</span>
              </div>
            `
            : ""
        }

        <form
          method="POST"
          action="/authorize"
          id="authorizeForm"
        >

          <input
            type="hidden"
            name="client_id"
            value="${escapeHtml(clientId)}"
          >

          <input
            type="hidden"
            name="redirect_uri"
            value="${escapeHtml(redirectUri)}"
          >

          <input
            type="hidden"
            name="code_challenge"
            value="${escapeHtml(codeChallenge)}"
          >

          <input
            type="hidden"
            name="code_challenge_method"
            value="${escapeHtml(codeChallengeMethod)}"
          >

          <input
            type="hidden"
            name="state"
            value="${escapeHtml(state || "")}"
          >

          <input
            type="hidden"
            name="scope"
            value="${escapeHtml(scope || "mcp")}"
          >

          <div class="form-group">

            <label for="password">
              Owner Password
            </label>

            <div class="label-description">
              Enter the password associated with this CodeMCP project.
            </div>

            <input
              type="password"
              id="password"
              name="password"
              placeholder="Enter your owner password"
              autocomplete="current-password"
              required
              autofocus
            >

          </div>

          <button
            type="submit"
            id="authorizeButton"
            class="authorize-button"
          >

            <span class="button-content">
              <span>Authorize and Continue</span>
              <span class="button-arrow">→</span>
            </span>

            <span class="button-loading">
              <span class="spinner"></span>
              <span>Authorizing</span>

              <span class="loading-dots">
                <i></i>
                <i></i>
                <i></i>
              </span>
            </span>

          </button>

        </form>

        <div class="security-note">
          <span class="security-icon">✓</span>

          <span>
            Your credentials are used only to authorize this connection.
            Access is limited to the project and permissions described above.
          </span>
        </div>

      </section>

    </div>
  </main>

  <footer>
    <div class="footer-inner">
      <span class="footer-text">
        Secure authorization powered by CodeMCP
      </span>

      <span class="footer-brand">
        CodeMCP
      </span>
    </div>
  </footer>

  <script>
    const form = document.getElementById("authorizeForm");
    const button = document.getElementById("authorizeButton");

    form.addEventListener("submit", event => {
      if (button.classList.contains("loading")) {
        event.preventDefault();
        return;
      }

      button.classList.add("loading");
      button.disabled = true;

      setTimeout(() => {
        form.submit();
      }, 650);
    });
  </script>

</body>
</html>
  
  
  `;
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * GET /authorize - Renders minimal authorization login form
 */
router.get("/authorize", (req, res) => {
  const {
    response_type,
    client_id,
    redirect_uri,
    code_challenge,
    code_challenge_method,
    state,
    scope,
  } = req.query;

  if (response_type !== "code") {
    return res
      .status(400)
      .send("Invalid response_type: only 'code' is supported.");
  }

  if (!client_id || typeof client_id !== "string") {
    return res.status(400).send("Missing client_id.");
  }

  const client = getClient(client_id);
  if (!client) {
    return res.status(400).send("Invalid or unregistered client_id.");
  }

  if (!redirect_uri || !client.redirect_uris.includes(redirect_uri)) {
    return res.status(400).send("Invalid redirect_uri.");
  }

  if (!code_challenge || code_challenge_method !== "S256") {
    return res
      .status(400)
      .send(
        "PKCE is required. Provide code_challenge with code_challenge_method=S256.",
      );
  }

  const project = getActiveProject();
  const html = renderAuthorizeHtml({
    projectName: project?.name || "CodeMCP Project",
    clientName: client.client_name,
    clientId: client_id,
    redirectUri: redirect_uri,
    codeChallenge: code_challenge,
    codeChallengeMethod: code_challenge_method,
    state,
    scope,
  });

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

/**
 * POST /authorize - Validates owner password, generates auth code, redirects to redirect_uri
 */
router.post("/authorize", (req, res) => {
  const {
    client_id,
    redirect_uri,
    code_challenge,
    code_challenge_method,
    state,
    scope,
    password,
  } = req.body;

  const client = getClient(client_id);
  if (!client || !client.redirect_uris.includes(redirect_uri)) {
    return res.status(400).send("Invalid client or redirect_uri.");
  }

  if (!code_challenge || code_challenge_method !== "S256") {
    return res.status(400).send("Invalid PKCE challenge or method.");
  }

  const isPasswordValid = verifyOwnerPassword(password);
  if (!isPasswordValid) {
    const project = getActiveProject();
    const html = renderAuthorizeHtml({
      projectName: project?.name || "CodeMCP Project",
      clientName: client.client_name,
      clientId: client_id,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method,
      state,
      scope,
      errorMessage: "Incorrect password. Please try again.",
    });

    res.status(401);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  }

  const code = createAuthCode({
    clientId: client_id,
    redirectUri: redirect_uri,
    codeChallenge: code_challenge,
    codeChallengeMethod: code_challenge_method,
    scope: scope || "mcp",
  });

  logger.serverInfo(
    `Issued OAuth authorization code for client ${client.client_name} (${client_id})`,
  );

  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", code);
  if (state) {
    redirectUrl.searchParams.set("state", state);
  }

  return res.redirect(302, redirectUrl.toString());
});

/**
 * POST /token - Exchanges authorization code + PKCE verifier for JWT access token
 */
router.post("/token", (req, res) => {
  const { grant_type, code, redirect_uri, client_id, code_verifier } = req.body;

  if (grant_type !== "authorization_code") {
    return res.status(400).json({
      error: "unsupported_grant_type",
      error_description: "Only 'authorization_code' grant type is supported",
    });
  }

  const verification = consumeAuthCode(
    code,
    client_id,
    redirect_uri,
    code_verifier,
  );
  if (!verification.ok) {
    return res.status(400).json({
      error: verification.error,
      error_description: verification.errorDescription,
    });
  }

  const baseUrl = getBaseUrl(req);
  const accessToken = generateAccessToken({
    clientId: client_id,
    baseUrl,
    sub: "owner",
    scope: verification.record.scope || "mcp",
  });

  logger.serverInfo(`Issued access token to client ${client_id}`);

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  return res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    scope: verification.record.scope || "mcp",
  });
});

export default router;
