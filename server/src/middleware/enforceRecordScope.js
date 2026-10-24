import User from "../models/User.js";
import { ApiError } from "../utils/apiError.js";
import { canAccessRecord } from "../access/scope.js";

export function enforceRecordScope(param = "id") {
  return async function scopeGuard(req, res, next) {
    try {
      const record = await User.findById(req.params[param]).lean();

      if (!record) {
        throw new ApiError(404, "User not found.");
      }

      if (!canAccessRecord(req.user, record)) {
        throw new ApiError(403, "You do not have access to this record.");
      }

      req.targetUser = record;
      next();
    } catch (error) {
      next(error);
    }
  };
}
