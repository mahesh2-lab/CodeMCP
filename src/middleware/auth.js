import { verifyAccessToken, getBaseUrl, getClient } from "../services/oauth.js";
import { logger } from "../utils/logger.js";

/**
 * Express middleware that enforces Bearer token authentication on protected MCP routes.
 * Rejects unauthenticated requests with 401 and an RFC 9728 WWW-Authenticate header.
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const baseUrl = getBaseUrl(req);
  const resourceMetadataUrl = `${baseUrl}/.well-known/oauth-protected-resource`;

  if (!authHeader || typeof authHeader !== "string") {
    res.setHeader(
      "WWW-Authenticate",
      `Bearer resource_metadata="${resourceMetadataUrl}", error="unauthorized"`
    );
    return res.status(401).json({
      error: "unauthorized",
      message: "Bearer token required to access this resource",
    });
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.setHeader(
      "WWW-Authenticate",
      `Bearer resource_metadata="${resourceMetadataUrl}", error="invalid_token", error_description="Bearer scheme required"`
    );
    return res.status(401).json({
      error: "invalid_token",
      message: "Authorization header must use Bearer scheme",
    });
  }

  const token = match[1].trim();
  const result = verifyAccessToken(token);

  if (!result.valid) {
    res.setHeader(
      "WWW-Authenticate",
      `Bearer resource_metadata="${resourceMetadataUrl}", error="invalid_token", error_description="${result.error || "Token invalid"}"`
    );
    return res.status(401).json({
      error: "invalid_token",
      message: result.error || "Invalid or expired access token",
    });
  }

  req.user = result.payload;

  if (req.user?.client_id) {
    const registered = getClient(req.user.client_id);
    if (registered?.client_name) {
      logger.setActiveClient(registered.client_name);
    } else {
      logger.setActiveClient(req.user.client_id.slice(0, 8));
    }
  }

  return next();
}

export default requireAuth;
