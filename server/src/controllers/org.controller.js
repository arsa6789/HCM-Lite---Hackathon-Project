import Organization from "../models/Organization.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { serializeOrg } from "../access/policies.js";
import { getOrg } from "../services/orgService.js";
import { audit } from "../utils/audit.js";
import { hhmmToMinutes } from "../utils/dates.js";

const ORG_FIELDS = [
  "companyName",
  "officeStart",
  "officeEnd",
  "graceMinutes",
  "halfDayHours",
  "weekendDays",
  "currency",
  "hraPct",
  "medicalPct",
  "geofence",
  "latePolicy",
  "taxSlabs",
];

export const getOrganization = asyncHandler(async (req, res) => {
  res.json({ org: serializeOrg(await getOrg()) });
});

export const updateOrganization = asyncHandler(async (req, res) => {
  const denied = Object.keys(req.body ?? {}).filter((field) => !ORG_FIELDS.includes(field));

  if (denied.length > 0) {
    throw new ApiError(403, `You cannot set these fields: ${denied.join(", ")}.`);
  }

  const payload = req.body;

  if (payload.officeStart && hhmmToMinutes(payload.officeStart) == null) {
    throw new ApiError(400, "officeStart must be in HH:mm format.");
  }

  if (payload.officeEnd && hhmmToMinutes(payload.officeEnd) == null) {
    throw new ApiError(400, "officeEnd must be in HH:mm format.");
  }

  if (payload.weekendDays && (!Array.isArray(payload.weekendDays) || payload.weekendDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6))) {
    throw new ApiError(400, "weekendDays must be integers between 0 and 6.");
  }

  if (payload.taxSlabs && !Array.isArray(payload.taxSlabs)) {
    throw new ApiError(400, "taxSlabs must be an array.");
  }

  const existing = await Organization.findOne();
  const before = existing ? serializeOrg(existing) : null;
  const org = existing ?? new Organization({ companyName: "My Company" });

  Object.assign(org, payload);
  await org.save();

  await audit(req.user, existing ? "org.update" : "org.create", "organization", String(org._id), {
    before,
    after: serializeOrg(org.toObject()),
  }, req);

  res.json({ org: serializeOrg(org.toObject()) });
});
