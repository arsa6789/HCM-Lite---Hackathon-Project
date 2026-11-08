import test from "node:test";
import assert from "node:assert/strict";
import { answerWithSiteFallback, classifyIntent, dateRangeForQuery, siteGuideReply } from "../src/services/ai/fallback.js";
import { buildSystemPrompt } from "../src/services/ai/prompt.js";
import { status } from "../src/controllers/ai.controller.js";
import { aiEnabled } from "../src/services/ai/client.js";

const actor = (role) => ({ id: "user-1", role });

 test("recognizes common site-aware intents", () => {
  assert.equal(classifyIntent("How do leave balances work?"), "leave_balance");
  assert.equal(classifyIntent("Summarize my attendance for this month"), "attendance");
  assert.equal(classifyIntent("Show payroll runs"), "payroll");
  assert.equal(classifyIntent("How many active employees?"), "headcount");
  assert.equal(classifyIntent("What tabs can I access?"), "guide");
  assert.equal(classifyIntent("What is the late arrival policy?"), "policy");
  assert.equal(classifyIntent("Where are my notifications?"), "guide");
  assert.match(siteGuideReply(actor("employee"), "Where are my notifications?"), /bell menu/i);
  assert.equal(classifyIntent("How do I filter the dashboard?"), "guide");
});

