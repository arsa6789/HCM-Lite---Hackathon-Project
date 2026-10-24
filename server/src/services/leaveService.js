import LeaveApplication from "../models/LeaveApplication.js";
import LeaveType from "../models/LeaveType.js";
import Attendance from "../models/Attendance.js";
import User from "../models/User.js";
import { LEAVE_STATUS, ATTENDANCE_STATUS } from "../constants/statuses.js";
import { ROLES } from "../constants/roles.js";
import { ApiError } from "../utils/apiError.js";
import { eachDayKey, isValidDayKey } from "../utils/dates.js";
import { workingDaysBetween } from "./orgService.js";
import { scopeFilter, canAccessRecord } from "../access/scope.js";
import { audit } from "../utils/audit.js";
import { notifyUsers, notifyAdminsAndHrs } from "../utils/notify.js";
import { ATTENDANCE_STATUS as STATUS } from "../constants/statuses.js";

const LEAVE_STATUS_VALUES = Object.values(LEAVE_STATUS);

function actorIsPrivileged(actor) {
  return actor.role === ROLES.ADMIN || actor.role === ROLES.HR;
}

export async function balancesFor(actor, targetUserId, year) {
  const userId =
    actor.role === ROLES.EMPLOYEE || !targetUserId ? actor.id : String(targetUserId);

  if (userId !== actor.id) {
    const target = await User.findById(userId).lean();

    if (!target || !canAccessRecord(actor, target)) {
      throw new ApiError(403, "You do not have access to this user's balances.");
    }
  }

  const types = await LeaveType.find().lean();
  const yearPrefix = `${year}-`;
  const applications = await LeaveApplication.find({
    userId,
    fromDate: { $regex: `^${yearPrefix}` },
  }).lean();

  return types.map((type) => {
    const forType = applications.filter((app) => String(app.leaveTypeId) === String(type._id));
    const used = forType
      .filter((app) => app.status === LEAVE_STATUS.APPROVED)
      .reduce((sum, app) => sum + app.days, 0);
    const pending = forType
      .filter((app) => app.status === LEAVE_STATUS.PENDING)
      .reduce((sum, app) => sum + app.days, 0);

    return {
      leaveTypeId: String(type._id),
      name: type.name,
      paid: type.paid,
      annualDays: type.annualDays,
      used,
      pending,
      remaining: Math.max(0, type.annualDays - used - pending),
    };
  });
}

export async function applyLeave(actor, { leaveTypeId, fromDate, toDate, reason }) {
  if (!isValidDayKey(fromDate) || !isValidDayKey(toDate)) {
    throw new ApiError(400, "Invalid leave dates.");
  }

  if (fromDate > toDate) {
    throw new ApiError(400, "The start date must be on or before the end date.");
  }

  const org = await requireOrgForLeave();
  const type = await LeaveType.findById(leaveTypeId).lean();

  if (!type) {
    throw new ApiError(400, "Unknown leave type.");
  }

  const requestedDays = await workingDaysBetween(org, fromDate, toDate);

  if (requestedDays.length === 0) {
    throw new ApiError(400, "The selected range contains no working days.");
  }

  const overlap = await LeaveApplication.findOne({
    userId: actor.id,
    status: { $in: [LEAVE_STATUS.PENDING, LEAVE_STATUS.APPROVED] },
    fromDate: { $lte: toDate },
    toDate: { $gte: fromDate },
  }).lean();

  if (overlap) {
    throw new ApiError(409, "You already have a pending or approved leave overlapping these dates.");
  }

  const days = requestedDays.length;
  const balance = (await balancesFor(actor, actor.id, fromDate.slice(0, 4)))
    .find((item) => item.leaveTypeId === String(type._id));

  if (type.paid && balance && days > balance.remaining) {
    throw new ApiError(
      400,
      `Insufficient balance: ${balance.remaining} day(s) remaining of ${type.name}, ${days} requested.`
    );
  }

  const application = await LeaveApplication.create({
    userId: actor.id,
    leaveTypeId: type._id,
    fromDate,
    toDate,
    days,
    reason: String(reason ?? "").slice(0, 500),
    status: LEAVE_STATUS.PENDING,
  });

  await notifyAdminsAndHrs({
    title: "New leave request",
    body: `An employee requested ${days} day(s) of ${type.name}.`,
    type: "leave",
    link: "/console/leave",
  });

  return application;
}

async function requireOrgForLeave() {
  const { requireOrg } = await import("./orgService.js");
  return requireOrg();
}

