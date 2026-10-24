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
import { workingDaysBetween, getOrg, getHolidayDays, isWeekendKey } from "./orgService.js";
import { balancesFor } from "./leaveService.js";

function defaultRange() {
  const to = new Date();
  const from = subDays(to, 29);
  return { fromKey: format(from, "yyyy-MM-dd"), toKey: format(to, "yyyy-MM-dd") };
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

export async function summary(actor, { from, to, departmentId } = {}) {
  const range =
    from && to && isValidDayKey(from) && isValidDayKey(to) && from <= to
      ? { fromKey: from, toKey: to }
      : defaultRange();

  if (actor.role === ROLES.EMPLOYEE) {
    return employeeSummary(actor, range);
  }

  return orgSummary(actor, range, departmentId ?? null);
}

async function visibleAnnouncements(actor) {
  const user = await User.findById(actor.id).select("role departmentId").lean();
  const announcements = await Announcement.find().sort({ pinned: -1, createdAt: -1 }).limit(5).lean();

  return announcements
    .filter((item) => {
      if (item.audience.type === "all") {
        return true;
      }

      if (item.audience.type === "role") {
        return item.audience.role === user.role;
      }

      return item.audience.departmentId && String(item.audience.departmentId) === String(user.departmentId);
    })
    .map((item) => ({
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

  const counts = {
    present: records.filter((r) => r.status === ATTENDANCE_STATUS.PRESENT).length,
    late: records.filter((r) => r.status === ATTENDANCE_STATUS.LATE).length,
    halfDay: records.filter((r) => r.status === ATTENDANCE_STATUS.HALF_DAY).length,
    absent: records.filter((r) => r.status === ATTENDANCE_STATUS.ABSENT).length,
    leave: records.filter((r) => r.status === ATTENDANCE_STATUS.LEAVE).length,
  };

  const workingDayKeys = org ? await workingDaysBetween(org, range.fromKey, range.toKey) : [];
  const expected = workingDayKeys.length;
  const attendanceRate = expected > 0 ? round1(((counts.present + counts.late + 0.5 * counts.halfDay) / expected) * 100) : 0;
  const lateMinutes = records.reduce((sum, r) => sum + (r.minutesLate ?? 0), 0);
  const workedHours = round1(records.reduce((sum, r) => sum + (r.workedMinutes ?? 0), 0) / 60);

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
    const record = records.find((r) => r.date === key);
    const rate = record?.status === ATTENDANCE_STATUS.HALF_DAY
      ? 50
      : [ATTENDANCE_STATUS.PRESENT, ATTENDANCE_STATUS.LATE].includes(record?.status)
        ? 100
        : 0;
    trend.push({
      date: key,
      rate,
      present: record?.status === ATTENDANCE_STATUS.PRESENT ? 1 : 0,
      late: record?.status === ATTENDANCE_STATUS.LATE ? 1 : 0,
      halfDay: record?.status === ATTENDANCE_STATUS.HALF_DAY ? 1 : 0,
      absent: !record || record.status === ATTENDANCE_STATUS.ABSENT ? 1 : 0,
    });
  }

  return {
    role: "employee",
    range: { from: range.fromKey, to: range.toKey, workingDays: expected },
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
  const baseFilter = { ...scopeFilter(actor), employmentStatus: EMPLOYMENT_STATUS.ACTIVE };
  const userFilter = departmentId ? { ...baseFilter, departmentId } : baseFilter;

  const users = await User.find(userFilter).select("_id departmentId").lean();
  const userIds = users.map((user) => user._id);

  const workingDayKeys = org ? await workingDaysBetween(org, range.fromKey, range.toKey) : [];
  const expectedRecords = workingDayKeys.length * userIds.length;

  const records = await Attendance.find({
    userId: { $in: userIds },
    date: { $gte: range.fromKey, $lte: range.toKey },
  }).lean();

  const counts = {
    present: records.filter((r) => r.status === ATTENDANCE_STATUS.PRESENT).length,
    late: records.filter((r) => r.status === ATTENDANCE_STATUS.LATE).length,
    halfDay: records.filter((r) => r.status === ATTENDANCE_STATUS.HALF_DAY).length,
    absent: records.filter((r) => r.status === ATTENDANCE_STATUS.ABSENT).length,
    leave: records.filter((r) => r.status === ATTENDANCE_STATUS.LEAVE).length,
  };

  const attendanceRate = expectedRecords > 0
    ? round1(((counts.present + counts.late + 0.5 * counts.halfDay) / expectedRecords) * 100)
    : 0;
  const lateRate = expectedRecords > 0 ? round1((counts.late / expectedRecords) * 100) : 0;
  const lateMinutes = records.reduce((sum, r) => sum + (r.minutesLate ?? 0), 0);
  const workedHours = round1(records.reduce((sum, r) => sum + (r.workedMinutes ?? 0), 0) / 60);

  const scopedEmployeeIds = actor.role === ROLES.HR
    ? users.map((user) => user._id)
    : undefined;
  const pendingLeaveFilter = { status: LEAVE_STATUS.PENDING };
  if (scopedEmployeeIds) pendingLeaveFilter.userId = { $in: scopedEmployeeIds };
  const pendingLeaves = await LeaveApplication.countDocuments(pendingLeaveFilter);
  const todayWorking = org && (await workingDaysBetween(org, todayKey, todayKey)).length > 0;
  const todayRecords = todayWorking
    ? await Attendance.find({ userId: { $in: userIds }, date: todayKey }).lean()
    : [];
  const todayStatuses = todayRecords.reduce((result, record) => {
    result[record.status] = (result[record.status] ?? 0) + 1;
    return result;
  }, {});
  const todayCounts = {
    present: todayStatuses[ATTENDANCE_STATUS.PRESENT] ?? 0,
    late: todayStatuses[ATTENDANCE_STATUS.LATE] ?? 0,
    halfDay: todayStatuses[ATTENDANCE_STATUS.HALF_DAY] ?? 0,
    leave: todayStatuses[ATTENDANCE_STATUS.LEAVE] ?? 0,
  };
  todayCounts.absent = todayWorking ? Math.max(0, userIds.length - todayRecords.length) : 0;

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

  for (const record of records) {
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
  const approvedLeaveFilter = { status: LEAVE_STATUS.APPROVED };
  if (scopedEmployeeIds) approvedLeaveFilter.userId = { $in: scopedEmployeeIds };
  const approvedLeave = await LeaveApplication.aggregate([
    { $match: approvedLeaveFilter },
    { $group: { _id: "$leaveTypeId", approvedDays: { $sum: "$days" } } },
  ]);
  const leaveByType = approvedLeave.map((row) => ({
    name: leaveTypes.find((type) => String(type._id) === String(row._id))?.name ?? "unknown",
    approvedDays: row.approvedDays,
  }));

  const trend = [];
  const holidayDays = await getHolidayDays(range.fromKey, range.toKey);
  for (const key of eachDayKey(range.fromKey, range.toKey).slice(-30)) {
    const dayRecords = records.filter((r) => r.date === key);
    const dayCount = {
      present: dayRecords.filter((r) => r.status === ATTENDANCE_STATUS.PRESENT).length,
      late: dayRecords.filter((r) => r.status === ATTENDANCE_STATUS.LATE).length,
      halfDay: dayRecords.filter((r) => r.status === ATTENDANCE_STATUS.HALF_DAY).length,
      absent: dayRecords.filter((r) => r.status === ATTENDANCE_STATUS.ABSENT).length,
    };
    const isWorkingDay = Boolean(org && !isWeekendKey(key, org.weekendDays) && !holidayDays.has(key));
    const dayExpected = isWorkingDay ? userIds.length : 0;
    trend.push({
      date: key,
      isWorkingDay,
      rate: dayExpected > 0 ? round1(((dayCount.present + dayCount.late + 0.5 * dayCount.halfDay) / dayExpected) * 100) : 0,
      ...dayCount,
    });
  }
  const result = {
    role: "org",
    range: { from: range.fromKey, to: range.toKey, workingDays: workingDayKeys.length },
    headcount: userIds.length,
    counts,
    attendanceRate,
    lateRate,
    lateMinutes,
    workedHours,
    averageHoursWorked: expectedRecords > 0
      ? round1(records.reduce((sum, record) => sum + (record.workedMinutes ?? 0), 0) / expectedRecords / 60)
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
    const salaryTotals = await User.aggregate([
      { $match: { role: ROLES.EMPLOYEE, employmentStatus: EMPLOYMENT_STATUS.ACTIVE } },
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
