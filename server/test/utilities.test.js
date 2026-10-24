import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { serializeDirectoryUser, serializePayrollLine, serializeProfile, PAYROLL_AMOUNT_KEYS } from "../src/access/policies.js";
import { evaluateCheckIn, evaluateCheckOut } from "../src/utils/attendanceRules.js";
import { computeAuditHash, ZERO_HASH } from "../src/utils/audit.js";
import { parseCsv, rowsToObjects, toCsv } from "../src/utils/csv.js";
import { eachDayKey, haversineMeters, isValidDayKey, minutesBetween, monthRange } from "../src/utils/dates.js";
import { createRateLimiter } from "../src/utils/rateLimit.js";
import { sanitizeForLlm, sanitizeText, metaForAudit } from "../src/utils/sanitize.js";
import { computePayrollLine, computeProgressiveTax, countPayrollAttendance } from "../src/utils/payrollEngine.js";
import { buildPayslipPdf } from "../src/utils/pdf.js";

test("salary serializers redact amounts from every HR read path", () => {
  const user = { _id: "u1", id: "u1", email: "person@example.com", role: "employee", salary: { basic: 5000, allowance: 500, currency: "PKR" } };
  const line = { userId: "u1", basic: 5000, allowance: 500, gross: 6000, net: 5500, currency: "PKR" };

  assert.equal("salary" in serializeDirectoryUser(user, { id: "hr1", role: "hr" }), false);
  assert.equal("salary" in serializeProfile(user, { id: "hr1", role: "hr" }), false);
  assert.equal("salary" in serializeProfile(user, { id: "u1", role: "employee" }), false);
  assert.equal(PAYROLL_AMOUNT_KEYS.some((key) => key in serializePayrollLine(line, { id: "hr1", role: "hr" })), false);
  assert.equal(PAYROLL_AMOUNT_KEYS.every((key) => key in serializePayrollLine(line, { id: "u1", role: "employee" })), true);
  assert.equal(serializeDirectoryUser(user, { id: "a1", role: "admin" }).salary.basic, 5000);
});

test("attendance rules apply grace and half-day thresholds", () => {
  assert.deepEqual(evaluateCheckIn({ nowMinutes: 555, officeStartMinutes: 540, graceMinutes: 15 }), { status: "present", minutesLate: 0 });
  assert.deepEqual(evaluateCheckIn({ nowMinutes: 556, officeStartMinutes: 540, graceMinutes: 15 }), { status: "late", minutesLate: 1 });
  assert.deepEqual(evaluateCheckOut({ previousStatus: "late", workedMinutes: 300, halfDayHours: 6 }), { status: "half_day" });
  assert.deepEqual(evaluateCheckOut({ previousStatus: "late", workedMinutes: 360, halfDayHours: 6 }), { status: "late" });
});

test("payroll formulas apply attendance deductions and progressive tax", () => {
  const line = computePayrollLine({
    basic: 10000,
    allowance: 1000,
    hraPct: 40,
    medicalPct: 10,
    workingDays: 20,
    attendance: { absentDays: 2, halfDays: 1, unpaidLeaveDays: 1, lateDays: 4 },
    latePolicy: { deductionPerLatePct: 1.6, latesEqualToAbsent: 3 },
    taxSlabs: [{ upTo: 5000, ratePct: 10 }, { upTo: null, ratePct: 20 }],
  });

  assert.equal(line.gross, 16000);
  assert.equal(line.absentDeduction, 1600);
  assert.equal(line.halfDayDeduction, 400);
  assert.equal(line.unpaidLeaveDeduction, 800);
  assert.equal(line.lateDeduction, 1024);
  assert.equal(line.extraUnpaidDeduction, 800);
  assert.equal(line.tax, 1775.2);
  assert.equal(line.net, 9600.8);
  assert.equal(computeProgressiveTax(10000, [{ upTo: 5000, ratePct: 10 }, { upTo: null, ratePct: 20 }]), 1500);
});

test("payroll treats missing working-day attendance as absent and leaves as leave", () => {
  assert.deepEqual(countPayrollAttendance([{ date: "2026-02-02", status: "leave" }], ["2026-02-02", "2026-02-03"]), {
    presentDays: 0,
    lateDays: 0,
    halfDays: 0,
    absentDays: 1,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
  });
});

