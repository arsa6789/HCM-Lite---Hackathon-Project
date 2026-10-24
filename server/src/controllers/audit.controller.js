import AuditLog from "../models/AuditLog.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { ROLES } from "../constants/roles.js";
import { verifyAuditChain } from "../utils/audit.js";
import { parsePagination } from "../utils/validate.js";
import { isValidDayKey } from "../utils/dates.js";

function requireAdmin(req) {
  if (req.user.role !== ROLES.ADMIN) {
    throw new ApiError(403, "The audit log is available to admin only.");
  }
}

export const listAudit = asyncHandler(async (req, res) => {
  requireAdmin(req);

  const filter = {};

  if (req.query.action) {
    filter.action = String(req.query.action);
  }

  if (req.query.entity) {
    filter.entity = String(req.query.entity);
  }

  if (req.query.actorId) {
    filter.actorId = req.query.actorId;
  }

  if (req.query.from && isValidDayKey(req.query.from)) {
    filter.at = { ...filter.at, $gte: new Date(`${req.query.from}T00:00:00Z`) };
  }

  if (req.query.to && isValidDayKey(req.query.to)) {
    filter.at = { ...filter.at, $lte: new Date(`${req.query.to}T23:59:59Z`) };
  }

  const { page, limit, skip } = parsePagination(req.query);
  const total = await AuditLog.countDocuments(filter);
  const entries = await AuditLog.find(filter).sort({ seq: -1 }).skip(skip).limit(limit).lean();

  res.json({
    total,
    page,
    limit,
    entries: entries.map((entry) => ({
      seq: entry.seq,
      at: entry.at,
      actor: { id: entry.actorId ? String(entry.actorId) : null, role: entry.actorRole },
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      meta: entry.meta,
      ip: entry.ip,
      hash: entry.hash,
    })),
  });
});

export const verifyChain = asyncHandler(async (req, res) => {
  requireAdmin(req);
  res.json(await verifyAuditChain());
});
