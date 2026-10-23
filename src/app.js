import express from "express";
import cors from "cors";
import routes from "./routes/index.js";

/**
 * Creates and configures the Express application instance for CodeMCP.
 * Configures proxy trust, CORS headers for MCP clients, body parsers, and API routes.
 */
export const app = express();
app.set("trust proxy", true);

app.use(
  cors({
    origin: "*",
    exposedHeaders: ["Mcp-Session-Id", "Mcp-Protocol-Version"],
    allowedHeaders: [
      "Content-Type",
      "mcp-session-id",
      "mcp-protocol-version",
      "last-event-id",
      "ngrok-skip-browser-warning",
      "Authorization",
    ],
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(routes);

export default app;
