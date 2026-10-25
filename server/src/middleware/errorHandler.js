import { ApiError } from "../utils/apiError.js";
import { env } from "../config/env.js";

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  let status = error.status ?? 500;
  let message = error.message ?? "Something went wrong.";

  if (error.code === 6) {
    status = 409;
    message = error.message || "A record with a unique value already exists.";
  }

  if (error.type === "entity.parse.failed") {
    status = 400;
    message = "Invalid JSON body.";
  }

  if (!(error instanceof ApiError) && status >= 500) {
    console.error(error);
    message = env.nodeEnv === "production" ? "Something went wrong." : message;
  }

  res.status(status).json({ error: message });
}
