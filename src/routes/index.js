import { Router } from "express";
import healthRouter from "./health.js";
import mcpRouter from "./mcp.js";
import oauthRouter from "./oauth.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(healthRouter);
router.use(oauthRouter);
router.use("/mcp", requireAuth, mcpRouter);

export default router;

