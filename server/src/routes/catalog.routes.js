import { Router } from "express";
import Department from "../models/Department.js";
import Designation from "../models/Designation.js";
import LeaveType from "../models/LeaveType.js";
import Holiday from "../models/Holiday.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { authenticate } from "../middleware/authenticate.js";
import { ROLES } from "../constants/roles.js";
import {
  makeCatalogController,
  normalizeNameOnly,
  normalizeLeaveType,
  normalizeHoliday,
} from "../controllers/catalog.controller.js";

export function makeCatalogRouter({ Model, entity, fields, normalize }) {
  const router = Router();
  const controller = makeCatalogController({ Model, entity, fields, normalize });

  router.use(authenticate);
  router.get("/", controller.list);
  router.post("/", authorizeRoles(ROLES.ADMIN), controller.create);
  router.patch("/:id", authorizeRoles(ROLES.ADMIN), controller.update);
  router.delete("/:id", authorizeRoles(ROLES.ADMIN), controller.remove);

  return router;
}

export const departmentRoutes = makeCatalogRouter({
  Model: Department,
  entity: "department",
  fields: ["name", "description"],
  normalize: normalizeNameOnly,
});

export const designationRoutes = makeCatalogRouter({
  Model: Designation,
  entity: "designation",
  fields: ["name", "description"],
  normalize: normalizeNameOnly,
});

export const leaveTypeRoutes = makeCatalogRouter({
  Model: LeaveType,
  entity: "leave_type",
  fields: ["name", "annualDays", "paid"],
  normalize: normalizeLeaveType,
});

export const holidayRoutes = makeCatalogRouter({
  Model: Holiday,
  entity: "holiday",
  fields: ["name", "date", "recurring"],
  normalize: normalizeHoliday,
});
