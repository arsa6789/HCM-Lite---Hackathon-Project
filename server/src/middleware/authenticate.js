import User from "../models/User.js";
import { ApiError } from "../utils/apiError.js";
import { getSupabaseAdmin } from "../config/supabase.js";
import { ROLES } from "../constants/roles.js";

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) throw new ApiError(401, "Authentication required.");

    const { data, error } = await getSupabaseAdmin().auth.getUser(token);
    if (error || !data?.user) {
      console.warn("[hcm-auth] Supabase rejected API bearer token", {
        status: error?.status ?? null,
        code: error?.code ?? null,
      });
      throw new ApiError(401, "Invalid or expired access token.");
    }
    const authUser = data.user;
    let account = await User.findById(authUser.id);
    if (!account) {
      account = await User.create({ _id: authUser.id, email: authUser.email ?? "", role: ROLES.EMPLOYEE });
    }

    // The app profile is the sole role source; JWT/user metadata is never trusted.
    const role = Object.values(ROLES).includes(account.role) ? account.role : ROLES.EMPLOYEE;
    if (account.role !== role) {
      account.role = role;
      await account.save();
    }
    if (authUser.email && account.email !== authUser.email) {
      account.email = authUser.email;
      await account.save();
    }

    req.account = account.toObject();
    req.user = { id: String(authUser.id), email: authUser.email ?? account.email, role };
    next();
  } catch (error) {
    next(error);
  }
}
