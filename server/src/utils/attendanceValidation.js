import { isValid, parseISO } from "date-fns";
import { ApiError } from "./apiError.js";
import { sanitizeText } from "./sanitize.js";

const MAX_CORRECTION_REASON_LENGTH = 500;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?$/;

function parseCorrectionTimestamp(value, field) {
  if (value === undefined || value === null) {
    return null;
  }

  if (value instanceof Date) {
    if (!isValid(value)) {
      throw new ApiError(400, `${field} must be a valid timestamp.`);
    }

    return new Date(value.getTime());
  }

  if (typeof value !== "string" || !ISO_TIMESTAMP_PATTERN.test(value)) {
    throw new ApiError(400, `${field} must be a valid ISO timestamp.`);
  }

  const timestamp = parseISO(value);

  if (!isValid(timestamp)) {
    throw new ApiError(400, `${field} must be a valid ISO timestamp.`);
  }

  return timestamp;
}

function effectiveTimestamp(proposed, current, field) {
  if (proposed !== null) {
    return proposed;
  }

  if (current === undefined || current === null) {
    return null;
  }

  const timestamp = current instanceof Date ? current : new Date(current);

  if (!isValid(timestamp)) {
    throw new ApiError(400, `The existing ${field} timestamp is invalid.`);
  }

  return timestamp;
}

export function validateCorrectionInput(payload = {}, currentRecord = {}) {
  const rawReason = payload.reason;

  if (typeof rawReason !== "string") {
    throw new ApiError(400, "A correction reason is required.");
  }

  // Read one character beyond the accepted limit so oversized input is rejected, not silently truncated.
  const reason = sanitizeText(rawReason, MAX_CORRECTION_REASON_LENGTH + 1);

  if (!reason) {
    throw new ApiError(400, "A correction reason is required.");
  }

  if (reason.length > MAX_CORRECTION_REASON_LENGTH) {
    throw new ApiError(400, `Correction reason must be ${MAX_CORRECTION_REASON_LENGTH} characters or fewer.`);
  }

  const newCheckInAt = parseCorrectionTimestamp(payload.newCheckInAt, "newCheckInAt");
  const newCheckOutAt = parseCorrectionTimestamp(payload.newCheckOutAt, "newCheckOutAt");
  const effectiveCheckIn = effectiveTimestamp(newCheckInAt, currentRecord.checkInAt, "check-in");
  const effectiveCheckOut = effectiveTimestamp(newCheckOutAt, currentRecord.checkOutAt, "check-out");

  if (effectiveCheckIn && effectiveCheckOut && effectiveCheckIn.getTime() >= effectiveCheckOut.getTime()) {
    throw new ApiError(400, "Check-in timestamp must be earlier than check-out timestamp.");
  }

  return { reason, newCheckInAt, newCheckOutAt };
}
