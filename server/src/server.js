import { createApp } from "./app.js";
import { connectDB, disconnectDB } from "./config/db.js";
import { env } from "./config/env.js";

async function start() {
  await connectDB();

  const server = createApp().listen(env.port, () => {
    console.log(`API listening on http://localhost:${env.port}`);
  });

  async function shutdown(signal) {
    console.log(`${signal} received, shutting down.`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((error) => {
  console.error("Failed to start API:", error.message);

  if (error.name === "MongooseServerSelectionError" || error.name === "MongoServerSelectionError") {
    console.error(
      env.nodeEnv === "production"
        ? "Check MONGODB_URI_ONLINE and the network access rules of your MongoDB host."
        : "MongoDB is not reachable. Start a local instance with: npm run db:start"
    );
  }

  process.exit(1);
});
