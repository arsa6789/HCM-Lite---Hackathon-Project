import { ApiError } from "../utils/apiError.js";

export function authorizeRoles(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.user) {
      return next(new ApiError(401, "Authentication required."));
    }

    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, "You do not have access to this resource."));
    }

    next();
  };
}
