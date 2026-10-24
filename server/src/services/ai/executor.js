import { ApiError } from "../../utils/apiError.js";
import { isValidDayKey } from "../../utils/dates.js";
import { sanitizeForLlm } from "../../utils/sanitize.js";
import { workingDaysBetween, policySummaryForAi, getOrg } from "../orgService.js";
import { dashboardSummaryForAi } from "../dashboardService.js";
import { headcountForAi, searchEmployeesForAi } from "../employeeService.js";
import { attendanceSummaryForAi } from "../attendanceService.js";
import { leaveSummaryForAi, myLeaveBalanceForAi, balancesFor } from "../leaveService.js";
import { payrollSummaryForAi } from "../payrollService.js";
import LeaveType from "../../models/LeaveType.js";
import { ROLES } from "../../constants/roles.js";

// Tool schemas (OpenAI/OpenRouter function-calling format). The model can
// only request these; execution goes through the same scoped services the
// REST API uses, with the authenticated actor.
export const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "get_org_policy",
      description: "Get company policy: office hours, grace period, half-day rule, weekends, geofence, late policy, tax slabs and holidays.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_headcount",
      description: "Get the number of active accounts visible to the user, optionally by role.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_attendance_summary",
      description: "Get attendance counts (present, late, half-day, absent, leave, late minutes) for a date range. Employees always get their own data.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Start date YYYY-MM-DD" },
          to: { type: "string", description: "End date YYYY-MM-DD" },
          userId: { type: "string", description: "Optional user id (admin/hr only)" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_late_employees",
      description: "Get who was late most often, with counts, for a date range (admin/HR) or the user's own late count (employee).",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Start date YYYY-MM-DD" },
          to: { type: "string", description: "End date YYYY-MM-DD" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_leave_summary",
      description: "Get pending leave request counts and approved days per leave type (org view for admin/HR).",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Start date YYYY-MM-DD" },
          to: { type: "string", description: "End date YYYY-MM-DD" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_leave_balance",
      description: "Get the authenticated user's leave balances per leave type.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "Optional user id (admin only)" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_payroll_summary",
      description: "Get payroll run summaries. Admins receive amounts; HR/employees receive run metadata only.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "search_employees",
      description: "Search the employee directory by name, email or code. Never returns salary data.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search text" },
          departmentId: { type: "string", description: "Optional department id" },
          limit: { type: "number", description: "Max results (1-20)" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_leave_request",
      description: "Parse a natural-language leave request into a draft {type, start, end, reason}. The draft is NOT submitted; the user confirms it in the form.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", description: "Leave type name, e.g. Annual" },
          start: { type: "string", description: "Start date YYYY-MM-DD" },
          end: { type: "string", description: "End date YYYY-MM-DD" },
          reason: { type: "string", description: "Short reason" },
        },
        required: ["type", "start", "end"],
        additionalProperties: false,
      },
    },
  },
];

