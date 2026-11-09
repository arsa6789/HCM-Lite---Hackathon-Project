import { supabase } from "./supabase";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api").replace(/\/$/, "");

function cleanMessage(value) {
  return String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
}

export function userFacingError(error) {
  const status = Number(error?.status ?? 0);
  const detail = cleanMessage(error?.detail ?? error?.message);
  if (!status || error?.kind === "network") return "The server is unavailable. Please try again in a moment.";
  if (status >= 500) return "This request cannot be completed right now. Please try again shortly.";
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You do not have permission to do that.";
  if (status === 404) return "That item is no longer available.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if ([400, 409, 422].includes(status)) return `Please check the information you entered: ${detail || "invalid information."}`;
  return "This request could not be completed. Please try again.";
}

async function authHeaders(headers = {}, accessToken) {
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
    return headers;
  }
  const { data, error } = await supabase?.auth.getSession() ?? {};
  if (error) {
    const failure = new Error("Your session could not be validated. Please sign in again.");
    failure.status = 401;
    throw failure;
  }
  const session = data?.session;
  if (!session?.access_token) {
    const failure = new Error("Your session has expired. Please sign in again.");
    failure.status = 401;
    throw failure;
  }
  headers.Authorization = `Bearer ${session.access_token}`;
  return headers;
}

async function parseError(response) {
  const data = await response.json().catch(() => ({}));
  const error = new Error();
  error.status = response.status;
  error.detail = cleanMessage(data.error);
  error.message = userFacingError(error);
  return error;
}

function makeNetworkError() {
  const error = new Error();
  error.kind = "network";
  error.message = userFacingError(error);
  return error;
}

export async function apiRequest(path, options = {}) {
  const { method = "GET", body, accessToken } = options;
  const headers = await authHeaders(body === undefined ? {} : { "Content-Type": "application/json" }, accessToken);
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error?.status) throw error;
    throw makeNetworkError();
  }
  if (!response.ok) throw await parseError(response);
  return response.json();
}

export async function apiDownload(path, filename) {
  const headers = await authHeaders();
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { headers });
  } catch (error) {
    if (error?.status) throw error;
    throw makeNetworkError();
  }
  if (!response.ok) throw await parseError(response);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}
