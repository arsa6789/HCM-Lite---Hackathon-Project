import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true, maxlength: 150 },
  body: { type: String, maxlength: 500, default: "" },
  type: { type: String, enum: ["leave", "payroll", "announcement", "attendance", "system"], default: "system" },
  link: { type: String, maxlength: 200, default: "" },
  read: { type: Boolean, default: false, index: true },
}, { timestamps: true, versionKey: false });

notificationSchema.index({ userId: 1, read: 1 });

export default mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
