import mongoose from "mongoose";

const departmentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100, unique: true },
  description: { type: String, trim: true, maxlength: 250, default: "" },
}, { timestamps: true, versionKey: false });

export default mongoose.models.Department || mongoose.model("Department", departmentSchema);
