import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { assertObjectId } from "../utils/validate.js";
import { sanitizeText } from "../utils/sanitize.js";
import { LEAVE_STATUS } from "../constants/statuses.js";
import {
  balancesFor,
  applyLeave,
  listApplications,
  reviewApplication,
  cancelApplication,
} from "../services/leaveService.js";
import { audit } from "../utils/audit.js";

function serializeApplication(app) {
  return {
    id: String(app._id),
    userId: String(app.userId?._id ?? app.userId),
    email: app.userId?.email ?? null,
    fullName: app.userId?.fullName ?? null,
    leaveTypeId: String(app.leaveTypeId?._id ?? app.leaveTypeId),
    leaveTypeName: app.leaveTypeId?.name ?? null,
    paid: app.leaveTypeId?.paid ?? null,
    fromDate: app.fromDate,
    toDate: app.toDate,
    days: app.days,
    reason: app.reason,
    status: app.status,
    reviewNote: app.reviewNote,
    reviewedAt: app.reviewedAt,
    createdAt: app.createdAt,
  };
}

export const getBalances = asyncHandler(async (req, res) => {
  const year = Number(req.query.year ?? new Date().getFullYear()) || new Date().getFullYear();
  const balances = await balancesFor(req.user, req.query.userId, String(year));
  res.json({ balances });
});

export const postApplication = asyncHandler(async (req, res) => {
  const { leaveTypeId, fromDate, toDate } = req.body ?? {};

  if (!leaveTypeId) {
    throw new ApiError(400, "leaveTypeId is required.");
  }

  const application = await applyLeave(req.user, {
    leaveTypeId,
    fromDate,
    toDate,
    reason: sanitizeText(req.body?.reason, 500),
  });

  await audit(req.user, "leave.apply", "leave", String(application._id), {
    fromDate,
    toDate,
    days: application.days,
    leaveTypeId,
  }, req);

  res.status(201).json({ application: serializeApplication(application.toObject()) });
});

export const getApplications = asyncHandler(async (req, res) => {
  const result = await listApplications(req.user, req.query);
  res.json({ ...result, applications: result.applications.map(serializeApplication) });
});

export const patchReview = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, "application id");
  const decision = req.body?.decision;

  if (![LEAVE_STATUS.APPROVED, LEAVE_STATUS.REJECTED].includes(decision)) {
    throw new ApiError(400, "decision must be approved or rejected.");
  }

  const application = await reviewApplication(req.user, req.params.id, {
    decision,
    reviewNote: sanitizeText(req.body?.reviewNote, 500),
  });

  await audit(req.user, `leave.${decision}`, "leave", String(application._id), {
    userId: String(application.userId),
    days: application.days,
  }, req);

  res.json({ application: serializeApplication(application.toObject()) });
});

export const patchCancel = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, "application id");
  const application = await cancelApplication(req.user, req.params.id);
  await audit(req.user, "leave.cancel", "leave", String(application._id), {}, req);
  res.json({ application: serializeApplication(application.toObject()) });
});
