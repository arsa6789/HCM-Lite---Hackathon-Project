import { Router } from "express";
import { login, logout, me, signup } from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { rateLimit } from "../utils/rateLimit.js";

const router = Router();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

router.post("/signup", authLimiter, signup);
router.post("/login", authLimiter, login);
router.post("/logout", logout);
router.get("/me", authenticate, me);

export default router;
