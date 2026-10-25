import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { serializeUser } from "../access/policies.js";
import { resolveScope } from "../access/scope.js";

export const signup = asyncHandler(async (req, res) => {
  throw new ApiError(410, "Use Firebase Authentication to create an account.");
});

export const login = asyncHandler(async (req, res) => {
  throw new ApiError(410, "Use Firebase Authentication to sign in, then send its ID token as a Bearer token.");
});

export const logout = asyncHandler(async (req, res) => {
  res.json({ message: "Sign out through Firebase Authentication on the client." });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: serializeUser(req.account), scope: resolveScope(req.user) });
});
