import mongoose from "mongoose";
import { PAYROLL_STATUS_VALUES } from "../constants/statuses.js";

const payrollLineSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department", default: null },
  presentDays: { type: Number, default: 0 },
  lateDays: { type: Number, default: 0 },
  halfDays: { type: Number, default: 0 },
  absentDays: { type: Number, default: 0 },
  paidLeaveDays: { type: Number, default: 0 },
  unpaidLeaveDays: { type: Number, default: 0 },
  basic: { type: Number, default: 0 },
  allowance: { type: Number, default: 0 },
  hra: { type: Number, default: 0 },
  medical: { type: Number, default: 0 },
  gross: { type: Number, default: 0 },
  perDay: { type: Number, default: 0 },
  absentDeduction: { type: Number, default: 0 },
  halfDayDeduction: { type: Number, default: 0 },
  unpaidLeaveDeduction: { type: Number, default: 0 },
  lateDeduction: { type: Number, default: 0 },
  extraUnpaidDeduction: { type: Number, default: 0 },
  totalDeductions: { type: Number, default: 0 },
  taxable: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  net: { type: Number, default: 0 },
  currency: { type: String, default: "PKR" },
}, { _id: false });

const payrollRunSchema = new mongoose.Schema({
  month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
  status: { type: String, enum: PAYROLL_STATUS_VALUES, default: "draft", index: true },
  workingDays: { type: Number, required: true, min: 0 },
  lines: { type: [payrollLineSchema], default: [] },
  summary: {
    employeeCount: { type: Number, default: 0 },
    workingDays: { type: Number, default: 0 },
    totalGross: { type: Number, default: 0 },
    totalDeductions: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    totalNet: { type: Number, default: 0 },
  },
  preparedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true, versionKey: false });

payrollRunSchema.index({ month: 1 }, { unique: true });

export default mongoose.models.PayrollRun || mongoose.model("PayrollRun", payrollRunSchema);
