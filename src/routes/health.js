import { Router } from "express";
import { getProjectRoot } from "../utils/pathGuard.js";

const router = Router();

router.get("/health", (req, res) => {
  res.json({ status: "ok", projectRoot: getProjectRoot() });
});

export default router;
