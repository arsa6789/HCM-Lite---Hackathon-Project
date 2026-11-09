import test from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../src/utils/apiError.js";
import { validateOrganizationUpdate } from "../src/utils/orgValidation.js";

const current = {
  companyName: "Acme",
  officeStart: "09:00",
  officeEnd: "17:00",
  graceMinutes: 15,
  halfDayHours: 6,
  weekendDays: [0, 6],
  currency: "PKR",
  hraPct: 40,
  medicalPct: 10,
  geofence: { enabled: false, lat: null, lng: null, radiusMeters: 500 },
  latePolicy: { deductionPerLatePct: 1.6, latesEqualToAbsent: 3 },
  taxSlabs: [],
};

function expectBad(payload, message) {
  assert.throws(() => validateOrganizationUpdate(payload, current), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 400);
    if (message) assert.match(error.message, message);
    return true;
  });
}

test("organization settings accept partial updates and merge nested policies safely", () => {
  const update = validateOrganizationUpdate({
    companyName: "  Example Ltd  ",
    latePolicy: { deductionPerLatePct: 2.5 },
    geofence: { enabled: true, lat: 24.86, lng: 67.01 },
  }, current);

  assert.deepEqual(update, {
    companyName: "Example Ltd",
    latePolicy: { deductionPerLatePct: 2.5, latesEqualToAbsent: 3 },
    geofence: { enabled: true, lat: 24.86, lng: 67.01, radiusMeters: 500 },
  });
  assert.equal(Object.hasOwn(update, "currency"), false);
  assert.deepEqual(
    validateOrganizationUpdate({ currency: "USD" }, { ...current, officeEnd: "invalid legacy value" }),
    { currency: "USD" }
  );
});

test("organization settings reject empty, non-object, and unauthorized top-level payloads", () => {
  expectBad({}, /at least one organization setting/i);
  expectBad(null, /JSON object/i);
  assert.throws(() => validateOrganizationUpdate({ role: "admin" }, current), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 403);
    assert.match(error.message, /cannot set these fields: role/i);
    return true;
  });
});

test("office-hour and numeric policy values are strictly bounded", () => {
  expectBad({ officeStart: "9:00" }, /HH:mm/i);
  expectBad({ officeStart: "18:00" }, /officeEnd.*later/i);
  expectBad({ officeEnd: "08:00" }, /officeEnd.*later/i);
  expectBad({ graceMinutes: -1 }, /graceMinutes/i);
  expectBad({ graceMinutes: 2.5 }, /graceMinutes/i);
  expectBad({ halfDayHours: 0 }, /halfDayHours/i);
  expectBad({ halfDayHours: 9 }, /office-hours duration/i);
  expectBad({ hraPct: 100.1 }, /hraPct/i);
  expectBad({ medicalPct: -0.1 }, /medicalPct/i);
  expectBad({ latePolicy: { deductionPerLatePct: 101 } }, /deductionPerLatePct/i);
  expectBad({ latePolicy: { latesEqualToAbsent: 0 } }, /latesEqualToAbsent/i);
});

test("currency and weekend days must use supported formats without duplicates", () => {
  expectBad({ currency: "usd" }, /uppercase ISO currency/i);
  expectBad({ currency: "USDX" }, /currency/i);
  expectBad({ weekendDays: [0, 0] }, /duplicate/i);
  expectBad({ weekendDays: [7] }, /weekendDays/i);
  expectBad({ weekendDays: ["0"] }, /weekendDays/i);
  assert.deepEqual(validateOrganizationUpdate({ weekendDays: [] }, current), { weekendDays: [] });
});

test("geofence settings validate nested keys, coordinate pairs, bounds, and radius", () => {
  expectBad({ geofence: { enabled: true } }, /requires both latitude and longitude/i);
  expectBad({ geofence: { enabled: false, lat: 91, lng: 0 } }, /geofence\.lat/i);
  expectBad({ geofence: { lat: 10 } }, /both be set/i);
  expectBad({ geofence: { enabled: "yes" } }, /enabled.*boolean/i);
  expectBad({ geofence: { radiusMeters: 0 } }, /radiusMeters/i);
  expectBad({ geofence: { radiusMeters: 20.5 } }, /radiusMeters/i);
  expectBad({ geofence: { officeId: "x" } }, /unsupported field/i);
  assert.deepEqual(
    validateOrganizationUpdate({ geofence: { lat: 0, lng: 0 } }, current).geofence,
    { enabled: false, lat: 0, lng: 0, radiusMeters: 500 }
  );
});

test("tax slabs require ordered numeric thresholds, bounded rates, and a final open-ended slab", () => {
  expectBad({ taxSlabs: [{ upTo: 5000 }] }, /ratePct/i);
  expectBad({ taxSlabs: [{ upTo: 5000, ratePct: 10 }, { upTo: 4000, ratePct: 20 }] }, /upTo/i);
  expectBad({ taxSlabs: [{ upTo: 5000, ratePct: 101 }] }, /ratePct/i);
  expectBad({ taxSlabs: [{ upTo: null, ratePct: 10 }, { upTo: 5000, ratePct: 20 }] }, /final slab/i);
  expectBad({ taxSlabs: [{ upTo: "5000", ratePct: 10 }] }, /upTo/i);
  expectBad({ taxSlabs: [{ upTo: null, ratePct: 10, extra: true }] }, /unsupported field/i);
  assert.doesNotThrow(() => validateOrganizationUpdate({
    taxSlabs: [{ upTo: 5000, ratePct: 10 }, { upTo: null, ratePct: 20 }],
  }, current));
});
