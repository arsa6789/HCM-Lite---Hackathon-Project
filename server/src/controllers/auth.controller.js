import User from "../models/User.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { signToken } from "../utils/tokens.js";
import { setAuthCookie, clearAuthCookie } from "../utils/cookies.js";
import { serializeUser } from "../access/policies.js";
import { resolveScope } from "../access/scope.js";
import { ROLES } from "../constants/roles.js";
import { assertEmail, assertPassword, normalizeEmail } from "../utils/validate.js";
import { sanitizeText } from "../utils/sanitize.js";
import { audit } from "../utils/audit.js";

function actorFrom(user) {
  return {
    id: String(user._id),
    role: user.role,
  };
}

export const signup = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password ?? "");

  assertEmail(email);
  assertPassword(password);

  const existing = await User.exists({ email });

  if (existing) {
    throw new ApiError(409, "An account with this email already exists.");
  }

  const user = await User.create({
    email,
    password: await hashPassword(password),
    role: ROLES.EMPLOYEE,
  });

  await audit({ id: String(user._id), role: user.role }, "auth.signup", "user", String(user._id), { email }, req);

  res.status(201).json({
    message: "Account created successfully! You can now log in.",
    user: serializeUser(user),
  });
});

export const login = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password ?? "");

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required.");
  }

  const user = await User.findOne({ email }).select("+password");

  if (!user) {
    await audit(null, "auth.login_failed", "user", null, { email: sanitizeText(email, 200) }, req);
    throw new ApiError(401, "Invalid email or password.");
  }

  const isMatch = await verifyPassword(password, user.password);

  if (!isMatch) {
    await audit({ id: String(user._id), role: user.role }, "auth.login_failed", "user", String(user._id), { email }, req);
    throw new ApiError(401, "Invalid email or password.");
  }

  const token = signToken(user);
  const actor = actorFrom(user);

  setAuthCookie(res, token);
  await audit(actor, "auth.login", "user", String(user._id), { email }, req);

  res.json({
    message: "Logged in successfully!",
    token,
    user: serializeUser(user),
    scope: resolveScope(actor),
  });
});

export const logout = asyncHandler(async (req, res) => {
  clearAuthCookie(res);
  res.json({ message: "Logged out successfully!" });
});

export const me = asyncHandler(async (req, res) => {
  res.json({
    user: serializeUser(req.account),
    scope: resolveScope(req.user),
  });
});
