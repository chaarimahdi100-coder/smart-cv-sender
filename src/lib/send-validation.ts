import { createHash } from "crypto";
import { computeDraftHash } from "./draft-integrity.js";
import { type ApprovedEmail } from "./email-provider.ts";
import { isPlaceholderOrUntrustedEmail } from "./draft-utils.ts";

export type ApplicationRecord = {
  id: string;
  user_id: string;
  resume_id: string | null;
  status: string;
  send_idempotency_key?: string | null;
};

export type EmailDraftRecord = {
  id: string;
  application_id: string;
  recipient_email: string;
  subject: string;
  body: string;
  approved_at: string | null;
  approved_hash: string | null;
  approved_attachment_hash?: string | null;
};

export type ResumeRecord = {
  id: string;
  user_id: string;
  storage_path: string;
};

export type ValidationSuccess = {
  valid: true;
  approvedEmail: ApprovedEmail;
};

export type ValidationFailure = {
  valid: false;
  reason: string;
};

export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Derives a stable, deterministic tracking/idempotency key from the application ID
 * and current approved draft hash.
 *
 * Guarantees:
 * - Stable across page reloads and retries for the same approved draft.
 * - Changing the draft body, subject, or CV attachment produces a completely new key.
 * - Eliminates non-deterministic keys generated via Date.now().
 */
export function computeSendTrackingKey(applicationId: string, approvedHash: string): string {
  if (!applicationId || !approvedHash) {
    throw new Error("Application ID and approved draft hash are required to compute send tracking key");
  }
  const digest = createHash("sha256")
    .update(`smartcv:send:${applicationId.trim()}:${approvedHash.trim()}`)
    .digest("hex");
  return `track_${applicationId.slice(0, 8)}_${digest.slice(0, 24)}`;
}

/**
 * Verifies whether a given tracking key accurately matches the current approved draft signature.
 */
export function validateSendTrackingKey(
  applicationId: string,
  approvedHash: string,
  keyToCheck: string
): boolean {
  if (!applicationId || !approvedHash || !keyToCheck) return false;
  try {
    const expected = computeSendTrackingKey(applicationId, approvedHash);
    return expected === keyToCheck;
  } catch {
    return false;
  }
}

/**
 * Validates approval integrity server-side immediately before any email send operation.
 * Guarantees that:
 * 1. The application belongs to the authenticated candidate.
 * 2. The selected resume belongs to the authenticated candidate.
 * 3. The application is in 'approved' status (or in-flight retry from failed/sending).
 * 4. The email draft has not been modified since approval (cryptographic snapshot hash matches).
 * 5. The attachment binding and storage path have not been altered.
 * 6. Idempotency key is present and send has not already occurred.
 */
export function validateApprovedEmailForSend(params: {
  candidateUserId: string;
  application: ApplicationRecord;
  draft: EmailDraftRecord;
  resume: ResumeRecord;
  idempotencyKey?: string;
  strictTrackingKey?: boolean;
}): ValidationResult {
  const { candidateUserId, application, draft, resume, idempotencyKey, strictTrackingKey } = params;

  // 1. Candidate ownership
  if (!candidateUserId || application.user_id !== candidateUserId) {
    return { valid: false, reason: "Unauthorized: candidate does not own this application" };
  }

  if (resume.user_id !== candidateUserId) {
    return { valid: false, reason: "Unauthorized: candidate does not own the attached resume" };
  }

  // 2. Draft-Application linkage
  if (draft.application_id !== application.id) {
    return { valid: false, reason: "Draft does not match the target application" };
  }

  // 3. Attachment linkage
  if (application.resume_id !== resume.id) {
    return { valid: false, reason: "Application resume reference does not match attached resume" };
  }

  // 4. Application status check using state machine rules
  if (
    application.status !== "approved" &&
    application.status !== "failed" &&
    application.status !== "sending"
  ) {
    return {
      valid: false,
      reason: `Application status is '${application.status}', must be 'approved' before sending`,
    };
  }

  // 5. Approval timestamp
  if (!draft.approved_at) {
    return { valid: false, reason: "Email draft has not been approved" };
  }

  // 6. Recipient email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!draft.recipient_email || !emailRegex.test(draft.recipient_email.trim())) {
    return { valid: false, reason: "Invalid recipient email address" };
  }

  // 7. Full approval hash verification (recipient, subject, body, resumeId, storagePath)
  const currentHash = computeDraftHash(
    draft.recipient_email,
    draft.subject,
    draft.body,
    resume.id,
    resume.storage_path
  );

  if (!draft.approved_hash || draft.approved_hash !== currentHash) {
    return {
      valid: false,
      reason: "Approval signature mismatch: draft content or attachment was altered after approval",
    };
  }

  // 8. Attachment hash verification
  const currentAttachmentHash = computeDraftHash("", "", "", resume.id, resume.storage_path);
  if (
    draft.approved_attachment_hash &&
    draft.approved_attachment_hash !== currentAttachmentHash
  ) {
    return {
      valid: false,
      reason: "Attachment integrity mismatch: resume file was altered after approval",
    };
  }

  // 9. Placeholder / untrusted recipient check
  if (isPlaceholderOrUntrustedEmail(draft.recipient_email)) {
    return { valid: false, reason: "Cannot dispatch email to placeholder or untrusted recipient address" };
  }

  // 10. Idempotency key check
  const effectiveKey = idempotencyKey || application.send_idempotency_key;
  if (!effectiveKey) {
    return { valid: false, reason: "Missing send idempotency key to prevent duplicate sends" };
  }

  if (
    application.status === "sending" &&
    application.send_idempotency_key &&
    idempotencyKey &&
    application.send_idempotency_key !== idempotencyKey
  ) {
    return { valid: false, reason: "Idempotency key conflict: in-flight sending key cannot be modified" };
  }

  // Strict tracking key check when requested
  if (strictTrackingKey && draft.approved_hash) {
    const expectedKey = computeSendTrackingKey(application.id, draft.approved_hash);
    if (effectiveKey !== expectedKey) {
      return {
        valid: false,
        reason: "Idempotency key mismatch: send key does not match current approved draft signature",
      };
    }
  }

  return {
    valid: true,
    approvedEmail: {
      to: draft.recipient_email.trim(),
      subject: draft.subject.trim(),
      body: draft.body,
      attachmentPath: resume.storage_path,
      idempotencyKey: effectiveKey,
    },
  };
}
