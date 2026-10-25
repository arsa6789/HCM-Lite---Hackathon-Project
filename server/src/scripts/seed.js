import User from "../models/User.js";
import { connectFirestore, disconnectFirestore, getFirebaseAuth } from "../config/firestore.js";
import { env } from "../config/env.js";
import { ROLES } from "../constants/roles.js";

async function run() {
  if (!env.seedAdminUid) {
    throw new Error("SEED_ADMIN_UID must be the UID of an existing Firebase Authentication user.");
  }

  await connectFirestore();
  const authUser = await getFirebaseAuth().getUser(env.seedAdminUid);
  await getFirebaseAuth().setCustomUserClaims(authUser.uid, { ...(authUser.customClaims ?? {}), role: ROLES.ADMIN });

  const existing = await User.findById(authUser.uid);
  if (existing) {
    existing.email = authUser.email ?? existing.email;
    existing.role = ROLES.ADMIN;
    await existing.save();
    console.log("Firebase admin role refreshed in Firestore.");
  } else {
    await User.create({ _id: authUser.uid, email: authUser.email ?? "", role: ROLES.ADMIN });
    console.log("Firebase admin profile created in Firestore.");
  }
  await disconnectFirestore();
}

run().catch(async (error) => {
  console.error(error.message);
  await disconnectFirestore().catch(() => {});
  process.exit(1);
});
