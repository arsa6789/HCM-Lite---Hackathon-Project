import { ROLES } from "../../constants/roles.js";
import { executeTool } from "./executor.js";
import { dashboardSummaryForAi } from "../dashboardService.js";
import { payslipsFor } from "../payrollService.js";
import { isValidDayKey } from "../../utils/dates.js";

const GUIDE = {
  dashboard: "Dashboard: your overview, with date and department filters (employees see their own metrics; Admin/HR see scoped organization metrics).",
  profile: "My profile: view your details and update your contact information. To change a password, use Forgot password? on the sign-in page.",
  organization: "Organization: company settings, policy, departments, designations, leave types and holidays. Admin manages settings and reference lists.",
  employees: "People directory: search and manage employee records. Admin can manage all accounts; HR can manage employee accounts. Salary amounts are Admin-only.",
  attendance: "Attendance: review daily records, working time and corrections. Employees check in/out and request corrections for their own records; Admin/HR review scoped records and corrections.",
  leave: "Leave management: employees submit or cancel their own pending requests and view their balance; Admin/HR review requests and balances within their allowed scope.",
  payroll: "Payroll: Admin/HR can prepare draft runs; only Admin can finalize or view payroll amounts. HR sees run metadata only. Employees see and download their own published payslips.",
  announcements: "Announcements: everyone can read announcements; Admin/HR can publish, Admin can manage any post, and HR authors can edit or delete their own posts.",
  audit: "Audit trail: Admin can review administrative actions and verify the audit chain.",
  assistant: "HCM assistant: ask about company policy, your leave balance, attendance, payroll or visible headcount. This built-in mode answers from the site guide and authorized summaries; it does not submit changes.",
};

const ROLE_GUIDE = {
  admin: "Admin can access organization-wide accounts and authorized summaries, including payroll amounts. Only Admin can finalize payroll.",
  hr: "HR can manage employee records and review employee attendance/leave. HR never receives salary or payroll amounts; payroll tools provide metadata only.",
  employee: "Employee access is limited to your own records and company policy. You can view your own attendance, leave balance and published payslips.",
};

const ROLE_TABS = {
  admin: "Overview, My profile, Organization, Employees, Attendance, Leave, Payroll, Announcements, Audit trail, Assistant",
  hr: "Overview, My profile, Organization, Employees, Attendance, Leave, Payroll, Announcements, Assistant",
  employee: "Overview, My profile, Attendance, Leave, Payroll, Announcements, Assistant",
};

