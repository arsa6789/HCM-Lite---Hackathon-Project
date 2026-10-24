import express from "express";
import cors from "cors";
import routes from "./routes/index.js";
import { env } from "./config/env.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { rateLimit } from "./utils/rateLimit.js";

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
        callback(null, !origin || env.corsOrigins.includes(origin));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );

  app.use(express.json({ limit: "1mb" }));

  app.get(["/health", "/api/health"], (req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  app.use("/api", rateLimit({ windowMs: 60_000, max: 300 }), routes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
