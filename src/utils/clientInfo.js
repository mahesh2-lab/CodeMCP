/**
 * Detects the client identity (from MCP handshake, User-Agent, or Origin),
 * and extracts its basic IP / network location.
 *
 * @param {import("express").Request} req
 * @returns {object}
 */
export function getClientSource(req) {
  // 1. IP & network location
  const forwarded = req.headers["x-forwarded-for"];
  const rawIp = (forwarded ? forwarded.split(",")[0] : req.socket?.remoteAddress || "").trim();
  const clientIp = !rawIp || rawIp === "::1" || rawIp.includes("127.0.0.1") ? "127.0.0.1" : rawIp;
  const location = clientIp === "127.0.0.1" ? "localhost" : clientIp;
  const channel = req.headers["host"]?.includes("ngrok") ? "ngrok tunnel" : "local network";

  // 2. Client identification (MCP handshake payload, User-Agent, or Origin)
  const mcpName = req.body?.params?.clientInfo?.name || "";
  const userAgent = (req.headers["user-agent"] || "").trim();
  const origin = req.headers["origin"] || req.headers["referer"] || "";

  let clientName = mcpName;
  if (!clientName && userAgent) {
    const uaToken = userAgent.split("/")[0].trim();
    if (uaToken && !uaToken.toLowerCase().startsWith("mozilla")) {
      clientName = uaToken;
    }
  }
  if (!clientName && origin) {
    try {
      clientName = new URL(origin).hostname;
    } catch {}
  }
  if (!clientName) {
    clientName = "AI Client";
  }

  return {
    clientName,
    clientIp,
    location,
    channel,
    origin,
    userAgent,
  };
}

export default getClientSource;
