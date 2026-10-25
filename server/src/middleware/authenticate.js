import User from "../models/User.js";
import { ApiError } from "../utils/apiError.js";
import { getFirebaseAuth } from "../config/firestore.js";
import { ROLES } from "../constants/roles.js";

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

    if (!token) {
      throw new ApiError(401, "Authentication required.");
    }

    let payload;

    try {
      payload = await getFirebaseAuth().verifyIdToken(token);
    } catch {
      throw new ApiError(401, "Invalid or expired token.");
    }

    const role = Object.values(ROLES).includes(payload.role) ? payload.role : ROLES.EMPLOYEE;
    let account = await User.findById(payload.uid);
    if (!account) account = await User.create({ _id: payload.uid, email: payload.email ?? "", role });
    else if (account.role !== role) {
      account.role = role;
      await account.save();
    }

    req.account = account.toObject();
    req.user = {
      id: String(payload.uid),
      email: payload.email ?? account.email,
      role,
    };

    next();
  } catch (error) {
    next(error);
  }
}
