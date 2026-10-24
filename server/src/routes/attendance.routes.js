import { Router } from "express";
import {
  postCheckIn,
  postCheckOut,
  getAttendance,
  getBoard,
  postCorrection,
  patchCorrection,
} from "../controllers/attendance.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { rateLimit } from "../utils/rateLimit.js";

const router = Router();

router.use(authenticate);

router.post("/check-in", rateLimit({ windowMs: 60_000, max: 10, keyBy: "user" }), postCheckIn);
router.post("/check-out", rateLimit({ windowMs: 60_000, max: 10, keyBy: "user" }), postCheckOut);
router.get("/", getAttendance);
router.get("/board", getBoard);
router.post("/:id/correction", postCorrection);
router.patch("/:id/correction", patchCorrection);

export default router;
