import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema({
  seq: { type: Number, required: true, unique: true },
  at: { type: Date, required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  actorRole: { type: String, default: null },
  action: { type: String, required: true, index: true },
  entity: { type: String, required: true, index: true },
  entityId: { type: String, default: null },
  meta: { type: mongoose.Schema.Types.Mixed, default: null },
  ip: { type: String, default: "" },
  prevHash: { type: String, required: true },
  hash: { type: String, required: true },
}, { versionKey: false });

auditLogSchema.index({ seq: 1 });

export default mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);
