import { Router } from "express";
import { getOrganization, updateOrganization } from "../controllers/org.controller.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { authenticate } from "../middleware/authenticate.js";
import { ROLES } from "../constants/roles.js";

const router = Router();

router.use(authenticate);
router.get("/", getOrganization);
router.put("/", authorizeRoles(ROLES.ADMIN), updateOrganization);

export default router;