test("rate limiter enforces per-key sliding windows and expiry", () => {
  let now = 1000;
  const limiter = createRateLimiter({ windowMs: 1000, max: 2, now: () => now });
  assert.equal(limiter.check("one").ok, true);
  assert.equal(limiter.check("one").ok, true);
  assert.equal(limiter.check("one").retryAfterMs, 1000);
  assert.equal(limiter.check("two").ok, true);
  now += 1001;
  assert.equal(limiter.check("one").ok, true);
});

test("sanitizers clamp and remove control or invisible characters", () => {
  assert.equal(sanitizeText(" hello\nworld\0 "), "hello world");
  assert.equal(sanitizeForLlm("ignore\u202E rules\u200B", 100), "ignore rules");
  assert.equal(metaForAudit({ password: "secret", nested: { token: "abc" } }), '{"password":"[redacted]","nested":{"token":"[redacted]"}}');
});

test("CSV handles quotes, commas, newlines, and round-trips", () => {
  const rows = [["email", "fullName", "note"], ["a@example.com", 'Jane "J" Doe', "first line\nsecond line, ok"]];
  const encoded = toCsv(rows);
  assert.deepEqual(parseCsv(encoded), rows);
  assert.deepEqual(rowsToObjects(parseCsv(encoded)), [{ __row: 2, email: "a@example.com", fullName: 'Jane "J" Doe', note: "first line\nsecond line, ok" }]);
  assert.throws(() => parseCsv('name,"unterminated'), /unterminated quoted field/i);
  assert.throws(() => parseCsv('name,value\nJane,"quoted"tail'), /after closing quote/i);
  assert.throws(() => parseCsv("a\n1\n2", { maxRows: 2 }), /limited to 2 rows/i);
});

test("date helpers reject malformed dates and count ranges", () => {
  assert.equal(isValidDayKey("2024-02-29"), true);
  assert.equal(isValidDayKey("2025-02-29"), false);
  assert.deepEqual(eachDayKey("2026-03-01", "2026-03-03"), ["2026-03-01", "2026-03-02", "2026-03-03"]);
  assert.deepEqual(monthRange("2026-02"), { fromKey: "2026-02-01", toKey: "2026-02-28" });
  assert.equal(monthRange("2026-13"), null);
  assert.equal(minutesBetween(new Date("2026-01-01T09:00:00Z"), new Date("2026-01-01T10:30:00Z")), 90);
  assert.equal(haversineMeters(0, 0, 0, 1), 111195);
});

test("audit hashes detect changes to canonical entry fields", () => {
  const entry = { seq: 1, at: new Date("2026-01-01T00:00:00Z"), actorId: "a1", actorRole: "admin", action: "user.update", entity: "user", entityId: "u1", meta: "{}", ip: "127.0.0.1", prevHash: ZERO_HASH };
  const hash = computeAuditHash(ZERO_HASH, entry);
  const expected = crypto.createHash("sha256").update(ZERO_HASH).update(JSON.stringify({
    seq: entry.seq,
    at: entry.at,
    actorId: entry.actorId,
    actorRole: entry.actorRole,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    meta: entry.meta,
    ip: entry.ip,
  })).digest("hex");
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hash, expected);
  assert.notEqual(computeAuditHash(ZERO_HASH, { ...entry, action: "user.delete" }), hash);
});

test("payslip PDF generation produces a PDF document", async () => {
  const pdf = await buildPayslipPdf({
    org: { companyName: "HCM Test", currency: "PKR" },
    run: { month: "2026-10", status: "finalized", workingDays: 22 },
    line: { basic: 10000, allowance: 1000, hra: 4000, medical: 1000, gross: 16000, absentDeduction: 0, halfDayDeduction: 0, unpaidLeaveDeduction: 0, lateDeduction: 0, extraUnpaidDeduction: 0, tax: 0, totalDeductions: 0, net: 16000, currency: "PKR" },
    employee: { email: "person@example.com", fullName: "Test Employee" },
  });

  assert.equal(Buffer.isBuffer(pdf), true);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
});
