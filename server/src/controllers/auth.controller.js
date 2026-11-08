import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { serializeUser } from "../access/policies.js";
import { resolveScope } from "../access/scope.js";

export const signup = asyncHandler(async (req, res) => {
  throw new ApiError(410, "Create accounts through Supabase Auth on the client.");
});

export const login = asyncHandler(async (req, res) => {
  throw new ApiError(410, "Sign in through Supabase Auth on the client, then send its access token as a Bearer token.");
});

export const logout = asyncHandler(async (req, res) => {
  res.json({ message: "Sign out through Supabase Auth on the client." });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: serializeUser(req.account), scope: resolveScope(req.user) });
});
