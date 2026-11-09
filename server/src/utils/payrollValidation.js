import { monthKey, monthRange } from "./dates.js";
import { ApiError } from "./apiError.js";

export function validatePayrollMonth(month, now = new Date()) {
  const range = monthRange(month);

  if (!range) {
    throw new ApiError(400, "month must be a valid calendar month in YYYY-MM format (for example, 2026-10).");
  }

  if (String(month) > monthKey(now)) {
    throw new ApiError(400, `Cannot prepare a payroll run for future month ${month}.`);
  }

  return range;
}
