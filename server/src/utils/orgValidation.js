import { ApiError } from "./apiError.js";
import { hhmmToMinutes } from "./dates.js";

const ORG_FIELDS = new Set([
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
]);
const GEOFENCE_FIELDS = new Set(["enabled", "lat", "lng", "radiusMeters"]);
const LATE_POLICY_FIELDS = new Set(["deductionPerLatePct", "latesEqualToAbsent"]);
const TAX_SLAB_FIELDS = new Set(["upTo", "ratePct"]);

function fail(field, requirement) {
  throw new ApiError(400, `${field} ${requirement}.`);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertOnlyFields(value, allowed, field) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) {
    fail(field, `contains unsupported field${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`);
  }
}

function assertNumber(value, field, { min, max, integer = false, minExclusive = false } = {}) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (integer && !Number.isInteger(value)) ||
    (minExclusive ? value <= min : value < min) ||
    value > max
  ) {
    const lower = minExclusive ? `greater than ${min}` : `at least ${min}`;
    fail(field, `must be a finite${integer ? " integer" : " number"} ${lower} and at most ${max}`);
  }
}

function validateOfficeHours(value, field) {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) || hhmmToMinutes(value) == null) {
    fail(field, "must be a valid 24-hour time in HH:mm format");
  }
}

function validateGeofencePatch(patch, current = {}) {
  if (!isRecord(patch)) fail("geofence", "must be an object");
  assertOnlyFields(patch, GEOFENCE_FIELDS, "geofence");
  if (Object.keys(patch).length === 0) fail("geofence", "must contain at least one setting");

  const merged = { ...current, ...patch };
  if ("enabled" in patch && typeof patch.enabled !== "boolean") {
    fail("geofence.enabled", "must be a boolean");
  }
  for (const coordinate of ["lat", "lng"]) {
    if (!(coordinate in merged)) continue;
    const value = merged[coordinate];
    if (value !== null) {
      const bound = coordinate === "lat" ? 90 : 180;
      assertNumber(value, `geofence.${coordinate}`, { min: -bound, max: bound });
    }
  }
  if ("radiusMeters" in merged) {
    assertNumber(merged.radiusMeters, "geofence.radiusMeters", { min: 1, max: 100000, integer: true });
  }
  const hasLat = merged.lat != null;
  const hasLng = merged.lng != null;
  if (hasLat !== hasLng) {
    fail("geofence.lat and geofence.lng", "must both be set to coordinates or both be null");
  }
  if (merged.enabled && (!hasLat || !hasLng)) {
    fail("geofence", "requires both latitude and longitude when enabled");
  }
  return merged;
}

function validateLatePolicyPatch(patch, current = {}) {
  if (!isRecord(patch)) fail("latePolicy", "must be an object");
  assertOnlyFields(patch, LATE_POLICY_FIELDS, "latePolicy");
  if (Object.keys(patch).length === 0) fail("latePolicy", "must contain at least one setting");

  const merged = { ...current, ...patch };
  if ("deductionPerLatePct" in merged) {
    assertNumber(merged.deductionPerLatePct, "latePolicy.deductionPerLatePct", { min: 0, max: 100 });
  }
  if ("latesEqualToAbsent" in merged) {
    assertNumber(merged.latesEqualToAbsent, "latePolicy.latesEqualToAbsent", { min: 1, max: 365, integer: true });
  }
  return merged;
}

function validateTaxSlabs(slabs) {
  if (!Array.isArray(slabs)) fail("taxSlabs", "must be an array");
  if (slabs.length > 100) fail("taxSlabs", "must contain no more than 100 slabs");

  let previousUpperBound = 0;
  for (let index = 0; index < slabs.length; index += 1) {
    const slab = slabs[index];
    const field = `taxSlabs[${index}]`;
    if (!isRecord(slab)) fail(field, "must be an object with upTo and ratePct");
    assertOnlyFields(slab, TAX_SLAB_FIELDS, field);
    if (!("upTo" in slab) || !("ratePct" in slab)) {
      fail(field, "must include both upTo and ratePct");
    }
    if (slab.upTo === null) {
      if (index !== slabs.length - 1) fail(`${field}.upTo`, "may be null only for the final slab");
    } else {
      assertNumber(slab.upTo, `${field}.upTo`, { min: previousUpperBound, max: Number.MAX_SAFE_INTEGER, minExclusive: true });
      previousUpperBound = slab.upTo;
    }
    assertNumber(slab.ratePct, `${field}.ratePct`, { min: 0, max: 100 });
  }
}

/** Validate only supplied top-level settings, using current values to safely merge nested patches. */
export function validateOrganizationUpdate(payload, current = {}) {
  if (!isRecord(payload)) {
    throw new ApiError(400, "Organization settings must be provided as a JSON object.");
  }

  const denied = Object.keys(payload).filter((field) => !ORG_FIELDS.has(field));
  if (denied.length) {
    throw new ApiError(403, `You cannot set these fields: ${denied.join(", ")}.`);
  }
  if (Object.keys(payload).length === 0) {
    throw new ApiError(400, "Provide at least one organization setting to update.");
  }

  const update = { ...payload };
  if ("companyName" in update) {
    if (typeof update.companyName !== "string" || !update.companyName.trim() || update.companyName.trim().length > 120) {
      fail("companyName", "must be a non-empty string of at most 120 characters");
    }
    update.companyName = update.companyName.trim();
  }
  for (const field of ["officeStart", "officeEnd"]) {
    if (field in update) validateOfficeHours(update[field], field);
  }
  if ("graceMinutes" in update) {
    assertNumber(update.graceMinutes, "graceMinutes", { min: 0, max: 1440, integer: true });
  }
  if ("halfDayHours" in update) {
    assertNumber(update.halfDayHours, "halfDayHours", { min: 0, max: 24, minExclusive: true });
  }
  if ("currency" in update && (typeof update.currency !== "string" || !/^[A-Z]{3}$/.test(update.currency))) {
    fail("currency", "must be a three-letter uppercase ISO currency code");
  }
  for (const field of ["hraPct", "medicalPct"]) {
    if (field in update) assertNumber(update[field], field, { min: 0, max: 100 });
  }
  if ("weekendDays" in update) {
    const days = update.weekendDays;
    if (!Array.isArray(days) || days.length > 7 || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
      fail("weekendDays", "must be an array of integers between 0 and 6");
    }
    if (new Set(days).size !== days.length) fail("weekendDays", "must not contain duplicate days");
  }
  if ("geofence" in update) update.geofence = validateGeofencePatch(update.geofence, current.geofence);
  if ("latePolicy" in update) update.latePolicy = validateLatePolicyPatch(update.latePolicy, current.latePolicy);
  if ("taxSlabs" in update) validateTaxSlabs(update.taxSlabs);

  if (["officeStart", "officeEnd", "halfDayHours"].some((field) => field in update)) {
    const start = update.officeStart ?? current.officeStart;
    const end = update.officeEnd ?? current.officeEnd;
    if (start != null && end != null) {
      validateOfficeHours(start, "officeStart");
      validateOfficeHours(end, "officeEnd");
      if (hhmmToMinutes(start) >= hhmmToMinutes(end)) {
        fail("officeEnd", "must be later than officeStart on the same day");
      }
      const halfDayHours = update.halfDayHours ?? current.halfDayHours;
      if (halfDayHours != null && halfDayHours > (hhmmToMinutes(end) - hhmmToMinutes(start)) / 60) {
        fail("halfDayHours", "must not exceed the configured office-hours duration");
      }
    }
  }

  return update;
}
