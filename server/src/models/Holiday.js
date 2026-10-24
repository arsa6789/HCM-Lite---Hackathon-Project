import mongoose from "mongoose";

const holidaySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  recurring: { type: Boolean, default: false },
}, { timestamps: true, versionKey: false });

holidaySchema.index({ date: 1 });

export default mongoose.models.Holiday || mongoose.model("Holiday", holidaySchema);
