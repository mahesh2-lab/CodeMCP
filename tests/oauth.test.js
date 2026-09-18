import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import oauthRouter from "../src/routes/oauth.js";
import { requireAuth } from "../src/middleware/auth.js";
import {
  registerClient,
  getClient,
  createAuthCode,
  consumeAuthCode,
  verifyPkce,
  generateAccessToken,
  verifyAccessToken,
  base64UrlEncode,
  base64UrlDecode,
} from "../src/services/oauth.js";
import { renderAuthorizeHtml, escapeHtml } from "../src/views/oauthConsent.js";

test("OAuth Services - base64Url encoding and decoding roundtrip", () => {
  const original = "Hello World! @#% &*()_+ <>? äöü 🚀";
  const encoded = base64UrlEncode(original);
  assert.ok(!encoded.includes("+"));
  assert.ok(!encoded.includes("/"));
  assert.ok(!encoded.includes("="));
  const decoded = base64UrlDecode(encoded).toString("utf8");
  assert.equal(decoded, original);
});

test("OAuth Views - renderAuthorizeHtml generates valid consent page with escaping", () => {
  const html = renderAuthorizeHtml({
    projectName: "My <Special> Project & Co",
    clientName: "Agent \"007\"",
    clientId: "client-id-123",
    redirectUri: "https://example.com/cb",
    codeChallenge: "challenge-xyz",
    codeChallengeMethod: "S256",
    state: "state-abc",
    scope: "mcp",
    errorMessage: "Test <Error> message",
  });

  assert.ok(html.includes("<!DOCTYPE html>"));
  assert.ok(html.includes("My &lt;Special&gt; Project &amp; Co"));
  assert.ok(html.includes("Agent &quot;007&quot;"));
  assert.ok(html.includes("Test &lt;Error&gt; message"));
});


test("OAuth Services - Register client via DCR and retrieve", () => {
  const client = registerClient({
    redirect_uris: ["https://claude.ai/api/mcp/callback"],
    client_name: "Claude AI Test",
  });

  assert.ok(client.client_id);
  assert.equal(client.client_name, "Claude AI Test");
  assert.deepEqual(client.redirect_uris, ["https://claude.ai/api/mcp/callback"]);
  assert.equal(client.token_endpoint_auth_method, "none");

  const retrieved = getClient(client.client_id);
  assert.equal(retrieved.client_id, client.client_id);
});

test("OAuth Services - Registration requires at least one redirect_uri", () => {
  assert.throws(
    () => registerClient({ redirect_uris: [] }),
    /At least one redirect_uri is required/
  );
});

test("OAuth Services - PKCE S256 verification", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = base64UrlEncode(
    crypto.createHash("sha256").update(verifier).digest()
  );

  assert.equal(verifyPkce(verifier, challenge, "S256"), true);
  assert.equal(verifyPkce("wrong-verifier", challenge, "S256"), false);
  assert.equal(verifyPkce(verifier, "wrong-challenge", "S256"), false);
  assert.equal(verifyPkce(verifier, challenge, "plain"), false);
});

test("OAuth Services - Auth code lifecycle and single-use enforcement", () => {
  const verifier = "test-verifier-string-12345678901234567890";
  const challenge = base64UrlEncode(
    crypto.createHash("sha256").update(verifier).digest()
  );

  const clientId = "client-test-123";
  const redirectUri = "https://example.com/cb";

  const code = createAuthCode({
    clientId,
    redirectUri,
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
  });

  assert.ok(code);

  // Consume with wrong verifier
  const failResult = consumeAuthCode(code, clientId, redirectUri, "bad-verifier");
  assert.equal(failResult.ok, false);
  assert.equal(failResult.error, "invalid_grant");

  // Consume with correct verifier
  const successResult = consumeAuthCode(code, clientId, redirectUri, verifier);
  assert.equal(successResult.ok, true);

  // Replay attempt must fail
  const replayResult = consumeAuthCode(code, clientId, redirectUri, verifier);
  assert.equal(replayResult.ok, false);
  assert.equal(replayResult.error, "invalid_grant");
});

test("OAuth Services - JWT Access Token generation and verification", () => {
  const baseUrl = "https://example.ngrok.app";
  const token = generateAccessToken({
    clientId: "client-abc",
    baseUrl,
    sub: "owner",
    scope: "mcp",
  });

  assert.ok(token);
  assert.equal(token.split(".").length, 3);

  const verification = verifyAccessToken(token);
  assert.equal(verification.valid, true);
  assert.equal(verification.payload.iss, baseUrl);
  assert.equal(verification.payload.sub, "owner");
  assert.equal(verification.payload.client_id, "client-abc");
  assert.equal(verification.payload.scope, "mcp");

  // Tampered token must fail
  const tampered = token.slice(0, -5) + "abcde";
  const tamperedResult = verifyAccessToken(tampered);
  assert.equal(tamperedResult.valid, false);
});

