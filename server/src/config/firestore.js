import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { env } from "./env.js";

let firestoreInstance;

export function getFirestoreDb() {
  if (firestoreInstance) return firestoreInstance;

  if (!env.firebaseProjectId) {
    throw new Error(
      "FIREBASE_PROJECT_ID is required. Add it to the API deployment environment."
    );
  }

  const adcPath = process.env.CLOUDSDK_CONFIG
    ? join(process.env.CLOUDSDK_CONFIG, "application_default_credentials.json")
    : join(homedir(), ".config", "gcloud", "application_default_credentials.json");
  const hasServiceAccountCredentials = env.firebaseServiceAccountJson || env.firebaseServiceAccountBase64 || env.firebaseServiceAccountPath;
  const hasLocalCredentials = existsSync(adcPath);
  const hasManagedCredentials = process.env.K_SERVICE || process.env.GAE_ENV || process.env.GCE_METADATA_HOST;

  if (!hasServiceAccountCredentials && !hasLocalCredentials && !process.env.FIRESTORE_EMULATOR_HOST && !hasManagedCredentials) {
    throw new Error(
      "Firebase Admin credentials are missing. Set FIREBASE_SERVICE_ACCOUNT_JSON (Vercel), GOOGLE_APPLICATION_CREDENTIALS, use Google Cloud workload identity, or configure FIRESTORE_EMULATOR_HOST."
    );
  }

  let credential;
  if (env.firebaseServiceAccountJson) {
    credential = cert(JSON.parse(env.firebaseServiceAccountJson));
  } else if (env.firebaseServiceAccountBase64) {
    const json = Buffer.from(env.firebaseServiceAccountBase64, "base64").toString("utf8");
    credential = cert(JSON.parse(json));
  } else if (env.firebaseServiceAccountPath) {
    credential = cert(JSON.parse(readFileSync(env.firebaseServiceAccountPath, "utf8")));
  } else {
    credential = applicationDefault();
  }
  const app = getApps()[0] ?? initializeApp({ credential, projectId: env.firebaseProjectId });

  firestoreInstance = env.firebaseDatabaseId
    ? getFirestore(app, env.firebaseDatabaseId)
    : getFirestore(app);
  return firestoreInstance;
}

export function getFirebaseAuth() {
  if (getApps().length === 0) getFirestoreDb();
  return getAuth(getApps()[0]);
}

export async function connectFirestore() {
  const db = getFirestoreDb();
  await db.collection("_health").doc("connection").get();
  console.log(`Connected to Firebase project ${env.firebaseProjectId}.`);
  return db;
}

export async function disconnectFirestore() {
  firestoreInstance = undefined;
}
