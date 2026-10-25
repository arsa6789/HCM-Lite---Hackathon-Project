import { createApp } from "./app.js";
import { connectFirestore, disconnectFirestore } from "./config/firestore.js";
import { env } from "./config/env.js";
import { pathToFileURL } from "node:url";

const app = createApp();
export default app;

async function start() {
  await connectFirestore();

  const server = createApp().listen(env.port, () => {
    console.log(`API listening on http://localhost:${env.port}`);
  });

  async function shutdown(signal) {
    console.log(`${signal} received, shutting down.`);
    server.close(async () => {
      await disconnectFirestore();
      process.exit(0);
    });
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";

if (import.meta.url === invokedPath) {
  start().catch((error) => {
    console.error("Failed to start API:", error.message);

    if (error.code === 5 || error.code === 7 || error.code === 16) {
      console.error("Check Firestore is enabled and Firebase Admin credentials are configured for this project.");
    }

    process.exit(1);
  });
}
