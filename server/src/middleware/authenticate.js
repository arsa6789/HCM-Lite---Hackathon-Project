import User from "../models/User.js";
import { ApiError } from "../utils/apiError.js";
import { readCookie } from "../utils/cookies.js";
import { env } from "../config/env.js";
import { verifyToken } from "../utils/tokens.js";

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization ?? "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const token = bearer || readCookie(req, env.cookieName);

    if (!token) {
      throw new ApiError(401, "Authentication required.");
    }

    let payload;

    try {
      payload = verifyToken(token);
    } catch {
      throw new ApiError(401, "Invalid or expired token.");
    }

    const account = await User.findById(payload.sub).lean();

    if (!account) {
      throw new ApiError(401, "Authentication required.");
    }

    req.account = account;
    req.user = {
      id: String(account._id),
      email: account.email,
      role: account.role,
    };

    next();
  } catch (error) {
    next(error);
  }
}
