import mongoose from "mongoose";
import { LEAVE_STATUS_VALUES } from "../constants/statuses.js";

const leaveApplicationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  leaveTypeId: { type: mongoose.Schema.Types.ObjectId, ref: "LeaveType", required: true, index: true },
  fromDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  toDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  days: { type: Number, required: true, min: 1 },
  reason: { type: String, trim: true, maxlength: 500, default: "" },
  status: { type: String, enum: LEAVE_STATUS_VALUES, default: "pending", index: true },
  reviewNote: { type: String, maxlength: 500, default: "" },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

leaveApplicationSchema.index({ userId: 1, fromDate: 1, toDate: 1 });

export default mongoose.models.LeaveApplication || mongoose.model("LeaveApplication", leaveApplicationSchema);
