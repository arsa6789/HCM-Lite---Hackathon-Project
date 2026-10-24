import { Router } from "express";
import authRoutes from "./auth.routes.js";
import userRoutes from "./user.routes.js";
import orgRoutes from "./org.routes.js";
import attendanceRoutes from "./attendance.routes.js";
import leaveRoutes from "./leave.routes.js";
import payrollRoutes from "./payroll.routes.js";
import dashboardRoutes from "./dashboard.routes.js";
import auditRoutes from "./audit.routes.js";
import aiRoutes from "./ai.routes.js";
import {
  departmentRoutes,
  designationRoutes,
  leaveTypeRoutes,
  holidayRoutes,
} from "./catalog.routes.js";
import { announcementRouter, notificationRouter } from "./comms.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/org", orgRoutes);
router.use("/departments", departmentRoutes);
router.use("/designations", designationRoutes);
router.use("/leave-types", leaveTypeRoutes);
router.use("/holidays", holidayRoutes);
router.use("/attendance", attendanceRoutes);
router.use("/leave", leaveRoutes);
router.use("/payroll", payrollRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/announcements", announcementRouter);
router.use("/notifications", notificationRouter);
router.use("/audit", auditRoutes);
router.use("/ai", aiRoutes);

export default router;
