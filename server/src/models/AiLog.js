import mongoose from "mongoose";

const aiLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  role: { type: String, default: null },
  tools: { type: [String], default: [] },
  ok: { type: Boolean, default: true },
}, { timestamps: true, versionKey: false });

export default mongoose.models.AiLog || mongoose.model("AiLog", aiLogSchema);
