import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const nodeEnv = process.env.NODE_ENV ?? "development";
// Backend credentials are checked only when a Supabase operation is performed,
// allowing health and error responses to remain available when misconfigured.

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
  supabaseUrl: process.env.SUPABASE_URL?.trim() ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "",
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3001"),
  seedAdminUid: process.env.SEED_ADMIN_UID ?? "",
  aiApiKey: process.env.AI_API_KEY ?? "",
  aiBaseUrl: process.env.AI_BASE_URL ?? "https://openrouter.ai/api/v1",
  aiModel: process.env.AI_MODEL ?? "meta-llama/llama-3.3-70b-instruct:free",
});
