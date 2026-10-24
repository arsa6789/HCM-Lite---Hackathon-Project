import { ApiError } from "../utils/apiError.js";
import { env } from "../config/env.js";

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  let status = error.status ?? 500;
  let message = error.message ?? "Something went wrong.";

  if (error.name === "CastError") {
    status = 400;
    message = "Invalid identifier.";
  }

  if (error.code === 11000) {
    status = 409;
    message = "An account with this email already exists.";
  }

  if (error.name === "ValidationError") {
    status = 400;
    message = Object.values(error.errors)
      .map((item) => item.message)
      .join(" ");
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
