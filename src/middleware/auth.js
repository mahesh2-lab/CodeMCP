import { getProjectByKey } from "../services/projects.js";

export function checkAuth(req, res, next) {
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
      .json({ error: "Invalid API key for any registered project" });
  }

  req.project = project;
  return next();
}