function todayUtc(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function monthBounds(year, month) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${String(month).padStart(2, "0")}-01`, to: `${year}-${String(month).padStart(2, "0")}-${lastDay}` };
}

export function dateRangeForQuery(text, now = new Date()) {
  const today = todayUtc(now);
  const monthStart = `${today.slice(0, 7)}-01`;
  const explicitDates = [...text.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)].map((match) => match[1]).filter(isValidDayKey);

  if (explicitDates.length >= 2) {
    return { from: explicitDates[0], to: explicitDates[1] >= explicitDates[0] ? explicitDates[1] : explicitDates[0] };
  }
  if (explicitDates.length === 1) return { from: explicitDates[0], to: explicitDates[0] };
  if (/\blast\s+30\s+days\b/i.test(text)) {
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - 29);
    return { from: todayUtc(from), to: today };
  }
  if (/\blast\s+month\b/i.test(text)) {
    const year = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
    const month = now.getUTCMonth() === 0 ? 12 : now.getUTCMonth();
    return monthBounds(year, month);
  }
  if (/\bthis\s+year\b/i.test(text)) {
    return { from: `${now.getUTCFullYear()}-01-01`, to: today };
  }
  if (/\b(\d{4})-(0[1-9]|1[0-2])\b/.test(text)) {
    const [, year, month] = text.match(/\b(\d{4})-(0[1-9]|1[0-2])\b/);
    return monthBounds(Number(year), Number(month));
  }
  if (/\bthis\s+month\b/i.test(text)) return { from: monthStart, to: today };
  return { from: monthStart, to: today };
}

function normalize(text) {
  return text.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
}

export function classifyIntent(text) {
  const query = normalize(text);
  if (/\b(headcount|how many (active )?(people|employees|staff|users|accounts)|number of (employees|people|staff|accounts))\b/.test(query)) return "headcount";
  if (/\b(payroll|pay slip|payslip|salary run|pay run)\b/.test(query)) return "payroll";
  if (/\b(leave balances?|balance of (my )?leave|remaining leave|leave entitlement|my leave|leave days left)\b/.test(query)) return "leave_balance";
  if (/\b(policy|office hours|grace period|late policy|late arrival policy|half[- ]day|weekend|holiday|geofence|tax slab|leave rules|attendance rules)\b/.test(query)) return "policy";
  if (/\b(attendance|present days|late (arrival|days|minutes)|worked hours|absent days)\b/.test(query)) return "attendance";
  if (/\b(what can i do|what can you do|help|how do i|where do i|where can i|where are|which tab|what tabs|what sections|available (to|for) (me|employees|hr|admin)|role|permissions|access|dashboard|overview|profile|organization|department|designation|holiday|announcement|notification|audit|directory|csv|import|export|password|login|sign in|filter|geofence)\b/.test(query)) return "guide";
  if (/\b(request|apply|submit|book)\b/.test(query) && /\bleave\b/.test(query)) return "leave_action";
  return "unknown";
}

function compact(value) {
  if (Array.isArray(value)) return value.length ? value.map((item) => compact(item)).join("; ") : "none recorded";
  if (value && typeof value === "object") return Object.entries(value)
    .filter(([, item]) => item !== null && item !== undefined && typeof item !== "object")
    .map(([key, item]) => `${key}: ${item}`)
    .join(", ");
  return value === null || value === undefined || value === "" ? "not configured" : String(value);
}

function policyReply(policy) {
  if (!policy || policy.configured === false) return "Company policy is not configured yet, so I can’t provide policy values.";
  const parts = [];
  if (policy.companyName) parts.push(`Company: ${policy.companyName}.`);
  if (policy.officeStart || policy.officeEnd) parts.push(`Office hours: ${policy.officeStart ?? "not configured"}–${policy.officeEnd ?? "not configured"}.`);
  if (policy.graceMinutes !== undefined) parts.push(`Late grace period: ${policy.graceMinutes} minutes.`);
  if (policy.halfDayHours !== undefined) parts.push(`Half-day threshold: ${policy.halfDayHours} hours.`);
  if (policy.weekendDays?.length) {
    const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const names = policy.weekendDays.map((day) => weekdays[day]).filter(Boolean);
    if (names.length) parts.push(`Weekend days: ${names.join(", ")}.`);
  }
  if (policy.geofence?.enabled !== undefined) parts.push(`Office geofence: ${policy.geofence.enabled ? "enabled" : "disabled"}.`);
  if (policy.latePolicy) parts.push(`Late policy: ${compact(policy.latePolicy)}.`);
  if (policy.hraPct !== undefined || policy.medicalPct !== undefined) {
    const components = [];
    if (policy.hraPct !== undefined) components.push(`HRA ${policy.hraPct}%`);
    if (policy.medicalPct !== undefined) components.push(`medical ${policy.medicalPct}%`);
    parts.push(`Payroll components: ${components.join(", ")} (configured percentages).`);
  }
  if (policy.taxSlabs?.length) parts.push(`Configured progressive tax slabs: ${compact(policy.taxSlabs.slice(0, 5))}${policy.taxSlabs.length > 5 ? ", and more" : ""}.`);
  if (policy.holidays?.length) parts.push(`Configured holidays: ${policy.holidays.slice(0, 5).map((holiday) => `${holiday.name} (${holiday.date})`).join(", ")}${policy.holidays.length > 5 ? ", and more" : ""}.`);
  parts.push("Leave uses working days; configured weekends and holidays are skipped. Pending and approved days reduce the available balance, and overlapping pending/approved requests are rejected.");
  return parts.length ? parts.join(" ") : "The organization is configured, but no policy details are available.";
}

function summaryReply(data, { label, range } = {}) {
  if (!data || data.error) return data?.error ?? "I couldn’t retrieve that summary.";
  const prefix = range ? `${label} (${range.from} to ${range.to}): ` : `${label}: `;
  const counts = data.counts;
  if (data.presentDays !== undefined || data.lateDays !== undefined) {
    const fields = [
      ["present days", data.presentDays],
      ["late days", data.lateDays],
      ["half-days", data.halfDays],
      ["absent days", data.absentDays],
      ["leave days", data.leaveDays],
      ["late minutes", data.lateMinutes],
      ["worked minutes", data.workedMinutes],
    ].filter(([, value]) => value !== undefined).map(([key, value]) => `${key}: ${value}`);
    return prefix + (fields.length ? fields.join(", ") : "no attendance counts are available.");
  }
  if (counts) {
    const fields = ["present", "late", "halfDay", "absent", "leave"]
      .filter((key) => counts[key] !== undefined)
      .map((key) => `${key === "halfDay" ? "half-day" : key}: ${counts[key]}`);
    if (data.lateMinutes !== undefined) fields.push(`late minutes: ${data.lateMinutes}`);
    if (data.attendanceRate !== undefined && data.attendanceRate !== null) fields.push(`attendance rate: ${data.attendanceRate}%`);
    return prefix + (fields.length ? fields.join(", ") : "no attendance counts are available.");
  }
  if (data.total !== undefined) {
    const breakdown = data.byRole?.length ? ` (${data.byRole.map((row) => `${row.role}: ${row.count}`).join(", ")})` : "";
    return `${label}: ${data.total} active account${data.total === 1 ? "" : "s"}${breakdown}.`;
  }
  if (Array.isArray(data)) {
    return data.length ? `${label}: ${data.map((item) => `${item.name}: ${item.remaining} remaining of ${item.annualDays}${item.paid ? " paid" : " unpaid"} days (${item.used} used, ${item.pending} pending)`).join("; ")}.` : `${label}: no leave types are configured.`;
  }
  if (Array.isArray(data.runs)) {
    if (!data.runs.length) return `${label}: no records are available.`;
    return `${label}: ${data.runs.slice(0, 5).map((run) => {
      const bits = [run.month];
      if (run.status) bits[0] += ` (${run.status})`;
      if (run.employeeCount !== undefined) bits.push(`${run.employeeCount} employees`);
      if (run.workingDays !== undefined) bits.push(`${run.workingDays} working days`);
      if (run.line?.currency && run.line?.net !== undefined) bits.push(`your net ${run.line.currency} ${run.line.net}`);
      else if (run.line?.net !== undefined) bits.push(`your net ${run.line.net}`);
      if (run.currency && run.net !== undefined) bits.push(`net ${run.currency} ${run.net}`);
      else if (run.net !== undefined) bits.push(`net ${run.net}`);
      if (run.totalGross !== undefined) bits.push(`gross ${run.totalGross}`);
      if (run.totalNet !== undefined) bits.push(`net ${run.totalNet}`);
      return bits.join(", ");
    }).join("; ")}.`;
  }
  return `${label}: no summary values were returned.`;
}

export function siteGuideReply(actor, query = "") {
  const q = normalize(query);
  if (/\b(which tab|what tabs|what sections|available (to|for) me|what can you do|help|permissions|access)\b/.test(q) || /^what can i do\??$/.test(q)) {
    return `Your available tabs: ${ROLE_TABS[actor.role] ?? ROLE_TABS.employee}. ${ROLE_GUIDE[actor.role] ?? ""}`.trim();
  }
  if (/\b(dashboard|overview|filter|filters|date range)\b/.test(q)) return `${GUIDE.dashboard} ${ROLE_GUIDE[actor.role] ?? ""}`.trim();
  if (/\b(attendance|check[- ]?in|check[- ]?out|correction)\b/.test(q)) return `${GUIDE.attendance} ${ROLE_GUIDE[actor.role] ?? ""}`.trim();
  if (/\b(leave|balance|request)\b/.test(q)) return `${GUIDE.leave} ${ROLE_GUIDE[actor.role] ?? ""}`.trim();
  if (/\b(payroll|salary|payslip|pay slip)\b/.test(q)) return `${GUIDE.payroll} ${ROLE_GUIDE[actor.role] ?? ""}`.trim();
  if (/\b(employee|people|directory|profile|account|csv|import|export)\b/.test(q)) return `${GUIDE.employees} ${GUIDE.profile} ${ROLE_GUIDE[actor.role] ?? ""}`.trim();
  if (/\b(password|sign in|login|account recovery)\b/.test(q)) return GUIDE.profile;
  if (/\b(notification|notifications)\b/.test(q)) return "Notifications appear in the bell menu in the top bar. Choose a notification to open its related section; unread items can be marked read individually or together.";
  if (/\b(announcement|post)\b/.test(q)) return `${GUIDE.announcements} ${ROLE_GUIDE[actor.role] ?? ""}`.trim();
  if (/\b(audit)\b/.test(q)) return `${GUIDE.audit} ${ROLE_GUIDE[actor.role] ?? ""}`.trim();
  if (/\b(organization|policy|department|holiday|designation)\b/.test(q)) return `${GUIDE.organization} ${ROLE_GUIDE[actor.role] ?? ""}`.trim();
  return `${Object.values(GUIDE).join(" ")} ${ROLE_GUIDE[actor.role] ?? ""}`.trim();
}

export async function answerWithSiteFallback(actor, message, {
  now = new Date(),
  executeToolFn = executeTool,
  dashboardSummaryFn = dashboardSummaryForAi,
  payslipsForFn = payslipsFor,
} = {}) {
  const intent = classifyIntent(message);
  if (intent === "guide") return { reply: siteGuideReply(actor, message), toolsUsed: [] };
  if (intent === "leave_action") {
    return {
      reply: "I can’t submit or create a leave request in built-in mode. Use Leave management to enter and submit it; no changes have been made.",
      toolsUsed: [],
    };
  }
  if (intent === "unknown") {
    return {
      reply: "I’m the built-in HCM Lite helper. Ask me about company policy, your leave balance, attendance, payroll, headcount, or where to find a site feature. I haven’t made any changes.",
      toolsUsed: [],
    };
  }
  if (intent === "headcount" && actor.role === ROLES.EMPLOYEE) {
    return { reply: "Headcount summaries are available to Admin and HR; employee access is limited to your own records.", toolsUsed: [] };
  }

  if (intent === "policy") {
    const result = await executeToolFn(actor, "get_org_policy", {});
    return { reply: policyReply(result), toolsUsed: ["get_org_policy"] };
  }
  if (intent === "leave_balance") {
    const requestedOtherPerson = /\b(another|other|someone else|his|her|their|employee)\b/.test(normalize(message))
      || /\b(?:leave balance|balance)\s+(?:for|of)\s+(?!me\b|my\b|myself\b|mine\b)[a-z][a-z'-]+\b/i.test(message)
      || /\b[a-z][a-z'-]*['’]s\s+leave balance\b/i.test(message);
    if (requestedOtherPerson) {
      return { reply: "I can provide only your personal leave balance here. Use the Leave management page to access records within your role’s permissions.", toolsUsed: [] };
    }
    const result = await executeToolFn(actor, "get_my_leave_balance", {});
    return { reply: summaryReply(result, { label: "Your leave balance" }), toolsUsed: ["get_my_leave_balance"] };
  }
  if (intent === "headcount") {
    const result = await executeToolFn(actor, "get_headcount", {});
    return { reply: summaryReply(result, { label: "Visible headcount" }), toolsUsed: ["get_headcount"] };
  }
  if (intent === "payroll") {
    let result = actor.role === ROLES.EMPLOYEE
      ? { runs: (await payslipsForFn(actor, actor.id)).map(({ month, status, line }) => ({ month, status, line })) }
      : await executeToolFn(actor, "get_payroll_summary", {});
    if (actor.role === ROLES.HR && Array.isArray(result?.runs)) {
      result = {
        runs: result.runs.map(({ month, status, employeeCount, workingDays }) => ({
          month,
          status,
          employeeCount,
          workingDays,
        })),
      };
    }
    const label = actor.role === ROLES.ADMIN ? "Finalized payroll summaries" : actor.role === ROLES.HR ? "Payroll run summaries (amounts hidden)" : "Your published payslips";
    const toolName = "get_payroll_summary";
    return { reply: summaryReply(result, { label }), toolsUsed: [toolName] };
  }
  if (intent === "attendance") {
    const range = dateRangeForQuery(message, now);
    if (actor.role === ROLES.EMPLOYEE) {
      const result = await executeToolFn(actor, "get_attendance_summary", range);
      return { reply: summaryReply(result, { label: "Your attendance", range }), toolsUsed: ["get_attendance_summary"] };
    }
    const result = await dashboardSummaryFn(actor, range);
    return { reply: summaryReply(result, { label: "Visible employee attendance", range }), toolsUsed: ["get_attendance_summary"] };
  }

  return { reply: siteGuideReply(actor, message), toolsUsed: [] };
}
