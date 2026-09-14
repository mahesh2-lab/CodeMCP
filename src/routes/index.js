import { Router } from "express";
import healthRouter from "./health.js";
import mcpRouter from "./mcp.js";
import { checkAuth } from "../middleware/auth.js";

const router = Router();

router.use(healthRouter);
router.use("/mcp", checkAuth, mcpRouter);

export default router;
