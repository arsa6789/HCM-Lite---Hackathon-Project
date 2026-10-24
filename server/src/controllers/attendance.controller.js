import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { assertObjectId } from "../utils/validate.js";
import { sanitizeText } from "../utils/sanitize.js";
import { ROLES } from "../constants/roles.js";
import { CORRECTION_STATUS } from "../constants/statuses.js";
import {
  checkIn,
  checkOut,
  listAttendance,
  dailyBoard,
  requestCorrection,
  reviewCorrection,
} from "../services/attendanceService.js";
import { audit } from "../utils/audit.js";

function serializeRecord(record) {
  if (!record) {
    return null;
  }

  return {
    id: String(record._id),
    userId: String(record.userId?._id ?? record.userId),
    email: record.userId?.email ?? null,
    fullName: record.userId?.fullName ?? null,
    date: record.date,
    status: record.status,
    minutesLate: record.minutesLate ?? 0,
    workedMinutes: record.workedMinutes ?? 0,
    checkInAt: record.checkInAt,
    checkOutAt: record.checkOutAt,
    source: record.source,
    correction: record.correction?.status
      ? {
          status: record.correction.status,
          reason: record.correction.reason,
          newCheckInAt: record.correction.newCheckInAt,
          newCheckOutAt: record.correction.newCheckOutAt,
          requestedAt: record.correction.requestedAt,
          reviewNote: record.correction.reviewNote,
          reviewedAt: record.correction.reviewedAt,
        }
      : null,
  };
}

export const postCheckIn = asyncHandler(async (req, res) => {
  const record = await checkIn(req.user, {
    lat: req.body?.lat,
    lng: req.body?.lng,
    accuracyM: req.body?.accuracyM,
  });
  res.status(201).json({ attendance: serializeRecord(record.toObject()) });
});

export const postCheckOut = asyncHandler(async (req, res) => {
  const record = await checkOut(req.user);
  res.json({ attendance: serializeRecord(record.toObject()) });
});

export const getAttendance = asyncHandler(async (req, res) => {
  const result = await listAttendance(req.user, req.query);
  res.json({ ...result, records: result.records.map(serializeRecord) });
});

export const getBoard = asyncHandler(async (req, res) => {
  if (req.user.role === ROLES.EMPLOYEE) {
    throw new ApiError(403, "The daily board is available to admin and HR only.");
  }

  const board = await dailyBoard(req.user, req.query.date, req.query.departmentId);
  res.json({ ...board, rows: board.rows.map((row) => ({ ...row, record: serializeRecord(row.record) })) });
});

export const postCorrection = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, "attendance id");
  const record = await requestCorrection(req.user, req.params.id, {
    reason: sanitizeText(req.body?.reason, 500),
    newCheckInAt: req.body?.newCheckInAt,
    newCheckOutAt: req.body?.newCheckOutAt,
  });
  await audit(req.user, "attendance.correction_request", "attendance", String(record._id), {
    date: record.date,
    reason: record.correction.reason,
  }, req);
  res.status(201).json({ attendance: serializeRecord(record.toObject()) });
});

export const patchCorrection = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, "attendance id");
  const decision = req.body?.decision;

  if (![CORRECTION_STATUS.APPROVED, CORRECTION_STATUS.REJECTED].includes(decision)) {
    throw new ApiError(400, "decision must be approved or rejected.");
  }

  const record = await reviewCorrection(req.user, req.params.id, {
    decision,
    reviewNote: sanitizeText(req.body?.reviewNote, 500),
  });
  await audit(req.user, `attendance.correction_${decision}`, "attendance", String(record._id), {
    date: record.date,
    userId: String(record.userId),
  }, req);
  res.json({ attendance: serializeRecord(record.toObject()) });
});
