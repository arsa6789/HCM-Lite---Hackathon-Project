import User from "../models/User.js";
import { connectDB, disconnectDB } from "../config/db.js";
import { env } from "../config/env.js";
import { hashPassword } from "../utils/password.js";
import { ROLES } from "../constants/roles.js";

async function run() {
  if (!env.seedAdminPassword) {
    throw new Error("SEED_ADMIN_PASSWORD is required to seed an admin.");
  }

  if (env.seedAdminPassword.length < 8) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 8 characters.");
  }

  await connectDB();

  const email = env.seedAdminEmail.trim().toLowerCase();
  const existing = await User.findOne({ email });

  if (existing) {
    console.log(`Admin already exists: ${email}`);
    await disconnectDB();
    return;
  }

  await User.create({
    email,
    password: await hashPassword(env.seedAdminPassword),
    role: ROLES.ADMIN,
  });

  console.log(`Admin created: ${email}`);
  await disconnectDB();
}

run().catch(async (error) => {
  console.error(error.message);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
