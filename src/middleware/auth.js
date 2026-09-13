import { getProjectByKey, getActiveProject } from "../services/projects.js";
import { getEnv } from "../utils/env.js";

export function checkAuth(req, res, next) {
  const configuredKey = getEnv("API_KEY");

  // If no API_KEY is set in environment or secure vault, allow requests through
  if (!configuredKey) {
    req.project = getActiveProject();
    return next();
  }

  const authHeader = req.headers["authorization"] || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1].trim() : null;

  if (!token) {
    return res
      .status(401)
      .json({ error: "Missing Authorization Bearer header" });
  }

  const project = getProjectByKey(token);
  if (!project) {
    return res
      .status(401)
      .json({ error: "Invalid API key" });
  }

  req.project = project;
  return next();
}

export default checkAuth;
