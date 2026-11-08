import User from "../models/User.js";
import { connectSupabase, disconnectSupabase, getSupabaseAdmin } from "../config/supabase.js";
import { env } from "../config/env.js";
import { ROLES } from "../constants/roles.js";

async function run() {
  if (!env.seedAdminUid) {
    throw new Error("SEED_ADMIN_UID must be the ID of an existing Supabase Auth user.");
  }

  await connectSupabase();
  const { data, error } = await getSupabaseAdmin().auth.admin.getUserById(env.seedAdminUid);
  if (error || !data?.user) throw new Error(error?.message ?? "Supabase Auth user was not found.");
  const authUser = data.user;

  const existing = await User.findById(authUser.id);
  if (existing) {
    existing.email = authUser.email ?? existing.email;
    existing.role = ROLES.ADMIN;
    await existing.save();
    console.log("Admin role refreshed in the HCM user profile.");
  } else {
    await User.create({ _id: authUser.id, email: authUser.email ?? "", role: ROLES.ADMIN });
    console.log("Admin HCM user profile created.");
  }
  await disconnectSupabase();
}

run().catch(async (error) => {
  console.error(error.message);
  await disconnectSupabase().catch(() => {});
  process.exit(1);
});
