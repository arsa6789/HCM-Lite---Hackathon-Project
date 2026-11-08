import Organization from "../models/Organization.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { serializeOrg } from "../access/policies.js";
import { getOrg } from "../services/orgService.js";
import { audit } from "../utils/audit.js";
import { validateOrganizationUpdate } from "../utils/orgValidation.js";

export const getOrganization = asyncHandler(async (req, res) => {
  res.json({ org: serializeOrg(await getOrg()) });
});

export const updateOrganization = asyncHandler(async (req, res) => {
  const existing = await Organization.findOne();
  const before = existing ? serializeOrg(existing) : null;
  const org = existing ?? new Organization({ companyName: "My Company" });
  const payload = validateOrganizationUpdate(req.body, org.toObject());

  Object.assign(org, payload);
  await org.save();

  await audit(req.user, existing ? "org.update" : "org.create", "organization", String(org._id), {
    before,
    after: serializeOrg(org.toObject()),
  }, req);

  res.json({ org: serializeOrg(org.toObject()) });
});
