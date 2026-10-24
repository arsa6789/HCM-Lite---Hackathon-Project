import mongoose from "mongoose";
import { ROLE_VALUES, ROLES } from "../constants/roles.js";
import { EMPLOYMENT_STATUS_VALUES } from "../constants/statuses.js";

const salarySchema = new mongoose.Schema({
  basic: { type: Number, default: 0, min: 0 },
  allowance: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: "PKR", maxlength: 8 },
}, { _id: false });

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, "Email is required."],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address."],
  },
  password: {
    type: String,
    required: [true, "Password is required."],
    minlength: [8, "Password must be at least 8 characters long."],
    select: false,
  },
  role: {
    type: String,
    enum: ROLE_VALUES,
    default: ROLES.EMPLOYEE,
    index: true,
  },
  fullName: { type: String, trim: true, maxlength: 120, default: "" },
  phone: { type: String, trim: true, maxlength: 40, default: "" },
  address: { type: String, trim: true, maxlength: 250, default: "" },
  employeeCode: { type: String, trim: true, maxlength: 40, unique: true, sparse: true },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department", default: null },
  designationId: { type: mongoose.Schema.Types.ObjectId, ref: "Designation", default: null },
  joinDate: { type: Date, default: null },
  employmentStatus: { type: String, enum: EMPLOYMENT_STATUS_VALUES, default: "active", index: true },
  salary: { type: salarySchema, default: () => ({}) },
}, { versionKey: false });

export default mongoose.models.User || mongoose.model("User", userSchema);
