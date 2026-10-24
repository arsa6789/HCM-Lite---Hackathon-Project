import { env } from "../config/env.js";

export function readCookie(req, name) {
  const header = req.headers.cookie;

  if (!header) {
    return "";
  }

  for (const part of header.split(";")) {
    const index = part.indexOf("=");

    if (index === -1) {
      continue;
    }

    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }

  return "";
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    path: "/",
  };
}

export function setAuthCookie(res, token) {
  res.cookie(env.cookieName, token, {
    ...cookieOptions(),
    maxAge: env.cookieMaxAgeMs,
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(env.cookieName, cookieOptions());
}
