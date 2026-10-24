import PayrollRun from "../models/PayrollRun.js";
import User from "../models/User.js";
import Department from "../models/Department.js";
import Attendance from "../models/Attendance.js";
import LeaveApplication from "../models/LeaveApplication.js";
import LeaveType from "../models/LeaveType.js";
import { ATTENDANCE_STATUS, LEAVE_STATUS, PAYROLL_STATUS, EMPLOYMENT_STATUS } from "../constants/statuses.js";
import { ROLES } from "../constants/roles.js";
import { ApiError } from "../utils/apiError.js";
import { round2, computePayrollLine, countPayrollAttendance } from "../utils/payrollEngine.js";
import { monthRange } from "../utils/dates.js";
import { workingDaysBetween } from "./orgService.js";
import { serializePayrollRun, serializePayrollLine } from "../access/policies.js";
import { notifyUsers } from "../utils/notify.js";
import { buildPayslipPdf } from "../utils/pdf.js";
import { getOrg } from "./orgService.js";
import { canAccessRecord } from "../access/scope.js";
import mongoose from "mongoose";

function assertObjectId(value, field) {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new ApiError(400, `Invalid ${field}.`);
  }
}

function actorIsPrivileged(actor) {
  return actor.role === ROLES.ADMIN || actor.role === ROLES.HR;
}

export async function createRun(actor, month) {
  if (!actorIsPrivileged(actor)) {
    throw new ApiError(403, "Only admin or HR can prepare payroll runs.");
  }

  const range = monthRange(month);

  if (!range) {
    throw new ApiError(400, "Month must be in YYYY-MM format.");
  }

  const org = await getOrg();

  if (!org) {
    throw new ApiError(400, "Organization is not configured.");
  }

  const existing = await PayrollRun.findOne({ month });

  if (existing) {
    throw new ApiError(409, `A payroll run for ${month} already exists.`);
  }

  const workingDayKeys = await workingDaysBetween(org, range.fromKey, range.toKey);
  const employees = await User.find({
    role: ROLES.EMPLOYEE,
    employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
  })
    .select("email fullName departmentId salary")
    .lean();

  const leaveTypes = await LeaveType.find().lean();
  const paidLeaveTypeIds = leaveTypes.filter((type) => type.paid).map((type) => String(type._id));

  const lines = [];

  for (const employee of employees) {
    const records = await Attendance.find({
      userId: employee._id,
      date: { $gte: range.fromKey, $lte: range.toKey },
    }).lean();

    const attendance = countPayrollAttendance(records, workingDayKeys);

    const leaveApps = await LeaveApplication.find({
      userId: employee._id,
      status: LEAVE_STATUS.APPROVED,
      fromDate: { $lte: range.toKey },
      toDate: { $gte: range.fromKey },
    }).lean();

    for (const app of leaveApps) {
      const days = (await workingDaysBetween(org, maxKey(app.fromDate, range.fromKey), minKey(app.toDate, range.toKey))).length;

      if (paidLeaveTypeIds.includes(String(app.leaveTypeId))) {
        attendance.paidLeaveDays += days;
      } else {
        attendance.unpaidLeaveDays += days;
      }
    }

    const amounts = computePayrollLine({
      basic: employee.salary?.basic ?? 0,
      allowance: employee.salary?.allowance ?? 0,
      hraPct: org.hraPct,
      medicalPct: org.medicalPct,
      workingDays: workingDayKeys.length,
      attendance,
      latePolicy: org.latePolicy,
      taxSlabs: org.taxSlabs,
    });

    lines.push({
      userId: employee._id,
      departmentId: employee.departmentId ?? null,
      ...attendance,
      ...amounts,
      currency: employee.salary?.currency ?? org.currency,
    });
  }

  const summary = {
    employeeCount: lines.length,
    workingDays: workingDayKeys.length,
    totalGross: round2(lines.reduce((sum, line) => sum + line.gross, 0)),
    totalDeductions: round2(lines.reduce((sum, line) => sum + line.totalDeductions, 0)),
    totalTax: round2(lines.reduce((sum, line) => sum + line.tax, 0)),
    totalNet: round2(lines.reduce((sum, line) => sum + line.net, 0)),
  };

  const run = await PayrollRun.create({
    month,
    status: PAYROLL_STATUS.DRAFT,
    workingDays: workingDayKeys.length,
    lines,
    summary,
    preparedBy: actor.id,
  });

  return run;
}

function maxKey(a, b) {
  return a > b ? a : b;
}

function minKey(a, b) {
  return a < b ? a : b;
}

export async function listRuns(actor) {
  if (!actorIsPrivileged(actor)) {
    throw new ApiError(403, "Only admin or HR can view payroll runs.");
  }

  const runs = await PayrollRun.find().sort({ month: -1 }).select("-lines").lean();
  return runs.map((run) => {
    if (actor.role !== ROLES.ADMIN) {
      return {
        id: String(run._id),
        month: run.month,
        status: run.status,
        workingDays: run.workingDays,
        employeeCount: run.summary?.employeeCount ?? 0,
        preparedBy: run.preparedBy ? String(run.preparedBy) : null,
        finalizedBy: run.finalizedBy ? String(run.finalizedBy) : null,
      };
    }

    return {
      id: String(run._id),
      month: run.month,
      status: run.status,
      workingDays: run.workingDays,
      employeeCount: run.summary?.employeeCount ?? 0,
      summary: run.summary,
      preparedBy: run.preparedBy ? String(run.preparedBy) : null,
      finalizedBy: run.finalizedBy ? String(run.finalizedBy) : null,
    };
  });
}

