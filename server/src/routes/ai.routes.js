import { Router } from "express";
import { chat, status } from "../controllers/ai.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { rateLimit } from "../utils/rateLimit.js";

const router = Router();

router.get("/status", authenticate, status);
router.post(
  "/chat",
  authenticate,
  rateLimit({ windowMs: 60 * 60 * 1000, max: 20, keyBy: "user" }),
  chat
);

export default router;