test("OAuth HTTP - Discovery endpoints & Protected resource metadata", async () => {
  const app = express();
  app.use(express.json());
  app.use(oauthRouter);

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Authorization server metadata
    const asRes = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`);
    assert.equal(asRes.status, 200);
    const asData = await asRes.json();
    assert.equal(asData.issuer, baseUrl);
    assert.equal(asData.authorization_endpoint, `${baseUrl}/authorize`);
    assert.equal(asData.token_endpoint, `${baseUrl}/token`);
    assert.equal(asData.registration_endpoint, `${baseUrl}/register`);
    assert.deepEqual(asData.code_challenge_methods_supported, ["S256"]);

    // 2. Protected resource metadata
    const prRes = await fetch(`${baseUrl}/.well-known/oauth-protected-resource`);
    assert.equal(prRes.status, 200);
    const prData = await prRes.json();
    assert.equal(prData.resource, `${baseUrl}/mcp`);
    assert.deepEqual(prData.authorization_servers, [baseUrl]);

    // 3. Dynamic client registration
    const regRes = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Claude AI",
        redirect_uris: ["https://claude.ai/cb"],
      }),
    });
    assert.equal(regRes.status, 201);
    const regData = await regRes.json();
    assert.ok(regData.client_id);
    assert.equal(regData.client_name, "Claude AI");
  } finally {
    server.close();
  }
});

test("OAuth HTTP - requireAuth middleware blocks unauthenticated and allows valid Bearer", async () => {
  const app = express();
  app.use(express.json());
  app.get("/mcp", requireAuth, (req, res) => {
    res.json({ ok: true, user: req.user });
  });

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // Request without token -> 401 with WWW-Authenticate header
    const unauthRes = await fetch(`${baseUrl}/mcp`);
    assert.equal(unauthRes.status, 401);
    const wwwAuth = unauthRes.headers.get("www-authenticate");
    assert.ok(wwwAuth.includes("Bearer"));
    assert.ok(wwwAuth.includes("resource_metadata="));

    // Request with valid token -> 200 OK
    const token = generateAccessToken({
      clientId: "client-test",
      baseUrl,
    });
    const authRes = await fetch(`${baseUrl}/mcp`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    assert.equal(authRes.status, 200);
    const data = await authRes.json();
    assert.equal(data.ok, true);
    assert.equal(data.user.client_id, "client-test");
  } finally {
    server.close();
  }
});

test("OAuth End-to-End - Full flow: DCR -> Authorize -> Token -> Protected /mcp", async () => {
  const origPassword = process.env.OWNER_PASSWORD;
  process.env.OWNER_PASSWORD = "test-owner-pass-12345";

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(oauthRouter);
  app.get("/mcp", requireAuth, (req, res) => {
    res.json({ ok: true, user: req.user });
  });

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Dynamic Client Registration
    const regRes = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Claude Remote Connector",
        redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
      }),
    });
    assert.equal(regRes.status, 201);
    const client = await regRes.json();
    const clientId = client.client_id;
    const redirectUri = client.redirect_uris[0];

    // 2. Prepare PKCE
    const verifier = "random-pkce-verifier-string-123456789012345";
    const challenge = base64UrlEncode(
      crypto.createHash("sha256").update(verifier).digest()
    );

    // 3. GET /authorize page
    const authPageRes = await fetch(
      `${baseUrl}/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&code_challenge=${challenge}&code_challenge_method=S256&state=xyz123`
    );
    assert.equal(authPageRes.status, 200);
    const authPageHtml = await authPageRes.text();
    assert.ok(authPageHtml.includes("Claude Remote Connector"));
    assert.ok(authPageHtml.includes('name="password"'));

    // 4. POST /authorize with wrong password -> 401
    const wrongAuthRes = await fetch(`${baseUrl}/authorize`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        code_challenge: challenge,
        code_challenge_method: "S256",
        state: "xyz123",
        password: "wrong-password",
      }).toString(),
    });
    assert.equal(wrongAuthRes.status, 401);
    const wrongHtml = await wrongAuthRes.text();
    assert.ok(wrongHtml.includes("Incorrect password"));

    // 5. POST /authorize with correct password -> 302 Redirect with code
    const correctAuthRes = await fetch(`${baseUrl}/authorize`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      redirect: "manual",
      body: new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        code_challenge: challenge,
        code_challenge_method: "S256",
        state: "xyz123",
        password: "test-owner-pass-12345",
      }).toString(),
    });
    assert.equal(correctAuthRes.status, 302);
    const location = correctAuthRes.headers.get("location");
    assert.ok(location.startsWith(redirectUri));

    const redirectUrl = new URL(location);
    const code = redirectUrl.searchParams.get("code");
    assert.ok(code);
    assert.equal(redirectUrl.searchParams.get("state"), "xyz123");

    // 6. POST /token with authorization code & verifier
    const tokenRes = await fetch(`${baseUrl}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: verifier,
      }).toString(),
    });
    assert.equal(tokenRes.status, 200);
    const tokenData = await tokenRes.json();
    assert.ok(tokenData.access_token);
    assert.equal(tokenData.token_type, "Bearer");
    assert.equal(tokenData.expires_in, 3600);

    // 7. Access protected /mcp endpoint with access token
    const mcpRes = await fetch(`${baseUrl}/mcp`, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });
    assert.equal(mcpRes.status, 200);
    const mcpData = await mcpRes.json();
    assert.equal(mcpData.ok, true);
    assert.equal(mcpData.user.client_id, clientId);
    assert.equal(mcpData.user.sub, "owner");
  } finally {
    if (origPassword !== undefined) {
      process.env.OWNER_PASSWORD = origPassword;
    } else {
      delete process.env.OWNER_PASSWORD;
    }
    server.close();
  }
});