test("date ranges are deterministic and default to the current month-to-date", () => {
  const now = new Date("2026-11-08T16:00:00Z");
  assert.deepEqual(dateRangeForQuery("attendance", now), { from: "2026-11-01", to: "2026-11-08" });
  assert.deepEqual(dateRangeForQuery("last month attendance", now), { from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual(dateRangeForQuery("attendance 2026-10-01 through 2026-10-15", now), { from: "2026-10-01", to: "2026-10-15" });
  assert.deepEqual(dateRangeForQuery("attendance on 2026-10-15", now), { from: "2026-10-15", to: "2026-10-15" });
});

test("site guide gives role-aware tab and action availability without exposing records", () => {
  const hrGuide = siteGuideReply(actor("hr"), "What can I do with payroll?");
  assert.match(hrGuide, /prepare draft runs/i);
  assert.match(hrGuide, /never receives salary or payroll amounts/i);
  const employeeGuide = siteGuideReply(actor("employee"), "attendance");
  assert.match(employeeGuide, /check in\/out/i);
  assert.match(employeeGuide, /own records/i);
  assert.doesNotMatch(employeeGuide, /@/);
  const hrTabs = siteGuideReply(actor("hr"), "What tabs can I access?");
  assert.match(hrTabs, /Organization, Employees/);
  assert.doesNotMatch(hrTabs, /Audit trail/);
  assert.match(siteGuideReply(actor("admin"), "What tabs can I access?"), /Audit trail/);
});

test("AI status remains enabled and identifies the active assistant mode", async () => {
  const body = await new Promise((resolve, reject) => status({}, { json: resolve }, reject));
  assert.equal(body.enabled, true);
  assert.equal(body.mode, aiEnabled() ? "model" : "site");
  assert.equal(body.provider, aiEnabled() ? "openai-compatible" : "built-in");
  assert.ok(body.model);
});

test("personal leave balance calls only the authenticated user's scoped service", async () => {
  const calls = [];
  const result = await answerWithSiteFallback(actor("employee"), "Summarize my leave balance", {
    executeToolFn: async (...args) => {
      calls.push(args);
      return [{ name: "Annual", remaining: 4, annualDays: 14, used: 8, pending: 2, paid: true }];
    },
  });
  assert.deepEqual(calls, [[actor("employee"), "get_my_leave_balance", {}]]);
  assert.match(result.reply, /Annual: 4 remaining of 14 paid days/);
  assert.deepEqual(result.toolsUsed, ["get_my_leave_balance"]);
  assert.equal(result.draft, undefined);
});

test("leave-balance requests about another person never return the current user's balance", async () => {
  let called = false;
  const result = await answerWithSiteFallback(actor("admin"), "What is Jordan's leave balance?", {
    executeToolFn: async () => { called = true; return [{ name: "Annual", remaining: 5 }]; },
  });
  assert.equal(called, false);
  assert.match(result.reply, /only your personal leave balance/i);
});

test("employee attendance uses own-record tool and date range; admin uses scoped dashboard summary", async () => {
  const calls = [];
  const employeeResult = await answerWithSiteFallback(actor("employee"), "attendance this month", {
    now: new Date("2026-11-08T16:00:00Z"),
    executeToolFn: async (...args) => {
      calls.push(args);
      return { presentDays: 3, lateDays: 1, lateMinutes: 20 };
    },
  });
  assert.deepEqual(calls[0].slice(1), ["get_attendance_summary", { from: "2026-11-01", to: "2026-11-08" }]);
  assert.match(employeeResult.reply, /Your attendance/);
  assert.match(employeeResult.reply, /present days: 3, late days: 1, late minutes: 20/);

  const adminCalls = [];
  const adminResult = await answerWithSiteFallback(actor("admin"), "attendance this month", {
    now: new Date("2026-11-08T16:00:00Z"),
    dashboardSummaryFn: async (...args) => {
      adminCalls.push(args);
      return { scope: "org", counts: { present: 17, late: 2, halfDay: 1, absent: 0, leave: 3 }, attendanceRate: 91.5 };
    },
  });
  assert.deepEqual(adminCalls[0].slice(1), [{ from: "2026-11-01", to: "2026-11-08" }]);
  assert.match(adminResult.reply, /present: 17/);
  assert.doesNotMatch(adminResult.reply, /email|user-1/i);
});

test("employee headcount is refused and leave submissions never claim a write", async () => {
  let called = false;
  const headcount = await answerWithSiteFallback(actor("employee"), "How many employees?", {
    executeToolFn: async () => { called = true; return { total: 99 }; },
  });
  assert.equal(called, false);
  assert.match(headcount.reply, /available to Admin and HR/);

  const leaveRequest = await answerWithSiteFallback(actor("employee"), "Apply for leave tomorrow", {
    executeToolFn: async () => { called = true; return {}; },
  });
  assert.match(leaveRequest.reply, /no changes have been made/i);
  assert.equal(called, false);
  assert.deepEqual(leaveRequest.toolsUsed, []);
});

test("HR payroll output strips all amount fields; employee sees only own payslip amount", async () => {
  const payroll = {
    runs: [{ month: "2026-10", status: "finalized", employeeCount: 12, workingDays: 22, totalNet: 500000, totalGross: 700000 }],
  };
  const hr = await answerWithSiteFallback(actor("hr"), "Summarize payroll", {
    executeToolFn: async () => payroll,
  });
  assert.match(hr.reply, /12 employees/);
  assert.doesNotMatch(hr.reply, /500000|700000/);

  let payslipTarget;
  const employee = await answerWithSiteFallback(actor("employee"), "Summarize my payslip", {
    executeToolFn: async () => ({ runs: [{ month: "2026-10", status: "finalized", totalNet: 500000 }] }),
    payslipsForFn: async (user, targetUserId) => {
      payslipTarget = [user.id, targetUserId];
      return [{ month: "2026-10", status: "finalized", line: { net: 32000, currency: "PKR" } }];
    },
  });
  assert.deepEqual(payslipTarget, ["user-1", "user-1"]);
  assert.match(employee.reply, /your net PKR 32000/);
  assert.doesNotMatch(employee.reply, /500000|700000/);
});

test("system prompt consistently enforces service-scoped Admin, HR and employee data", () => {
  const hrPrompt = buildSystemPrompt({ actor: actor("hr"), org: null });
  assert.match(hrPrompt, /HR never receives salary or payroll amounts/i);
  assert.match(hrPrompt, /employee data only within the scope and fields returned by authorized services/i);
  const employeePrompt = buildSystemPrompt({ actor: actor("employee"), org: null });
  assert.match(employeePrompt, /only this authenticated user's own personal and operational data/i);
  assert.match(employeePrompt, /Never claim a leave was submitted or any other write was made/i);
});
