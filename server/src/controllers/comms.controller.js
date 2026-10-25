import Announcement from "../models/Announcement.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { assertDocumentId } from "../utils/validate.js";
import { sanitizeMultiline, sanitizeText } from "../utils/sanitize.js";
import { ROLES } from "../constants/roles.js";
import { audit } from "../utils/audit.js";
import { notifyUsers } from "../utils/notify.js";
import { parsePagination } from "../utils/validate.js";

function serializeAnnouncement(item) {
  return {
    id: String(item._id),
    title: item.title,
    body: item.body,
    audience: {
      type: item.audience.type,
      role: item.audience.role ?? null,
      departmentId: item.audience.departmentId ? String(item.audience.departmentId) : null,
    },
    pinned: item.pinned,
    createdBy: item.createdBy ? String(item.createdBy) : null,
    createdAt: item.createdAt,
  };
}

async function audienceUserIds(audience) {
  if (audience.type === "role") {
    const users = await User.find({ role: audience.role }).select("_id").lean();
    return users.map((user) => user._id);
  }

  if (audience.type === "department") {
    const users = await User.find({ departmentId: audience.departmentId }).select("_id").lean();
    return users.map((user) => user._id);
  }

  const users = await User.find({}).select("_id").lean();
  return users.map((user) => user._id);
}

function visibleTo(item, user) {
  if (item.audience.type === "all") {
    return true;
  }

  if (item.audience.type === "role") {
    return item.audience.role === user.role;
  }

  return Boolean(
    item.audience.departmentId && user.departmentId && String(item.audience.departmentId) === String(user.departmentId)
  );
}

export const listAnnouncements = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const user = await User.findById(req.user.id).select("role departmentId").lean();
  const filter = req.user.role === ROLES.ADMIN || req.user.role === ROLES.HR
    ? {}
    : {
        $or: [
          { "audience.type": "all" },
          { "audience.type": "role", "audience.role": user.role },
          { "audience.type": "department", "audience.departmentId": user.departmentId ?? null },
        ],
      };

  const total = await Announcement.countDocuments(filter);
  const items = await Announcement.find(filter)
    .sort({ pinned: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  res.json({ total, page, limit, announcements: items.map(serializeAnnouncement) });
});

export const createAnnouncement = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.ADMIN && req.user.role !== ROLES.HR) {
    throw new ApiError(403, "Only admin and HR can post announcements.");
  }

  const title = sanitizeText(req.body?.title, 150);
  const body = sanitizeMultiline(req.body?.body, 4000);

  if (!title || !body) {
    throw new ApiError(400, "Title and body are required.");
  }

  const type = req.body?.audience?.type ?? "all";

  if (!["all", "role", "department"].includes(type)) {
    throw new ApiError(400, "Invalid audience type.");
  }

  const audience = { type, role: null, departmentId: null };

  if (type === "role") {
    if (!["admin", "hr", "employee"].includes(req.body?.audience?.role)) {
      throw new ApiError(400, "audience.role is required for role audiences.");
    }

    audience.role = req.body.audience.role;
  }

  if (type === "department") {
    assertDocumentId(req.body?.audience?.departmentId, "audience.departmentId");
    audience.departmentId = req.body.audience.departmentId;
  }

  const announcement = await Announcement.create({
    title,
    body,
    audience,
    pinned: Boolean(req.body?.pinned),
    createdBy: req.user.id,
  });

  await notifyUsers(await audienceUserIds(audience), {
    title: `Announcement: ${title}`,
    body: body.slice(0, 200),
    type: "announcement",
    link: "/console/announcements",
  });

  await audit(req.user, "announcement.create", "announcement", String(announcement._id), { title }, req);

  res.status(201).json({ announcement: serializeAnnouncement(announcement.toObject()) });
});

export const updateAnnouncement = asyncHandler(async (req, res) => {
  assertDocumentId(req.params.id, "announcement id");
  const announcement = await Announcement.findById(req.params.id);

  if (!announcement) {
    throw new ApiError(404, "Announcement not found.");
  }

  if (req.user.role !== ROLES.ADMIN && String(announcement.createdBy) !== req.user.id) {
    throw new ApiError(403, "You can only edit your own announcements.");
  }

  if (req.body?.title !== undefined) {
    announcement.title = sanitizeText(req.body.title, 150);
  }

  if (req.body?.body !== undefined) {
    announcement.body = sanitizeMultiline(req.body.body, 4000);
  }

  if (req.body?.pinned !== undefined) {
    announcement.pinned = Boolean(req.body.pinned);
  }

  await announcement.save();
  await audit(req.user, "announcement.update", "announcement", String(announcement._id), { title: announcement.title }, req);

  res.json({ announcement: serializeAnnouncement(announcement.toObject()) });
});

export const deleteAnnouncement = asyncHandler(async (req, res) => {
  assertDocumentId(req.params.id, "announcement id");
  const announcement = await Announcement.findById(req.params.id);

  if (!announcement) {
    throw new ApiError(404, "Announcement not found.");
  }

  if (req.user.role !== ROLES.ADMIN && String(announcement.createdBy) !== req.user.id) {
    throw new ApiError(403, "You can only delete your own announcements.");
  }

  await announcement.deleteOne();
  await audit(req.user, "announcement.delete", "announcement", String(announcement._id), { title: announcement.title }, req);

  res.json({ message: "Deleted." });
});

export const listNotifications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = { userId: req.user.id };
  const [total, unread, items] = await Promise.all([
    Notification.countDocuments(filter),
    Notification.countDocuments({ ...filter, read: false }),
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
  ]);

  res.json({
    total,
    unread,
    page,
    limit,
    notifications: items.map((item) => ({
      id: String(item._id),
      title: item.title,
      body: item.body,
      type: item.type,
      link: item.link,
      read: item.read,
      createdAt: item.createdAt,
    })),
  });
});

export const markRead = asyncHandler(async (req, res) => {
  assertDocumentId(req.params.id, "notification id");
  const notification = await Notification.findOne({ _id: req.params.id, userId: req.user.id });

  if (!notification) {
    throw new ApiError(404, "Notification not found.");
  }

  notification.read = true;
  await notification.save();
  res.json({ notification: { id: String(notification._id), read: true } });
});

export const markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ userId: req.user.id, read: false }, { $set: { read: true } });
  res.json({ message: "All notifications marked as read." });
});
