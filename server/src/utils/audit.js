import crypto from "node:crypto";
import AuditLog from "../models/AuditLog.js";
import { metaForAudit } from "./sanitize.js";

export const ZERO_HASH = "0".repeat(64);

export function canonicalAuditEntry(entry) {
  return JSON.stringify({
    seq: entry.seq,
    at: entry.at,
    actorId: entry.actorId,
    actorRole: entry.actorRole,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    meta: entry.meta,
    ip: entry.ip,
    prevHash: entry.prevHash,
  });
}

export function computeAuditHash(prevHash, entry) {
  return crypto
    .createHash("sha256")
    .update(canonicalAuditEntry({ ...entry, prevHash }))
    .digest("hex");
}

let queue = Promise.resolve();

export function audit(actor, action, entity, entityId, meta, req) {
  const base = {
    actorId: actor?.id ?? null,
    actorRole: actor?.role ?? null,
    action,
    entity,
    entityId: entityId == null ? null : String(entityId),
    meta: metaForAudit(meta),
    ip: req?.ip ?? "",
  };

  queue = queue.then(async () => {
    try {
      const last = await AuditLog.findOne().sort({ seq: -1 }).select("seq hash").lean();
      const seq = (last?.seq ?? 0) + 1;
      const prevHash = last?.hash ?? ZERO_HASH;
      const at = new Date();
      const hash = computeAuditHash(prevHash, { ...base, seq, at });

      await AuditLog.create({ seq, at, ...base, prevHash, hash });
    } catch (error) {
      console.error("audit write failed:", error.message);
    }
  });

  return queue;
}

export async function verifyAuditChain() {
  const entries = await AuditLog.find().sort({ seq: 1 }).lean();
  let prevHash = ZERO_HASH;

  for (const entry of entries) {
    if (entry.prevHash !== prevHash) {
      return { valid: false, brokenAt: entry.seq, checked: entries.length, reason: "previous hash mismatch" };
    }

    if (entry.hash !== computeAuditHash(prevHash, entry)) {
      return { valid: false, brokenAt: entry.seq, checked: entries.length, reason: "hash mismatch" };
    }

    prevHash = entry.hash;
  }

  return { valid: true, checked: entries.length };
}
