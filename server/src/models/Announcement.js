import mongoose from "mongoose";
import { ROLE_VALUES } from "../constants/roles.js";

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 150 },
  body: { type: String, required: true, trim: true, maxlength: 4000 },
  audience: {
    type: { type: String, enum: ["all", "role", "department"], default: "all" },
    role: { type: String, enum: [...ROLE_VALUES, null], default: null },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department", default: null },
  },
  pinned: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true, versionKey: false });

export default mongoose.models.Announcement || mongoose.model("Announcement", announcementSchema);
