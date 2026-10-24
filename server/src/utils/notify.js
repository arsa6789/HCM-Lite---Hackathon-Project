import Notification from "../models/Notification.js";
import User from "../models/User.js";

const MAX_RECIPIENTS = 5000;

export async function notifyUsers(userIds, { title, body = "", type = "system", link = "" }) {
  const unique = [...new Set(userIds.map((id) => String(id)))].slice(0, MAX_RECIPIENTS);

  if (unique.length === 0) {
    return;
  }

  try {
    await Notification.insertMany(
      unique.map((userId) => ({ userId, title, body, type, link })),
      { ordered: false }
    );
  } catch (error) {
    console.error("notification write failed:", error.message);
  }
}

export async function notifyRole(role, payload) {
  const users = await User.find({ role }).select("_id").lean();
  await notifyUsers(users.map((user) => user._id), payload);
}

export async function notifyAdminsAndHrs(payload) {
  const users = await User.find({ role: { $in: ["admin", "hr"] } }).select("_id").lean();
  await notifyUsers(users.map((user) => user._id), payload);
}
