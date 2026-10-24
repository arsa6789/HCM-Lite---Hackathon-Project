import Attendance from "../models/Attendance.js";
import User from "../models/User.js";
import Department from "../models/Department.js";
import { ATTENDANCE_STATUS, CORRECTION_STATUS, EMPLOYMENT_STATUS } from "../constants/statuses.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { dayKey, hhmmToMinutes, minutesBetween, isValidDayKey, haversineMeters } from "../utils/dates.js";
import { evaluateCheckIn, evaluateCheckOut } from "../utils/attendanceRules.js";
import { requireOrg, workingDaysBetween, isWeekendKey, getHolidayDays } from "./orgService.js";
import { scopeFilter, isSelf } from "../access/scope.js";
import { ROLES } from "../constants/roles.js";
import { audit } from "../utils/audit.js";
import { notifyUsers, notifyAdminsAndHrs } from "../utils/notify.js";

function actorIsPrivileged(actor) {
  return actor.role === ROLES.ADMIN || actor.role === ROLES.HR;
}

async function scopedUserIds(actor, { departmentId = null } = {}) {
  const filter = { ...scopeFilter(actor) };

  if (actor.role !== ROLES.EMPLOYEE) {
    filter.employmentStatus = EMPLOYMENT_STATUS.ACTIVE;
  }

  if (departmentId) {
    filter.departmentId = departmentId;
  }

  const users = await User.find(filter).select("_id").lean();
  return users.map((user) => user._id);
}

