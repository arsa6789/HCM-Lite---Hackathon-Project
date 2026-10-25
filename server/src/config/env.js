import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const nodeEnv = process.env.NODE_ENV ?? "development";
// Do not throw while this module is being imported. On serverless platforms that
// would crash the function before Express has a chance to add CORS headers (or
// return a useful JSON error). Firebase configuration is checked at the point
// where the Admin SDK is first needed instead.
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID?.trim() ?? "";

const port = Number(process.env.PORT ?? 4000);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error("PORT must be a positive integer.");
}

function parseOrigins(value) {
  return String(value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export const env = Object.freeze({
  nodeEnv,
  port,
  firebaseProjectId,
  firebaseDatabaseId: process.env.FIREBASE_DATABASE_ID ?? "",
  firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "",
  firebaseServiceAccountBase64: process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 ?? "",
  firebaseServiceAccountPath: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "",
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3001"),
  seedAdminUid: process.env.SEED_ADMIN_UID ?? "",
  aiApiKey: process.env.AI_API_KEY ?? "",
  aiBaseUrl: process.env.AI_BASE_URL ?? "https://openrouter.ai/api/v1",
  aiModel: process.env.AI_MODEL ?? "meta-llama/llama-3.3-70b-instruct:free",
});
