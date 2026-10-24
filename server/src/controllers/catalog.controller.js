import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { sanitizeText } from "../utils/sanitize.js";
import { isValidDayKey } from "../utils/dates.js";
import { audit } from "../utils/audit.js";

// Generic admin-managed catalog CRUD shared by departments, designations,
// leave types and holidays. Every create/update/delete is audit-logged.
export function makeCatalogController({ Model, entity, fields, normalize }) {
  function serialize(item) {
    return { id: String(item._id), ...fields.reduce((acc, field) => ({ ...acc, [field]: item[field] }), {}) };
  }

  async function applyFields(item, body, { partial = false } = {}) {
    const payload = normalize(body);
    const denied = Object.keys(body ?? {}).filter((field) => !fields.includes(field));

    if (denied.length > 0) {
      throw new ApiError(403, `You cannot set these fields: ${denied.join(", ")}.`);
    }

    if (!partial && payload.name === undefined) {
      throw new ApiError(400, "Name is required.");
    }

    if (payload.name !== undefined) {
      item.name = payload.name;
    }

    for (const field of fields.filter((f) => f !== "name")) {
      if (payload[field] !== undefined) {
        item[field] = payload[field];
      }
    }

    return item;
  }

  return {
    list: asyncHandler(async (req, res) => {
      const items = await Model.find().sort({ name: 1 }).lean();
      res.json({ items: items.map((item) => serialize(item)) });
    }),

    create: asyncHandler(async (req, res) => {
      const item = new Model();
      await applyFields(item, req.body);
      await item.save();
      await audit(req.user, `${entity}.create`, entity, String(item._id), { after: serialize(item.toObject()) }, req);
      res.status(201).json({ item: serialize(item.toObject()) });
    }),

    update: asyncHandler(async (req, res) => {
      const item = await Model.findById(req.params.id);

      if (!item) {
        throw new ApiError(404, "Record not found.");
      }

      const before = serialize(item.toObject());
      await applyFields(item, req.body, { partial: true });
      await item.save();
      await audit(req.user, `${entity}.update`, entity, String(item._id), { before, after: serialize(item.toObject()) }, req);
      res.json({ item: serialize(item.toObject()) });
    }),

    remove: asyncHandler(async (req, res) => {
      const item = await Model.findById(req.params.id);

      if (!item) {
        throw new ApiError(404, "Record not found.");
      }

      await item.deleteOne();
      await audit(req.user, `${entity}.delete`, entity, String(item._id), { before: serialize(item.toObject()) }, req);
      res.json({ message: "Deleted." });
    }),
  };
}

export function normalizeNameOnly(body) {
  return {
    name: body?.name !== undefined ? sanitizeText(body.name, 100) : undefined,
    description: body?.description !== undefined ? sanitizeText(body.description, 250) : undefined,
  };
}

export function normalizeLeaveType(body) {
  const out = normalizeNameOnly(body);

  if (body?.annualDays !== undefined) {
    const days = Number(body.annualDays);

    if (!Number.isFinite(days) || days < 0 || days > 365) {
      throw new ApiError(400, "annualDays must be between 0 and 365.");
    }

    out.annualDays = days;
  }

  if (body?.paid !== undefined) {
    out.paid = Boolean(body.paid);
  }

  return out;
}

export function normalizeHoliday(body) {
  const out = normalizeNameOnly(body);

  if (body?.date !== undefined) {
    if (!isValidDayKey(body.date)) {
      throw new ApiError(400, "date must be in YYYY-MM-DD format.");
    }

    out.date = body.date;
  }

  if (body?.recurring !== undefined) {
    out.recurring = Boolean(body.recurring);
  }

  return out;
}
