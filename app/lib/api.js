import { firebaseAuth } from "./firebase";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api").replace(/\/$/, "");

async function authHeaders(headers = {}) {
  const user = firebaseAuth?.currentUser;
  if (!user) throw new Error("Sign in to continue.");
  headers.Authorization = `Bearer ${await user.getIdToken()}`;
  return headers;
}

async function parseError(response) {
  const data = await response.json().catch(() => ({}));
  const error = new Error(data.error ?? "Request failed.");
  error.status = response.status;
  return error;
}

export async function apiRequest(path, options = {}) {
  const { method = "GET", body } = options;
  const headers = await authHeaders(body === undefined ? {} : { "Content-Type": "application/json" });
  let response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Cannot reach the Firebase API. Check that the backend is running.");
  }

  if (!response.ok) throw await parseError(response);
  return response.json();
}

export async function apiDownload(path, filename) {
  const headers = await authHeaders();
  let response;

  try {
    response = await fetch(`${API_URL}${path}`, { headers });
  } catch {
    throw new Error("Cannot reach the Firebase API. Check that the backend is running.");
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
