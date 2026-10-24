import { Router } from "express";
import {
  postRun,
  getRuns,
  getRunById,
  postFinalize,
  deleteRunById,
  getMine,
  getPayslipPdf,
} from "../controllers/payroll.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { ROLES } from "../constants/roles.js";

const router = Router();

router.use(authenticate);

router.post("/runs", authorizeRoles(ROLES.ADMIN, ROLES.HR), postRun);
router.get("/runs", authorizeRoles(ROLES.ADMIN, ROLES.HR), getRuns);
router.get("/runs/:id", authorizeRoles(ROLES.ADMIN, ROLES.HR), getRunById);
router.post("/runs/:id/finalize", authorizeRoles(ROLES.ADMIN), postFinalize);
router.delete("/runs/:id", authorizeRoles(ROLES.ADMIN, ROLES.HR), deleteRunById);
router.get("/payslip/:runId/:userId.pdf", getPayslipPdf);
router.get("/runs/:id/payslips/:userId", getPayslipPdf);
router.get("/mine", getMine);

export default router;
