import { defineModel } from "./firestoreModel.js";

const AuditLog = defineModel("auditLogs", { defaults: { actorId: null, actorRole: null, entityId: null, meta: null, ip: "", prevHash: "", hash: "" }, unique: ["seq"], timestamps: false });
export default AuditLog;
