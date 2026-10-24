import mongoose from "mongoose";
import { ATTENDANCE_STATUS_VALUES, CORRECTION_STATUS_VALUES } from "../constants/statuses.js";

const geoSchema = new mongoose.Schema({
  lat: { type: Number, default: null },
  lng: { type: Number, default: null },
  accuracyM: { type: Number, default: null },
}, { _id: false });

const attendanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  checkInAt: { type: Date, default: null },
  checkOutAt: { type: Date, default: null },
  checkInGeo: { type: geoSchema, default: null },
  checkOutGeo: { type: geoSchema, default: null },
  status: { type: String, enum: ATTENDANCE_STATUS_VALUES, required: true, index: true },
  minutesLate: { type: Number, default: 0 },
  workedMinutes: { type: Number, default: 0 },
  source: { type: String, enum: ["web", "system"], default: "web" },
  correction: {
    status: { type: String, enum: CORRECTION_STATUS_VALUES, default: null },
    reason: { type: String, maxlength: 500, default: "" },
    newCheckInAt: { type: Date, default: null },
    newCheckOutAt: { type: Date, default: null },
    requestedAt: { type: Date, default: null },
    reviewNote: { type: String, maxlength: 500, default: "" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
  },
}, { timestamps: true, versionKey: false });

attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

export default mongoose.models.Attendance || mongoose.model("Attendance", attendanceSchema);