export async function listApplications(actor, query = {}) {
  const filter = {};

  if (actor.role === ROLES.EMPLOYEE) {
    filter.userId = actor.id;
  } else if (actor.role === ROLES.HR) {
    const employeeIds = await User.find({ role: ROLES.EMPLOYEE }).distinct("_id");
    employeeIds.push(actor.id);
    filter.userId = { $in: employeeIds };
  }

  if (query.userId) {
    if (actor.role === ROLES.EMPLOYEE && String(query.userId) !== actor.id) {
      throw new ApiError(403, "You can only view your own leave requests.");
    }

    if (actor.role === ROLES.HR && !filter.userId.$in.map(String).includes(String(query.userId))) {
      return { total: 0, page: 1, limit: 50, applications: [] };
    }

    filter.userId = query.userId;
  }

  if (query.status && LEAVE_STATUS_VALUES.includes(query.status)) {
    filter.status = query.status;
  }

  if (query.from && isValidDayKey(query.from)) {
    filter.toDate = { ...filter.toDate, $gte: query.from };
  }

  if (query.to && isValidDayKey(query.to)) {
    filter.fromDate = { ...filter.fromDate, $lte: query.to };
  }

  const page = Math.max(Number(query.page ?? 1) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit ?? 50) || 50, 1), 100);

  const total = await LeaveApplication.countDocuments(filter);
  const applications = await LeaveApplication.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate("userId", "email fullName role")
    .populate("leaveTypeId", "name paid")
    .lean();

  return { total, page, limit, applications };
}

export async function reviewApplication(actor, applicationId, { decision, reviewNote }) {
  if (!actorIsPrivileged(actor)) {
    throw new ApiError(403, "Only admin or HR can review leave requests.");
  }

  const application = await LeaveApplication.findById(applicationId);

  if (!application) {
    throw new ApiError(404, "Leave application not found.");
  }

  if (actor.role === ROLES.HR && String(application.userId) === actor.id) {
    throw new ApiError(403, "HR cannot review their own leave requests.");
  }

  if (actor.role === ROLES.HR) {
    const target = await User.findById(application.userId).select("role").lean();

    if (!target || target.role !== ROLES.EMPLOYEE) {
      throw new ApiError(403, "HR can only review employee leave requests.");
    }
  }

  if (application.status !== LEAVE_STATUS.PENDING) {
    throw new ApiError(409, "This application has already been reviewed.");
  }

  application.status = decision;
  application.reviewNote = String(reviewNote ?? "").slice(0, 500);
  application.reviewedBy = actor.id;
  application.reviewedAt = new Date();

  if (decision === LEAVE_STATUS.APPROVED) {
    const org = await requireOrgForLeave();
    const days = await workingDaysBetween(org, application.fromDate, application.toDate);

    await Attendance.updateOne(
      { userId: application.userId, date: { $in: days }, checkInAt: null },
      { $set: { status: ATTENDANCE_STATUS.LEAVE, source: "system" } },
      { upsert: false }
    );

    for (const date of days) {
      await Attendance.updateOne(
        { userId: application.userId, date, checkInAt: null },
        { $set: { status: ATTENDANCE_STATUS.LEAVE, source: "system" } },
        { upsert: true }
      );
    }
  }

  await application.save();
  await notifyUsers([application.userId], {
    title: `Leave ${decision}`,
    body: application.reviewNote || `Your leave request was ${decision}.`,
    type: "leave",
    link: "/console/leave",
  });

  return application;
}

export async function cancelApplication(actor, applicationId) {
  const application = await LeaveApplication.findById(applicationId);

  if (!application) {
    throw new ApiError(404, "Leave application not found.");
  }

  if (String(application.userId) !== actor.id) {
    throw new ApiError(403, "You can only cancel your own applications.");
  }

  if (application.status !== LEAVE_STATUS.PENDING) {
    throw new ApiError(409, "Only pending applications can be cancelled.");
  }

  application.status = LEAVE_STATUS.CANCELLED;
  await application.save();

  return application;
}

export async function leaveSummaryForAi(actor, { from, to } = {}) {
  const base = { userId: actor.role === ROLES.EMPLOYEE ? actor.id : undefined };

  if (!actorIsPrivileged(actor)) {
    const balanceList = await balancesFor(actor, actor.id, String(new Date().getFullYear()));
    return { scope: "self", balances: balanceList };
  }

  const filter = { status: LEAVE_STATUS.PENDING };

  if (from && isValidDayKey(from)) {
    filter.toDate = { ...filter.toDate, $gte: from };
  }

  if (to && isValidDayKey(to)) {
    filter.fromDate = { ...filter.fromDate, $lte: to };
  }

  const pending = await LeaveApplication.countDocuments(filter);
  const byType = await LeaveApplication.aggregate([
    { $match: { status: LEAVE_STATUS.APPROVED } },
    { $group: { _id: "$leaveTypeId", approvedDays: { $sum: "$days" } } },
  ]);
  const types = await LeaveType.find().lean();

  return {
    scope: "org",
    pending,
    approvedByType: byType.map((row) => ({
      name: types.find((type) => String(type._id) === String(row._id))?.name ?? "unknown",
      approvedDays: row.approvedDays,
    })),
  };
}

export async function myLeaveBalanceForAi(actor) {
  return balancesFor(actor, actor.id, String(new Date().getFullYear()));
}
