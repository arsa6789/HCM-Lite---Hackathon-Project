import { Router } from "express";
import {
  createUser,
  deleteUser,
  getUser,
  listUsers,
  updateUser,
  csvTemplate,
  csvExport,
  csvImport,
} from "../controllers/user.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { enforceRecordScope } from "../middleware/enforceRecordScope.js";
import { ROLES } from "../constants/roles.js";

const router = Router();

router.use(authenticate);

router.get("/csv/template", csvTemplate);
router.get("/csv/export", csvExport);
router.post("/csv/import", authorizeRoles(ROLES.ADMIN, ROLES.HR), csvImport);
router.get("/", authorizeRoles(ROLES.ADMIN, ROLES.HR), listUsers);
router.post("/", authorizeRoles(ROLES.ADMIN, ROLES.HR), createUser);
router.get("/:id", enforceRecordScope(), getUser);
router.patch("/:id", enforceRecordScope(), updateUser);
router.delete("/:id", authorizeRoles(ROLES.ADMIN), enforceRecordScope(), deleteUser);

export default router;
