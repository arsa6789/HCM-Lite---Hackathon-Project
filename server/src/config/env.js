import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProduction = nodeEnv === "production";
const mongoKey = isProduction ? "MONGODB_URI_ONLINE" : "MONGODB_URI";
const required = ["JWT_SECRET", mongoKey];
const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

const activeMongoUri = process.env[mongoKey];

if (!/^mongodb(\+srv)?:\/\//.test(activeMongoUri)) {
  throw new Error(`${mongoKey} must start with mongodb:// or mongodb+srv://`);
}

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
  mongoUri: process.env.MONGODB_URI ?? "",
  mongoUriOnline: process.env.MONGODB_URI_ONLINE ?? "",
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  cookieName: process.env.COOKIE_NAME ?? "hcm_token",
  cookieSecure: process.env.COOKIE_SECURE === "true",
  cookieSameSite: process.env.COOKIE_SAME_SITE ?? "lax",
  cookieMaxAgeMs: Number(process.env.COOKIE_MAX_AGE_MS ?? 604800000),
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3001"),
  seedAdminEmail: process.env.SEED_ADMIN_EMAIL ?? "admin@hcm.local",
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD ?? "",
  aiApiKey: process.env.AI_API_KEY ?? "",
  aiBaseUrl: process.env.AI_BASE_URL ?? "https://openrouter.ai/api/v1",
  aiModel: process.env.AI_MODEL ?? "meta-llama/llama-3.3-70b-instruct:free",
});
