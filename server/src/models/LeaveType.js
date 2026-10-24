import mongoose from "mongoose";

const leaveTypeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100, unique: true },
  annualDays: { type: Number, required: true, min: 0, max: 365 },
  paid: { type: Boolean, default: true },
}, { timestamps: true, versionKey: false });

export default mongoose.models.LeaveType || mongoose.model("LeaveType", leaveTypeSchema);
