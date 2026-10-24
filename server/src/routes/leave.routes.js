import { Router } from "express";
import {
  getBalances,
  postApplication,
  getApplications,
  patchReview,
  patchCancel,
} from "../controllers/leave.controller.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

router.use(authenticate);

router.get("/balances", getBalances);
router.post("/", postApplication);
router.get("/", getApplications);
router.patch("/:id/review", patchReview);
router.patch("/:id/cancel", patchCancel);

export default router;
