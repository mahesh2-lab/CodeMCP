import { Router } from "express";
import healthRouter from "./health.js";
import mcpRouter from "./mcp.js";

const router = Router();

router.use(healthRouter);
router.use("/mcp", mcpRouter);

export default router;
