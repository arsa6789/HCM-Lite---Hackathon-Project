import express from "express";
import cors from "cors";
import { fileURLToPath } from "node:url";
import routes from "./routes/index.js";
import { env } from "./config/env.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { rateLimit } from "./utils/rateLimit.js";

const publicDirectory = fileURLToPath(new URL("../public", import.meta.url));

export function createApp() {
  const app = express();

  app.disable("x-powered-by");

  if (env.nodeEnv === "production") {
    app.set("trust proxy", 1);
  }

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    next();
  });

  app.use(
    cors({
      origin(origin, callback) {
        // Requests without Origin are server-to-server requests, curl, and
        // health checks. Browser requests must exactly match an allowlisted
        // frontend origin; this keeps Bearer-token API access from being
        // exposed to arbitrary sites.
        callback(null, !origin || env.corsOrigins.includes(origin));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 86_400,
      optionsSuccessStatus: 204,
    })
  );

  app.use(express.json({ limit: "1mb" }));

  app.get("/", (req, res) => {
    res.sendFile("index.html", { root: publicDirectory });
  });

  app.get(["/health", "/api/health"], (req, res) => {
    res.json({
      status: "ok",
      uptime: process.uptime(),
      firebaseConfigured: Boolean(env.firebaseProjectId),
    });
  });

  app.use("/api", rateLimit({ windowMs: 60_000, max: 300 }), routes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

// Vercel's Node.js runtime loads the default export when it detects this file
// as a serverless entrypoint. Keep the factory export for the local server and
// tests, while also exposing a ready-to-handle Express application.
export default createApp();