export async function checkIn(actor, { lat, lng, accuracyM } = {}) {
  const org = await requireOrg();
  const now = new Date();
  const today = dayKey(now);

  const holidayDays = await getHolidayDays(today, today);

  if (isWeekendKey(today, org.weekendDays) || holidayDays.has(today)) {
    throw new ApiError(400, "Today is not a working day.");
  }

  if (org.geofence.enabled) {
    if (lat == null || lng == null) {
      throw new ApiError(400, "Location is required for check-in.");
    }

    const distance = haversineMeters(lat, lng, org.geofence.lat, org.geofence.lng);

    if (distance > org.geofence.radiusMeters) {
      throw new ApiError(403, `Check-in rejected: outside the office geofence (${distance} m away).`);
    }
  }

  const existing = await Attendance.findOne({ userId: actor.id, date: today });

  if (existing) {
    throw new ApiError(409, "You have already checked in today.");
  }

  const officeStart = hhmmToMinutes(org.officeStart);

  if (officeStart == null) {
    throw new ApiError(500, "Organization office hours are misconfigured.");
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const { status, minutesLate } = evaluateCheckIn({
    nowMinutes,
    officeStartMinutes: officeStart,
    graceMinutes: org.graceMinutes,
  });

  const record = await Attendance.create({
    userId: actor.id,
    date: today,
    checkInAt: now,
    checkInGeo: lat != null && lng != null ? { lat, lng, accuracyM: accuracyM ?? null } : null,
    status,
    minutesLate,
    workedMinutes: 0,
    source: "web",
  });

  return record;
}

export async function checkOut(actor) {
  const org = await requireOrg();
  const now = new Date();
  const today = dayKey(now);
  const record = await Attendance.findOne({ userId: actor.id, date: today });

  if (!record) {
    throw new ApiError(400, "You have not checked in today.");
  }

  if (record.checkOutAt) {
    throw new ApiError(409, "You have already checked out today.");
  }

  const workedMinutes = minutesBetween(record.checkInAt, now);
  const { status } = evaluateCheckOut({
    previousStatus: record.status,
    workedMinutes,
    halfDayHours: org.halfDayHours,
  });

  record.checkOutAt = now;
  record.workedMinutes = workedMinutes;
  record.status = status;
  await record.save();

  return record;
}

function day() {
  return new Date();
}

export async function listAttendance(actor, query = {}) {
  const filter = {};

  if (actor.role === ROLES.EMPLOYEE) {
    filter.userId = actor.id;
  } else {
    const ids = await scopedUserIds(actor, { departmentId: query.departmentId ?? null });
    filter.userId = { $in: ids };

    if (query.userId) {
      if (!ids.map(String).includes(String(query.userId))) {
        return { total: 0, page: 1, limit: 50, records: [] };
      }

      filter.userId = query.userId;
    }
  }

  if (query.from && isValidDayKey(query.from)) {
    filter.date = { ...filter.date, $gte: query.from };
  }

  if (query.to && isValidDayKey(query.to)) {
    filter.date = { ...filter.date, $lte: query.to };
  }

  if (query.status && ATTENDANCE_STATUS_VALUES.includes(query.status)) {
    filter.status = query.status;
  }

  const page = Math.max(Number(query.page ?? 1) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit ?? 50) || 50, 1), 100);

  if (query.pendingCorrections === "true" || query.status === "correction_pending") {
    filter["correction.status"] = CORRECTION_STATUS.PENDING;
    delete filter.status;
  }

  const total = await Attendance.countDocuments(filter);
  const records = await Attendance.find(filter)
    .sort({ date: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate("userId", "email fullName role employeeCode")
    .lean();

  return { total, page, limit, records };
}

const ATTENDANCE_STATUS_VALUES = Object.values(ATTENDANCE_STATUS);

export async function dailyBoard(actor, dateStr, departmentId) {
  const org = await requireOrg();
  const date = isValidDayKey(dateStr) ? dateStr : dayKey(new Date());
  const ids = await scopedUserIds(actor, { departmentId: departmentId ?? null });
  const users = await User.find({ _id: { $in: ids } })
    .select("email fullName role employeeCode departmentId")
    .populate("departmentId", "name")
    .lean();
  const records = await Attendance.find({ date, userId: { $in: ids } }).lean();
  const byUser = new Map(records.map((record) => [String(record.userId), record]));
  const holidayDays = await getHolidayDays(date, date);

  return {
    date,
    isWorkingDay: !isWeekendKey(date, org.weekendDays) && !holidayDays.has(date),
    isHoliday: holidayDays.has(date),
    rows: users.map((user) => ({
      user: {
        id: String(user._id),
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        employeeCode: user.employeeCode,
        departmentName: user.departmentId?.name ?? null,
      },
      record: byUser.get(String(user._id)) ?? null,
    })),
  };
}

export async function attendanceSummary(actor, targetUserId, fromKey, toKey) {
  const userId = actor.role === ROLES.EMPLOYEE ? actor.id : targetUserId;

  if (!userId) {
    throw new ApiError(400, "userId is required.");
  }

  const match = { userId, date: {} };

  if (fromKey && isValidDayKey(fromKey)) {
    match.date.$gte = fromKey;
  }

  if (toKey && isValidDayKey(toKey)) {
    match.date.$lte = toKey;
  }

  if (Object.keys(match.date).length === 0) {
    delete match.date;
  }

  const records = await Attendance.find(match).lean();

  const summary = {
    presentDays: 0,
    lateDays: 0,
    halfDays: 0,
    absentDays: 0,
    leaveDays: 0,
    lateMinutes: 0,
    workedMinutes: 0,
    from: fromKey ?? null,
    to: toKey ?? null,
  };

  for (const record of records) {
    if (record.status === ATTENDANCE_STATUS.PRESENT) {
      summary.presentDays += 1;
    } else if (record.status === ATTENDANCE_STATUS.LATE) {
      summary.lateDays += 1;
    } else if (record.status === ATTENDANCE_STATUS.HALF_DAY) {
      summary.halfDays += 1;
    } else if (record.status === ATTENDANCE_STATUS.ABSENT) {
      summary.absentDays += 1;
    } else if (record.status === ATTENDANCE_STATUS.LEAVE) {
      summary.leaveDays += 1;
    }

    summary.lateMinutes += record.minutesLate ?? 0;
    summary.workedMinutes += record.workedMinutes ?? 0;
  }

  return { summary, records };
}

export async function requestCorrection(actor, attendanceId, { reason, newCheckInAt, newCheckOutAt }) {
  const record = await Attendance.findById(attendanceId);

  if (!record) {
    throw new ApiError(404, "Attendance record not found.");
  }

  if (String(record.userId) !== actor.id) {
    throw new ApiError(403, "You can only request corrections on your own records.");
  }

  if (record.correction?.status === CORRECTION_STATUS.PENDING) {
    throw new ApiError(409, "A correction request is already pending for this record.");
  }

  record.correction = {
    status: CORRECTION_STATUS.PENDING,
    reason: String(reason ?? "").slice(0, 500),
    newCheckInAt: newCheckInAt ? new Date(newCheckInAt) : null,
    newCheckOutAt: newCheckOutAt ? new Date(newCheckOutAt) : null,
    requestedAt: new Date(),
    reviewNote: "",
    reviewedBy: null,
    reviewedAt: null,
  };

  await record.save();
  await notifyAdminsAndHrs({
    title: "Attendance correction requested",
    body: "An employee requested an attendance correction.",
    type: "attendance",
    link: "/console/attendance",
  });

  return record;
}

export async function reviewCorrection(actor, attendanceId, { decision, reviewNote }) {
  if (!actorIsPrivileged(actor)) {
    throw new ApiError(403, "Only admin or HR can review corrections.");
  }

  const record = await Attendance.findById(attendanceId);

  if (!record) {
    throw new ApiError(404, "Attendance record not found.");
  }

  if (actor.role === ROLES.HR && String(record.userId) === actor.id) {
    throw new ApiError(403, "HR cannot review corrections on their own records.");
  }

  if (actor.role === ROLES.HR) {
    const target = await User.findById(record.userId).select("role").lean();

    if (!target || target.role !== ROLES.EMPLOYEE) {
      throw new ApiError(403, "HR can only review employee attendance corrections.");
    }
  }

  if (record.correction?.status !== CORRECTION_STATUS.PENDING) {
    throw new ApiError(409, "There is no pending correction on this record.");
  }

  const org = await requireOrg();

  record.correction.status = decision;
  record.correction.reviewNote = String(reviewNote ?? "").slice(0, 500);
  record.correction.reviewedBy = actor.id;
  record.correction.reviewedAt = new Date();

  if (decision === CORRECTION_STATUS.APPROVED) {
    const checkIn = record.correction.newCheckInAt ?? record.checkInAt;
    const checkOut = record.correction.newCheckOutAt ?? record.checkOutAt;

    if (checkIn) {
      record.checkInAt = checkIn;
      const officeStart = hhmmToMinutes(org.officeStart) ?? 540;
      const nowMinutes = checkIn.getHours() * 60 + checkIn.getMinutes();
      const { status, minutesLate } = evaluateCheckIn({
        nowMinutes,
        officeStartMinutes: officeStart,
        graceMinutes: org.graceMinutes,
      });
      record.status = status;
      record.minutesLate = minutesLate;
    }

    if (checkOut) {
      record.checkOutAt = checkOut;
      record.workedMinutes = checkIn ? minutesBetween(checkIn, checkOut) : record.workedMinutes;
      const { status } = evaluateCheckOut({
        previousStatus: record.status,
        workedMinutes: record.workedMinutes,
        halfDayHours: org.halfDayHours,
      });
      record.status = status;
    }
  }

  await record.save();
  await notifyUsers([record.userId], {
    title: `Correction ${decision}`,
    body: record.correction.reviewNote || `Your correction request was ${decision}.`,
    type: "attendance",
    link: "/console/attendance",
  });

  return record;
}

export async function attendanceSummaryForAi(actor, { from, to, userId } = {}) {
  const targetUserId = actor.role === ROLES.EMPLOYEE || !userId ? actor.id : userId;

  if (targetUserId !== actor.id && !actorIsPrivileged(actor)) {
    throw new ApiError(403, "You can only view your own attendance.");
  }

  const { summary } = await attendanceSummary(actor, targetUserId, from, to);
  return { userId: targetUserId, ...summary };
}
