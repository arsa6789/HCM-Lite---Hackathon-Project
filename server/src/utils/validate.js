import { ApiError } from "../utils/apiError.js";
import { ROLE_VALUES } from "../constants/roles.js";

const EMAIL_REGEX = /^\S+@\S+\.\S+$/;

export function assertDocumentId(value, field = "identifier") {
  const id = String(value ?? "");
  if (!/^[A-Za-z0-9_-]{1,150}$/.test(id)) {
    throw new ApiError(400, `Invalid ${field}.`);
  }
}

export function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function assertEmail(email) {
  if (!email) {
    throw new ApiError(400, "Email is required.");
  }

  if (!EMAIL_REGEX.test(email)) {
    throw new ApiError(400, "Please enter a valid email address.");
  }
}

export function assertPassword(password) {
  if (!password) {
    throw new ApiError(400, "Password is required.");
  }

  if (password.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters long.");
  }
}

export function assertRole(role) {
  if (!ROLE_VALUES.includes(role)) {
    throw new ApiError(400, "Invalid role.");
  }
}

export function optionalText(value, field, maxLength = 120) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return "";
  }

  const text = String(value).trim();

  if (text.length > maxLength) {
    throw new ApiError(400, `${field} must be at most ${maxLength} characters.`);
  }

  return text;
}

export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parsePagination(query) {
  const page = Math.max(Number(query.page ?? 1) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit ?? 50) || 50, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
}