export async function getRun(actor, runId) {
  if (!actorIsPrivileged(actor)) {
    throw new ApiError(403, "Only admin or HR can view payroll runs.");
  }

  assertObjectId(runId, "run id");
  const run = await PayrollRun.findById(runId).lean();

  if (!run) {
    throw new ApiError(404, "Payroll run not found.");
  }

  return serializePayrollRun(run, actor);
}

export async function finalizeRun(actor, runId) {
  if (actor.role !== ROLES.ADMIN) {
    throw new ApiError(403, "Only an admin can finalize payroll runs.");
  }

  assertObjectId(runId, "run id");
  const run = await PayrollRun.findById(runId);

  if (!run) {
    throw new ApiError(404, "Payroll run not found.");
  }

  if (run.status === PAYROLL_STATUS.FINALIZED) {
    throw new ApiError(409, "This payroll run is already finalized.");
  }

  run.status = PAYROLL_STATUS.FINALIZED;
  run.finalizedBy = actor.id;
  await run.save();

  await notifyUsers(run.lines.map((line) => line.userId), {
    title: `Payslip available for ${run.month}`,
    body: "Your payslip has been published. You can download it from the payroll page.",
    type: "payroll",
    link: "/console/payroll",
  });

  return serializePayrollRun(run.toObject(), actor);
}

export async function deleteRun(actor, runId) {
  if (!actorIsPrivileged(actor)) {
    throw new ApiError(403, "Only admin or HR can delete payroll runs.");
  }

  assertObjectId(runId, "run id");
  const run = await PayrollRun.findById(runId);

  if (!run) {
    throw new ApiError(404, "Payroll run not found.");
  }

  if (run.status !== PAYROLL_STATUS.DRAFT) {
    throw new ApiError(409, "Finalized payroll runs cannot be deleted.");
  }

  await run.deleteOne();
  return { message: "Draft payroll run deleted." };
}

export async function payslipsFor(actor, targetUserId) {
  const userId =
    actor.role === ROLES.EMPLOYEE ? actor.id : targetUserId ? String(targetUserId) : actor.id;

  if (userId !== actor.id) {
    const target = await User.findById(userId).lean();

    if (!target || !canAccessRecord(actor, target)) {
      throw new ApiError(403, "You do not have access to this user's payslips.");
    }
  }

  const runs = await PayrollRun.find({ status: PAYROLL_STATUS.FINALIZED }).sort({ month: -1 }).lean();

  return runs
    .map((run) => {
      const line = run.lines.find((item) => String(item.userId) === userId);

      if (!line) {
        return null;
      }

      return {
        runId: String(run._id),
        month: run.month,
        status: run.status,
        line: serializePayrollLine(line, actor),
      };
    })
    .filter(Boolean);
}

export async function payslipPdf(actor, runId, targetUserId) {
  assertObjectId(runId, "run id");
  assertObjectId(targetUserId, "user id");

  if (actor.role === ROLES.HR) {
    throw new ApiError(403, "HR cannot download payslip PDFs.");
  }

  const run = await PayrollRun.findById(runId).lean();

  if (!run) {
    throw new ApiError(404, "Payroll run not found.");
  }

  if (run.status !== PAYROLL_STATUS.FINALIZED) {
    throw new ApiError(409, "Payslips are only available for finalized runs.");
  }

  const line = run.lines.find((item) => String(item.userId) === String(targetUserId));

  if (!line) {
    throw new ApiError(404, "No payslip for this user in that run.");
  }

  if (actor.role !== ROLES.ADMIN && String(targetUserId) !== actor.id) {
    throw new ApiError(403, "You can only download your own payslips.");
  }

  const employee = await User.findById(targetUserId).select("email fullName employeeCode departmentId").lean();
  const department = employee?.departmentId
    ? await Department.findById(employee.departmentId).select("name").lean()
    : null;
  const org = await getOrg();

  return buildPayslipPdf({
    org,
    run: { month: run.month, status: run.status, workingDays: run.workingDays },
    line,
    employee: {
      ...employee,
      departmentName: department?.name ?? "",
    },
  });
}

export async function payrollSummaryForAi(actor) {
  if (actor.role !== ROLES.ADMIN) {
    const runs = await PayrollRun.find({ status: PAYROLL_STATUS.FINALIZED })
      .sort({ month: -1 })
      .select("month status summary")
      .lean();

    return {
      runs: runs.map((run) => ({
        month: run.month,
        status: run.status,
        employeeCount: run.summary?.employeeCount ?? 0,
        workingDays: run.summary?.workingDays ?? 0,
      })),
      note: "Amounts are available to admin only.",
    };
  }

  const runs = await PayrollRun.find({ status: PAYROLL_STATUS.FINALIZED })
    .sort({ month: -1 })
    .limit(6)
    .select("month summary")
    .lean();

  return {
    runs: runs.map((run) => ({ month: run.month, ...run.summary })),
  };
}
