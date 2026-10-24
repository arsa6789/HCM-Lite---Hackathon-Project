import test from "node:test";
import assert from "node:assert/strict";
import { countPayrollAttendance } from "../src/utils/payrollEngine.js";
import { validateToolArguments } from "../src/services/ai/executor.js";

test("payroll counts missing working-day records as absent, but skips recorded leave", () => {
  const counts = countPayrollAttendance(
    [
      { date: "2026-10-01", status: "present" },
      { date: "2026-10-02", status: "leave" },
      { date: "2026-10-03", status: "late" },
    ],
    ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]
  );

  assert.deepEqual(counts, {
    presentDays: 1,
    lateDays: 1,
    halfDays: 0,
    absentDays: 1,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
  });
});

test("AI tool argument validation accepts a valid leave draft", () => {
  assert.deepEqual(
    validateToolArguments("draft_leave_request", {
      type: "Annual",
      start: "2026-10-26",
      end: "2026-10-27",
      reason: "Family event",
    }),
    {
      valid: true,
      value: {
        type: "Annual",
        start: "2026-10-26",
        end: "2026-10-27",
        reason: "Family event",
      },
    }
  );
});

test("AI tool argument validation rejects malformed dates and extra fields", () => {
  assert.equal(
    validateToolArguments("get_attendance_summary", { from: "2026-02-30" }).valid,
    false
  );
  assert.equal(
    validateToolArguments("get_headcount", { userId: "someone-else" }).valid,
    false
  );
});

test("AI tool argument validation enforces argument types and bounded limits", () => {
  assert.equal(validateToolArguments("search_employees", { query: 4 }).valid, false);
  assert.equal(validateToolArguments("search_employees", { limit: 21 }).valid, false);
  assert.equal(validateToolArguments("search_employees", { limit: 10 }).valid, true);
});