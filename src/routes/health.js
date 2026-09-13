import { Router } from "express";
import { PROJECT_ROOT } from "../utils/pathGuard.js";

const router = Router();

router.get("/health", (req, res) => {
  res.json({ status: "ok", projectRoot: PROJECT_ROOT });
});

export default router;
