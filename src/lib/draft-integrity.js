import { createHash } from "node:crypto";

export function canonicalizeDraft(recipient, subject, body, resumeId, storagePath) {
  return JSON.stringify({ recipient: recipient.trim(), subject: subject.trim(), body, resumeId, storagePath });
}

export function computeDraftHash(recipient, subject, body, resumeId, storagePath = "") {
  return createHash("sha256").update(canonicalizeDraft(recipient, subject, body, resumeId, storagePath)).digest("hex");
}
