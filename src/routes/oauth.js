import { renderAuthorizeHtml } from "../views/oauthConsent.js";
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
