import { Router } from "express";
import { listAudit, verifyChain } from "../controllers/audit.controller.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

router.use(authenticate);

router.get("/", listAudit);
router.get("/verify", verifyChain);

export default router;
