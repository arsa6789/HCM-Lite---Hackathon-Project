import test from "node:test";
import assert from "node:assert/strict";
import { validateCorrectionInput } from "../src/utils/attendanceValidation.js";
import { normalizeAnnouncementAudience, normalizeAnnouncementContent, normalizeAnnouncementUpdate, canManageAnnouncement } from "../src/utils/announcementRules.js";
import { validatePayrollMonth } from "../src/utils/payrollValidation.js";

function isBadRequest(error) {
  return error?.status === 400;
}

test("attendance correction requires a nonblank bounded reason", () => {
  assert.throws(() => validateCorrectionInput({ reason: "   " }), isBadRequest);
  assert.throws(() => validateCorrectionInput({ reason: "x".repeat(501) }), isBadRequest);

  assert.deepEqual(
    validateCorrectionInput({ reason: "  Forgot to check out  " }),
    { reason: "Forgot to check out", newCheckInAt: null, newCheckOutAt: null }
  );
});

test("attendance correction rejects invalid timestamps and impossible chronology", () => {
  assert.throws(() => validateCorrectionInput({ reason: "Fix", newCheckInAt: "not-a-date" }), isBadRequest);
  assert.throws(() => validateCorrectionInput({ reason: "Fix", newCheckInAt: "2026-02-30T09:00:00Z" }), isBadRequest);
  assert.throws(() => validateCorrectionInput({
    reason: "Fix",
    newCheckInAt: "2026-10-12T18:00:00Z",
    newCheckOutAt: "2026-10-12T17:00:00Z",
  }), isBadRequest);
  assert.throws(() => validateCorrectionInput(
    { reason: "Fix", newCheckInAt: "2026-10-12T18:00:00Z" },
    { checkOutAt: new Date("2026-10-12T17:00:00Z") }
  ), isBadRequest);

  const valid = validateCorrectionInput({
    reason: "Fix",
    newCheckInAt: "2026-10-12T09:00:00Z",
    newCheckOutAt: "2026-10-12T17:00:00Z",
  });
  assert.equal(valid.newCheckInAt.toISOString(), "2026-10-12T09:00:00.000Z");
  assert.equal(valid.newCheckOutAt.toISOString(), "2026-10-12T17:00:00.000Z");
});

test("payroll month validation reports invalid months and blocks future runs", () => {
  assert.throws(
    () => validatePayrollMonth("2026-13", new Date("2026-10-15T12:00:00Z")),
    (error) => isBadRequest(error) && /valid calendar month in YYYY-MM format/.test(error.message)
  );
  assert.throws(
    () => validatePayrollMonth("2026-11", new Date("2026-10-15T12:00:00Z")),
    (error) => isBadRequest(error) && /future month 2026-11/.test(error.message)
  );
  assert.deepEqual(validatePayrollMonth("2026-10", new Date("2026-10-15T12:00:00Z")), {
    fromKey: "2026-10-01",
    toKey: "2026-10-31",
  });
});

test("announcement inputs require text and validate audience types and roles", () => {
  assert.throws(() => normalizeAnnouncementContent("  ", "Message"), isBadRequest);
  assert.throws(() => normalizeAnnouncementContent("Title", "\n  \n"), isBadRequest);
  assert.throws(() => normalizeAnnouncementUpdate({ body: "  " }), isBadRequest);
  assert.throws(() => normalizeAnnouncementUpdate(null), isBadRequest);
  assert.throws(() => normalizeAnnouncementAudience({ type: "everyone" }), isBadRequest);
  assert.throws(() => normalizeAnnouncementAudience({ type: "role", role: "root" }), isBadRequest);
  assert.throws(() => normalizeAnnouncementAudience({ type: "department", departmentId: "" }), isBadRequest);

  assert.deepEqual(normalizeAnnouncementAudience({ type: "role", role: "hr" }), {
    type: "role",
    role: "hr",
    departmentId: null,
  });
  assert.deepEqual(normalizeAnnouncementAudience(), { type: "all", role: null, departmentId: null });
  assert.deepEqual(normalizeAnnouncementUpdate({ title: "  Updated title  " }), { title: "Updated title" });
});

test("only admins manage all announcements; HR manage their own; employees manage none", () => {
  const announcement = { createdBy: "hr-1" };

  assert.equal(canManageAnnouncement({ id: "admin-1", role: "admin" }, announcement), true);
  assert.equal(canManageAnnouncement({ id: "hr-1", role: "hr" }, announcement), true);
  assert.equal(canManageAnnouncement({ id: "hr-2", role: "hr" }, announcement), false);
  assert.equal(canManageAnnouncement({ id: "hr-1", role: "employee" }, announcement), false);
});
