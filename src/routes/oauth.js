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
    logger.serverInfo(`OAuth Dynamic Client Registered: ${client.client_name} (${client.client_id})`);
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
      --codemcp-red: #cb3837;
      --codemcp-red-hover: #b82f2e;

      --black: #111111;
      --text: #24292f;
      --muted: #6b7280;

      --border: #d8dee4;
      --border-light: #e5e7eb;

      --background: #f6f6f6;
      --surface: #ffffff;
      --input: #ffffff;

      --success: #1a7f37;

      --error: #b42318;
      --error-bg: #fff1f0;
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      min-height: 100%;
    }

    body {
      font-family:
        Inter,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        Roboto,
        Helvetica,
        Arial,
        sans-serif;

      background: var(--background);
      color: var(--text);

      min-height: 100vh;

      display: flex;
      flex-direction: column;

      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }

    /* =========================================
       HEADER
    ========================================= */

    .header {
      height: 64px;

      background: #ffffff;

      border-bottom: 1px solid var(--border-light);

      display: flex;
      align-items: center;

      padding: 0 32px;
    }

    .header-inner {
      width: 100%;
      max-width: 1180px;

      margin: 0 auto;

      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .brand {
      display: inline-flex;
      align-items: center;

      gap: 10px;

      text-decoration: none;

      color: var(--black);
    }

    .brand-icon {
      width: 31px;
      height: 31px;

      object-fit: contain;

      display: block;

      border-radius: 6px;
    }

    .brand-name {
      font-size: 18px;
      font-weight: 700;

      letter-spacing: -0.45px;

      color: #111111;
    }

    .header-label {
      color: #737373;

      font-size: 13px;
      font-weight: 500;
    }


    /* =========================================
       MAIN
    ========================================= */

    main {
      flex: 1;

      display: flex;
      justify-content: center;
      align-items: flex-start;

      padding: 72px 20px 90px;
    }

    .container {
      width: 100%;
      max-width: 520px;
    }


    /* =========================================
       CARD
    ========================================= */

    .card {
      width: 100%;

      background: var(--surface);

      border: 1px solid var(--border);

      border-radius: 7px;

      padding: 36px 38px;

      box-shadow:
        0 1px 2px rgba(0, 0, 0, 0.04),
        0 5px 18px rgba(0, 0, 0, 0.045);
    }


    /* =========================================
       PRODUCT ICON
    ========================================= */

    .product-icon {
      width: 54px;
      height: 54px;

      margin: 0 auto 22px;

      border-radius: 9px;

      background: #ffffff;

      border: 1px solid var(--border-light);

      display: flex;
      align-items: center;
      justify-content: center;

      overflow: hidden;

      box-shadow:
        0 1px 2px rgba(0, 0, 0, 0.04);
    }

    .product-icon img {
      width: 100%;
      height: 100%;

      object-fit: contain;
    }


    /* =========================================
       HEADING
    ========================================= */

    h1 {
      margin: 0;

      color: var(--black);

      font-size: 24px;
      line-height: 1.25;

      font-weight: 700;

      letter-spacing: -0.55px;

      text-align: center;
    }

    .description {
      margin: 12px auto 28px;

      max-width: 430px;

      color: var(--muted);

      font-size: 14px;
      line-height: 1.65;

      text-align: center;
    }

    .description strong {
      color: #333333;
      font-weight: 600;
    }


    /* =========================================
       REQUEST DETAILS
    ========================================= */

    .request-box {
      background: #fafafa;

      border: 1px solid var(--border-light);

      border-radius: 6px;

      padding: 16px;

      margin-bottom: 24px;
    }

    .request-row {
      min-height: 24px;

      display: flex;
      align-items: center;
      justify-content: space-between;

      gap: 20px;

      font-size: 13px;
    }

    .request-row + .request-row {
      margin-top: 13px;
      padding-top: 13px;

      border-top: 1px solid #eeeeee;
    }

    .request-label {
      color: var(--muted);

      font-size: 12px;
      font-weight: 500;

      white-space: nowrap;
    }

    .request-value {
      color: var(--black);

      font-size: 13px;
      font-weight: 600;

      text-align: right;

      min-width: 0;

      overflow: hidden;
      text-overflow: ellipsis;
    }


    /* =========================================
       CLIENT BADGE
    ========================================= */

    .client-badge {
      display: inline-flex;
      align-items: center;

      max-width: 260px;

      padding: 4px 8px;

      background: #ffffff;

      border: 1px solid var(--border);

      border-radius: 4px;

      color: #222222;

      font-size: 12px;
      font-weight: 600;

      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }


    /* =========================================
       ERROR
    ========================================= */

    .error-box {
      display: flex;
      align-items: flex-start;

      gap: 10px;

      background: var(--error-bg);

      border: 1px solid #efc1be;

      border-left: 3px solid var(--error);

      border-radius: 5px;

      color: var(--error);

      padding: 12px 13px;

      margin-bottom: 22px;

      font-size: 13px;

      line-height: 1.5;
    }

    .error-icon {
      width: 18px;
      height: 18px;

      flex-shrink: 0;

      border-radius: 50%;

      background: var(--error);

      color: #ffffff;

      display: flex;
      align-items: center;
      justify-content: center;

      font-size: 11px;
      font-weight: 700;
    }


    /* =========================================
       FORM
    ========================================= */

    .form-group {
      margin-bottom: 20px;
    }

    label {
      display: block;

      margin-bottom: 6px;

      color: var(--black);

      font-size: 13px;
      font-weight: 600;
    }

    .label-description {
      margin-bottom: 8px;

      color: #737373;

      font-size: 12px;

      line-height: 1.5;
    }


    /* =========================================
       INPUT
    ========================================= */

    .input-wrapper {
      position: relative;
    }

    input[type="password"] {
      width: 100%;
      height: 44px;

      padding: 0 13px;

      background: var(--input);

      border: 1px solid #b8bec5;

      border-radius: 5px;

      color: var(--black);

      font-family: inherit;

      font-size: 14px;

      outline: none;

      transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease;
    }

    input[type="password"]::placeholder {
      color: #9ca3af;
    }

    input[type="password"]:hover {
      border-color: #8b949e;
    }

    input[type="password"]:focus {
      border-color: var(--codemcp-red);

      box-shadow:
        0 0 0 3px rgba(203, 56, 55, 0.12);
    }


    /* =========================================
       BUTTON
    ========================================= */

    button {
      width: 100%;
      height: 46px;

      border: 1px solid var(--codemcp-red);

      border-radius: 5px;

      background: var(--codemcp-red);

      color: #ffffff;

      font-family: inherit;

      font-size: 14px;

      font-weight: 700;

      cursor: pointer;

      transition:
        background 0.15s ease,
        border-color 0.15s ease,
        transform 0.05s ease;
    }

    button:hover {
      background: var(--codemcp-red-hover);

      border-color: var(--codemcp-red-hover);
    }

    button:active {
      transform: translateY(1px);
    }

    button:focus-visible {
      outline: none;

      box-shadow:
        0 0 0 3px rgba(203, 56, 55, 0.18);
    }


    /* =========================================
       SECURITY NOTICE
    ========================================= */

    .security-note {
      display: flex;
      align-items: flex-start;

      gap: 9px;

      margin-top: 20px;

      padding: 12px;

      background: #f6f8fa;

      border: 1px solid var(--border-light);

      border-radius: 5px;

      color: var(--muted);

      font-size: 12px;

      line-height: 1.55;
    }

    .security-icon {
      width: 17px;
      height: 17px;

      flex-shrink: 0;

      border-radius: 50%;

      background: #dafbe1;

      color: var(--success);

      display: flex;
      align-items: center;
      justify-content: center;

      font-size: 10px;
      font-weight: 800;
    }


    /* =========================================
       FOOTER
    ========================================= */

    footer {
      border-top: 1px solid var(--border-light);

      background: #ffffff;

      padding: 21px 20px;
    }

    .footer-inner {
      width: 100%;
      max-width: 1180px;

      margin: 0 auto;

      display: flex;
      align-items: center;
      justify-content: space-between;

      gap: 20px;
    }

    .footer-text,
    .footer-brand {
      color: #8b949e;

      font-size: 12px;
    }

    .footer-brand {
      font-weight: 600;
    }


    /* =========================================
       RESPONSIVE
    ========================================= */

    @media (max-width: 600px) {

      .header {
        height: 60px;

        padding: 0 18px;
      }

      .brand-icon {
        width: 29px;
        height: 29px;
      }

      .brand-name {
        font-size: 17px;
      }

      .header-label {
        display: none;
      }

      main {
        padding: 34px 14px 50px;
      }

      .card {
        padding: 28px 22px;

        border-radius: 6px;
      }

      .product-icon {
        width: 50px;
        height: 50px;

        margin-bottom: 19px;
      }

      h1 {
        font-size: 22px;
      }

      .description {
        font-size: 13px;

        margin-bottom: 24px;
      }

      .request-box {
        padding: 14px;
      }

      .request-row {
        align-items: flex-start;
      }

      .request-value {
        max-width: 60%;
      }

      .client-badge {
        max-width: 100%;
      }

      footer {
        padding: 18px;
      }

      .footer-inner {
        flex-direction: column;

        text-align: center;

        gap: 7px;
      }
    }
  </style>
</head>


<body>

  <!-- =========================================
       HEADER
  ========================================== -->

  <header class="header">

    <div class="header-inner">

      <a href="/" class="brand">

        <img
          src="https://raw.githubusercontent.com/mahesh2-lab/CodeMCP/refs/heads/main/assets/icon.png"
          alt="CodeMCP"
          class="brand-icon"
        >

        <span class="brand-name">
          CodeMCP
        </span>

      </a>

      <span class="header-label">
        Secure authorization
      </span>

    </div>

  </header>


  <!-- =========================================
       MAIN
  ========================================== -->

  <main>

    <div class="container">

      <section class="card">


        <!-- Product Icon -->

        <div class="product-icon">

          <img
            src="https://raw.githubusercontent.com/mahesh2-lab/CodeMCP/refs/heads/main/assets/icon.png"
            alt="CodeMCP"
          >

        </div>


        <!-- Heading -->

        <h1>
          Authorize CodeMCP
        </h1>


        <p class="description">

          <strong>${escapeHtml(clientName)}</strong>
          is requesting permission to connect to your
          <strong>CodeMCP</strong>
          project.

        </p>


        <!-- =====================================
             REQUEST INFORMATION
        ====================================== -->

        <div class="request-box">


          <div class="request-row">

            <span class="request-label">
              Application
            </span>

            <span class="request-value">

              <span class="client-badge">
                CodeMCP
              </span>

            </span>

          </div>


          <div class="request-row">

            <span class="request-label">
              Client
            </span>

            <span class="request-value">
              ${escapeHtml(clientName)}
            </span>

          </div>


          <div class="request-row">

            <span class="request-label">
              Project
            </span>

            <span class="request-value">
              ${escapeHtml(projectName)}
            </span>

          </div>


          <div class="request-row">

            <span class="request-label">
              Permissions
            </span>

            <span class="request-value">
              MCP tools &amp; file operations
            </span>

          </div>


        </div>


        <!-- =====================================
             ERROR MESSAGE
        ====================================== -->

        ${
          errorMessage
            ? `
              <div class="error-box">

                <span class="error-icon">
                  !
                </span>

                <span>
                  ${escapeHtml(errorMessage)}
                </span>

              </div>
            `
            : ""
        }


        <!-- =====================================
             AUTHORIZATION FORM
        ====================================== -->

        <form
          method="POST"
          action="/authorize"
        >

          <!-- OAuth / MCP Parameters -->

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


          <!-- Password -->

          <div class="form-group">

            <label for="password">
              Owner Password
            </label>

            <div class="label-description">
              Enter the password associated with this CodeMCP project.
            </div>

            <div class="input-wrapper">

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

          </div>


          <!-- Submit -->

          <button type="submit">
            Authorize and Continue
          </button>


        </form>


        <!-- =====================================
             SECURITY NOTICE
        ====================================== -->

        <div class="security-note">

          <span class="security-icon">
            ✓
          </span>

          <span>
            Your credentials are used only to authorize this
            connection. Access is limited to the project and
            permissions described above.
          </span>

        </div>


      </section>

    </div>

  </main>


  <!-- =========================================
       FOOTER
  ========================================== -->

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
    return res.status(400).send("Invalid response_type: only 'code' is supported.");
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
    return res.status(400).send("PKCE is required. Provide code_challenge with code_challenge_method=S256.");
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

  logger.serverInfo(`Issued OAuth authorization code for client ${client.client_name} (${client_id})`);

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
  const {
    grant_type,
    code,
    redirect_uri,
    client_id,
    code_verifier,
  } = req.body;

  if (grant_type !== "authorization_code") {
    return res.status(400).json({
      error: "unsupported_grant_type",
      error_description: "Only 'authorization_code' grant type is supported",
    });
  }

  const verification = consumeAuthCode(code, client_id, redirect_uri, code_verifier);
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
