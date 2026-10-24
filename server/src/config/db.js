import mongoose from "mongoose";
import { env } from "./env.js";

let connectionPromise = null;

export function isProductionDatabase() {
  return env.nodeEnv === "production";
}

export function activeMongoUri() {
  return isProductionDatabase() ? env.mongoUriOnline : env.mongoUri;
}

export function activeDatabaseLabel() {
  return isProductionDatabase() ? "online" : "local";
}

export function connectDB() {
  if (!connectionPromise) {
    console.log(`Using the ${activeDatabaseLabel()} MongoDB.`);

    connectionPromise = mongoose.connect(activeMongoUri(), {
      bufferCommands: false,
      serverSelectionTimeoutMS: isProductionDatabase() ? 10000 : 5000,
    });

    connectionPromise.catch(() => {
      connectionPromise = null;
    });
  }

  return connectionPromise;
}

export async function disconnectDB() {
  await mongoose.disconnect();
  connectionPromise = null;
}
