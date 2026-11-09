import User from "../models/User.js";
import Department from "../models/Department.js";
import Attendance from "../models/Attendance.js";
import LeaveApplication from "../models/LeaveApplication.js";
import LeaveType from "../models/LeaveType.js";
import PayrollRun from "../models/PayrollRun.js";
import Announcement from "../models/Announcement.js";
import { ATTENDANCE_STATUS, LEAVE_STATUS, EMPLOYMENT_STATUS } from "../constants/statuses.js";
import { ROLES } from "../constants/roles.js";
import { ApiError } from "../utils/apiError.js";
import { dayKey, isValidDayKey, eachDayKey } from "../utils/dates.js";
import { subDays, format } from "date-fns";
import { scopeFilter } from "../access/scope.js";
import { workingDaysBetween, getOrg } from "./orgService.js";
import { balancesFor } from "./leaveService.js";
import { summarizeAttendance } from "../utils/dashboardMetrics.js";

function defaultRange() {
  const to = new Date();
  const from = subDays(to, 29);
  return { fromKey: format(from, "yyyy-MM-dd"), toKey: format(to, "yyyy-MM-dd") };
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

export async function summary(actor, { from, to, departmentId } = {}) {
  let range;
  if (from === undefined && to === undefined) {
    range = defaultRange();
  } else {
    const todayKey = dayKey(new Date());
    if (!isValidDayKey(from) || !isValidDayKey(to) || from > to) {
      throw new ApiError(400, "Provide valid start and end dates for the dashboard.");
    }
    if (to > todayKey) {
      throw new ApiError(400, "Dashboard date ranges cannot include future dates.");
    }
    range = { fromKey: from, toKey: to };
  }

  if (actor.role === ROLES.EMPLOYEE) {
    return employeeSummary(actor, range);
  }

  return orgSummary(actor, range, departmentId ?? null);
}

async function visibleAnnouncements(actor) {
  const user = await User.findById(actor.id).select("role departmentId").lean();
  const audiences = [
    { "audience.type": "all" },
    { "audience.type": "role", "audience.role": user.role },
  ];
  if (user.departmentId) {
    audiences.push({ "audience.type": "department", "audience.departmentId": String(user.departmentId) });
  }
  const announcements = await Announcement.find({ $or: audiences })
    .sort({ pinned: -1, createdAt: -1 })
    .limit(5)
    .lean();

  return announcements.map((item) => ({
      id: String(item._id),
      title: item.title,
      body: item.body.slice(0, 200),
      pinned: item.pinned,
      createdAt: item.createdAt,
    }));
}

async function employeeSummary(actor, range) {
  const org = await getOrg();
  const todayKey = dayKey(new Date());
  const records = await Attendance.find({
    userId: actor.id,
    date: { $gte: range.fromKey, $lte: range.toKey },
  }).lean();

  const workingDayKeys = org ? await workingDaysBetween(org, range.fromKey, range.toKey) : [];
  const workingDaySet = new Set(workingDayKeys);
  const periodRecords = records.filter((record) => workingDaySet.has(record.date));
  const { counts, attendanceRate } = summarizeAttendance(periodRecords, workingDayKeys.length);
  const recordsByDate = new Map(periodRecords.map((record) => [record.date, record]));
  const lateMinutes = periodRecords.reduce((sum, r) => sum + (r.minutesLate ?? 0), 0);
  const workedHours = round1(periodRecords.reduce((sum, r) => sum + (r.workedMinutes ?? 0), 0) / 60);

  const weekStart = format(subDays(new Date(), 6), "yyyy-MM-dd");
  const weekRecords = await Attendance.find({ userId: actor.id, date: { $gte: weekStart } }).lean();
  const hoursThisWeek = round1(weekRecords.reduce((sum, r) => sum + (r.workedMinutes ?? 0), 0) / 60);

  const monthStart = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd");
  const lateThisMonth = await Attendance.countDocuments({
    userId: actor.id,
    date: { $gte: monthStart },
    status: ATTENDANCE_STATUS.LATE,
  });

  const pendingRequests = await LeaveApplication.countDocuments({
    userId: actor.id,
    status: LEAVE_STATUS.PENDING,
  });

  const balances = await balancesFor(actor, actor.id, String(new Date().getFullYear()));
  const todayRecord = await Attendance.findOne({ userId: actor.id, date: todayKey }).lean();

  const trend = [];
  for (const key of eachDayKey(range.fromKey, range.toKey).slice(-30)) {
    const isWorkingDay = workingDaySet.has(key);
    const record = isWorkingDay ? recordsByDate.get(key) : null;
    const dayMetrics = summarizeAttendance(record ? [record] : [], isWorkingDay ? 1 : 0);
    trend.push({
      date: key,
      isWorkingDay,
      rate: isWorkingDay && record?.status !== ATTENDANCE_STATUS.LEAVE ? dayMetrics.attendanceRate : null,
      ...dayMetrics.counts,
    });
  }

  return {
    role: "employee",
    organizationConfigured: Boolean(org),
    range: { from: range.fromKey, to: range.toKey, workingDays: workingDayKeys.length },
    counts,
    attendanceRate,
    workedHours,
    lateMinutes,
    hoursThisWeek,
    weeklyTargetHours: 40,
    lateThisMonth,
    pendingRequests,
    today: {
      status: todayRecord?.status ?? "absent",
      workedMinutes: todayRecord?.workedMinutes ?? 0,
    },
    leave: { balances },
    trend,
    announcements: await visibleAnnouncements(actor),
  };
}

async function orgSummary(actor, range, departmentId) {
  const org = await getOrg();
  const todayKey = dayKey(new Date());
  const baseFilter = { ...scopeFilter(actor), role: ROLES.EMPLOYEE, employmentStatus: EMPLOYMENT_STATUS.ACTIVE };
  const userFilter = departmentId ? { ...baseFilter, departmentId } : baseFilter;

  const users = await User.find(userFilter).select("_id departmentId").lean();
  const userIds = users.map((user) => user._id);

  const workingDayKeys = org ? await workingDaysBetween(org, range.fromKey, range.toKey) : [];
  const workingDaySet = new Set(workingDayKeys);
  const expectedRecords = workingDayKeys.length * userIds.length;

  const records = await Attendance.find({
    userId: { $in: userIds },
    date: { $gte: range.fromKey, $lte: range.toKey },
  }).lean();

  const periodRecords = records.filter((record) => workingDaySet.has(record.date));
  const { counts, attendanceRate, lateRate } = summarizeAttendance(periodRecords, expectedRecords);
  const recordsByDate = new Map();
  for (const record of periodRecords) {
    const list = recordsByDate.get(record.date) ?? [];
    list.push(record);
    recordsByDate.set(record.date, list);
  }
  const lateMinutes = periodRecords.reduce((sum, r) => sum + (r.minutesLate ?? 0), 0);
  const workedHours = round1(periodRecords.reduce((sum, r) => sum + (r.workedMinutes ?? 0), 0) / 60);

  const pendingLeaveFilter = { status: LEAVE_STATUS.PENDING };
  if (actor.role === ROLES.HR || departmentId) pendingLeaveFilter.userId = { $in: userIds };
  const pendingLeaves = await LeaveApplication.countDocuments(pendingLeaveFilter);
  const todayWorking = org && (await workingDaysBetween(org, todayKey, todayKey)).length > 0;
  const todayRecords = todayWorking
    ? await Attendance.find({ userId: { $in: userIds }, date: todayKey }).lean()
    : [];
  const todayCounts = summarizeAttendance(todayRecords, todayWorking ? userIds.length : 0).counts;

  const departments = await Department.find().lean();
  const departmentCounts = departments.map((department) => ({
    id: String(department._id),
    name: department.name,
    count: users.filter((user) => String(user.departmentId) === String(department._id)).length,
  }));
  departmentCounts.push({
    id: "unassigned",
    name: "Unassigned",
    count: users.filter((user) => !user.departmentId).length,
  });

  const lateByUser = new Map();

  for (const record of periodRecords) {
    if (record.status === ATTENDANCE_STATUS.LATE) {
      const key = String(record.userId);
      lateByUser.set(key, (lateByUser.get(key) ?? 0) + 1);
    }
  }

  const topLateComers = await Promise.all(
    [...lateByUser.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(async ([userId, count]) => {
        const user = await User.findById(userId).select("email fullName").lean();
        return user
          ? { userId, fullName: user.fullName, email: user.email, count }
          : { userId, fullName: "", email: "", count };
      })
  );

  const leaveTypes = await LeaveType.find().lean();
  const yearStart = `${todayKey.slice(0, 4)}-01-01`;
  const approvedLeaveDaysByType = new Map();
  if (org && userIds.length > 0) {
    const approvedApplications = await LeaveApplication.find({
      status: LEAVE_STATUS.APPROVED,
      userId: { $in: userIds },
      fromDate: { $lte: todayKey },
      toDate: { $gte: yearStart },
    }).lean();
    const yearWorkingDays = new Set(await workingDaysBetween(org, yearStart, todayKey));
    for (const application of approvedApplications) {
      const overlapFrom = application.fromDate > yearStart ? application.fromDate : yearStart;
      const overlapTo = application.toDate < todayKey ? application.toDate : todayKey;
      if (overlapFrom > overlapTo) continue;
      const days = eachDayKey(overlapFrom, overlapTo).filter((key) => yearWorkingDays.has(key)).length;
      const typeId = String(application.leaveTypeId);
      approvedLeaveDaysByType.set(typeId, (approvedLeaveDaysByType.get(typeId) ?? 0) + days);
    }
  }
  const approvedLeave = [...approvedLeaveDaysByType.entries()].map(([leaveTypeId, approvedDays]) => ({
    _id: leaveTypeId,
    approvedDays,
  }));
  const leaveByType = approvedLeave.map((row) => ({
    name: leaveTypes.find((type) => String(type._id) === String(row._id))?.name ?? "unknown",
    approvedDays: row.approvedDays,
  }));

  const trend = [];
  for (const key of eachDayKey(range.fromKey, range.toKey).slice(-30)) {
    const isWorkingDay = workingDaySet.has(key);
    const dayExpected = isWorkingDay ? userIds.length : 0;
    const dayMetrics = summarizeAttendance(isWorkingDay ? (recordsByDate.get(key) ?? []) : [], dayExpected);
    trend.push({
      date: key,
      isWorkingDay,
      rate: dayExpected > dayMetrics.counts.leave ? dayMetrics.attendanceRate : null,
      ...dayMetrics.counts,
    });
  }
  const result = {
    role: "org",
    organizationConfigured: Boolean(org),
    range: { from: range.fromKey, to: range.toKey, workingDays: workingDayKeys.length },
    headcount: userIds.length,
    counts,
    attendanceRate,
    lateRate,
    lateMinutes,
    workedHours,
    averageHoursWorked: expectedRecords > 0
      ? round1(periodRecords.reduce((sum, record) => sum + (record.workedMinutes ?? 0), 0) / Math.max(1, expectedRecords - counts.leave) / 60)
      : 0,
    today: { date: todayKey, isWorkingDay: todayWorking, ...todayCounts },
    pendingLeaves,
    departments: departmentCounts,
    topLateComers,
    leaveByType,
    leaveUtilization: leaveTypes.map((type) => {
      const approvedDays = approvedLeave.find((row) => String(row._id) === String(type._id))?.approvedDays ?? 0;
      return {
        leaveTypeId: String(type._id),
        name: type.name,
        annualDays: type.annualDays,
        approvedDays,
        utilizationRate: type.annualDays > 0 ? round1((approvedDays / (type.annualDays * Math.max(userIds.length, 1))) * 100) : 0,
      };
    }),
    trend,
    announcements: await visibleAnnouncements(actor),
  };

  if (actor.role === ROLES.ADMIN) {
    const lastRun = await PayrollRun.findOne({ status: "finalized" }).sort({ month: -1 }).lean();
    const salaryMatch = { role: ROLES.EMPLOYEE, employmentStatus: EMPLOYMENT_STATUS.ACTIVE };
    if (departmentId) salaryMatch.departmentId = departmentId;
    const salaryTotals = await User.aggregate([
      { $match: salaryMatch },
      { $group: { _id: null, total: { $sum: { $add: ["$salary.basic", "$salary.allowance"] } }, count: { $sum: 1 } } },
    ]);

    result.averageSalary = salaryTotals[0]?.count
      ? round1(salaryTotals[0].total / salaryTotals[0].count)
      : 0;

    if (lastRun) {
      result.payroll = {
        month: lastRun.month,
        totalGross: lastRun.summary.totalGross,
        totalDeductions: lastRun.summary.totalDeductions,
        totalTax: lastRun.summary.totalTax,
        totalNet: lastRun.summary.totalNet,
        employeeCount: lastRun.summary.employeeCount,
      };
    }
  }

  return result;
}

export async function dashboardSummaryForAi(actor, { from, to, departmentId } = {}) {
  const data = await summary(actor, { from, to, departmentId });

  if (data.role === "employee") {
    return {
      scope: "self",
      attendanceRate: data.attendanceRate,
      lateMinutes: data.lateMinutes,
      counts: data.counts,
      hoursThisWeek: data.hoursThisWeek,
      lateThisMonth: data.lateThisMonth,
      pendingRequests: data.pendingRequests,
      balances: data.leave.balances,
    };
  }

  return {
    scope: "org",
    headcount: data.headcount,
    attendanceRate: data.attendanceRate,
    lateRate: data.lateRate,
    counts: data.counts,
    pendingLeaves: data.pendingLeaves,
    topLateComers: data.topLateComers,
    leaveByType: data.leaveByType,
  };
}
