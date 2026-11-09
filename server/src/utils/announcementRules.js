import { ROLES, ROLE_VALUES } from "../constants/roles.js";
import { ApiError } from "./apiError.js";
import { assertDocumentId } from "./validate.js";
import { sanitizeMultiline, sanitizeText } from "./sanitize.js";

export function normalizeAnnouncementContent(titleValue, bodyValue) {
  const title = sanitizeText(titleValue, 150);
  const body = sanitizeMultiline(bodyValue, 4000);

  if (!title || !body) {
    throw new ApiError(400, "Title and body are required.");
  }

  return { title, body };
}

export function normalizeAnnouncementAudience(input = {}) {
  const type = input?.type ?? "all";

  if (!["all", "role", "department"].includes(type)) {
    throw new ApiError(400, "Invalid audience type.");
  }

  const audience = { type, role: null, departmentId: null };

  if (type === "role") {
    if (!ROLE_VALUES.includes(input?.role)) {
      throw new ApiError(400, "audience.role must be one of admin, hr, or employee.");
    }

    audience.role = input.role;
  }

  if (type === "department") {
    assertDocumentId(input?.departmentId, "audience.departmentId");
    audience.departmentId = input.departmentId;
  }

  return audience;
}

export function normalizeAnnouncementUpdate(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ApiError(400, "Announcement update must be an object.");
  }

  const update = {};

  if (input.title !== undefined) {
    update.title = sanitizeText(input.title, 150);
    if (!update.title) {
      throw new ApiError(400, "Title cannot be blank.");
    }
  }

  if (input.body !== undefined) {
    update.body = sanitizeMultiline(input.body, 4000);
    if (!update.body) {
      throw new ApiError(400, "Body cannot be blank.");
    }
  }

  if (input.pinned !== undefined) {
    update.pinned = Boolean(input.pinned);
  }

  return update;
}

export function canManageAnnouncement(user, announcement) {
  if (user?.role === ROLES.ADMIN) {
    return true;
  }

  return user?.role === ROLES.HR && Boolean(user.id) && String(announcement?.createdBy) === String(user.id);
}