export function validateToolArguments(name, args) {
  const definition = TOOL_DEFINITIONS.find((tool) => tool.function.name === name);

  if (!definition || !args || typeof args !== "object" || Array.isArray(args)) {
    return { valid: false, error: "Invalid tool call." };
  }

  const schema = definition.function.parameters;
  const properties = schema.properties ?? {};
  const unknown = Object.keys(args).find((key) => !Object.hasOwn(properties, key));

  if (unknown) {
    return { valid: false, error: `Unexpected argument: ${unknown}.` };
  }

  for (const key of schema.required ?? []) {
    if (args[key] === undefined || args[key] === null || args[key] === "") {
      return { valid: false, error: `Missing required argument: ${key}.` };
    }
  }

  for (const [key, value] of Object.entries(args)) {
    const type = properties[key].type;
    const typeMatches = type === "string"
      ? typeof value === "string"
      : type === "number"
        ? typeof value === "number" && Number.isFinite(value)
        : true;

    if (!typeMatches) {
      return { valid: false, error: `Invalid argument type for ${key}.` };
    }

    if (type === "string") {
      const maxLength = key === "query" ? 100 : key === "reason" ? 500 : key === "type" ? 100 : 200;
      if (value.length > maxLength) {
        return { valid: false, error: `${key} must be at most ${maxLength} characters.` };
      }
    }

    if (["userId", "departmentId"].includes(key) && !/^[a-f\d]{24}$/i.test(value)) {
      return { valid: false, error: `${key} must be a valid identifier.` };
    }

    if ((key === "from" || key === "to" || key === "start" || key === "end") && !isValidDayKey(value)) {
      return { valid: false, error: `${key} must be a valid YYYY-MM-DD date.` };
    }

    if (key === "limit" && (!Number.isInteger(value) || value < 1 || value > 20)) {
      return { valid: false, error: "limit must be an integer from 1 to 20." };
    }
  }

  if (args.from && args.to && args.from > args.to || args.start && args.end && args.start > args.end) {
    return { valid: false, error: "The start date must be on or before the end date." };
  }

  return { valid: true, value: args };
}

function clean(value) {
  return sanitizeForLlm(JSON.stringify(value ?? null), 6000);
}

async function draftLeaveRequest(actor, args) {
  const type = String(args?.type ?? "").trim();

  if (!type || !isValidDayKey(args?.start) || !isValidDayKey(args?.end)) {
    return { error: "A leave type name and valid start/end dates (YYYY-MM-DD) are required." };
  }

  if (args.start > args.end) {
    return { error: "The start date must be on or before the end date." };
  }

  const leaveType = await LeaveType.findOne({
    name: { $regex: new RegExp(`^${type.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
  }).lean();

  if (!leaveType) {
    return { error: `No leave type named "${type}".` };
  }

  const org = await getOrg();

  if (!org) {
    return { error: "The organization is not configured yet." };
  }

  const days = await workingDaysBetween(org, args.start, args.end);
  const balances = await balancesFor(actor, actor.id, args.start.slice(0, 4));
  const balance = balances.find((item) => item.leaveTypeId === String(leaveType._id));

  return {
    draft: {
      type: leaveType.name,
      start: args.start,
      end: args.end,
      reason: String(args?.reason ?? "").slice(0, 500),
      days: days.length,
      leaveTypeId: String(leaveType._id),
    },
    workingDays: days.length,
    balanceRemaining: balance?.remaining ?? 0,
    message: "Draft ready. The user must confirm it in the leave form before it is submitted.",
  };
}

export async function executeTool(actor, name, args = {}) {
  try {
    switch (name) {
      case "get_org_policy":
        return await policySummaryForAi();

      case "get_headcount":
        return await headcountForAi(actor);

      case "get_attendance_summary":
        return await attendanceSummaryForAi(actor, args);

      case "get_late_employees": {
        const dashboard = await dashboardSummaryForAi(actor, { from: args?.from, to: args?.to });

        if (dashboard.scope === "self") {
          return { lateDays: dashboard.counts.late, lateMinutes: dashboard.lateMinutes };
        }

        return { topLateComers: dashboard.topLateComers };
      }

      case "get_leave_summary":
        return await leaveSummaryForAi(actor, args);

      case "get_my_leave_balance": {
        if (args?.userId && actor.role === ROLES.ADMIN) {
          return await balancesFor(actor, args.userId, String(new Date().getFullYear()));
        }

        return await myLeaveBalanceForAi(actor);
      }

      case "get_payroll_summary":
        return await payrollSummaryForAi(actor);

      case "search_employees":
        return {
          employees: await searchEmployeesForAi(actor, {
            query: String(args?.query ?? "").slice(0, 100),
            departmentId: args?.departmentId,
            limit: args?.limit,
          }),
        };

      case "draft_leave_request":
        return await draftLeaveRequest(actor, args);

      default:
        return { error: "Unknown tool." };
    }
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }

    return { error: "The tool could not complete." };
  }
}

export { clean };
