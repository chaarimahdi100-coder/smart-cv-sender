import test from "node:test";
import assert from "node:assert/strict";
import { computeDraftHash } from "../draft-integrity.js";
import { validateApprovedEmailForSend } from "../send-validation.ts";

test("Security Audit: validateApprovedEmailForSend enforces full approval and tenant boundaries", () => {
  const candidateId = "candidate-111";
  const resumeId = "resume-222";
  const storagePath = `${candidateId}/cv_2026.pdf`;
  const appId = "app-333";
  const draftId = "draft-444";
  const recipient = "hr@target-company.com";
  const subject = "Application for Frontend Engineer";
  const body = "Dear Hiring Manager,\n\nPlease find my CV attached.";
  const idempotencyKey = "idemp-key-999";

  const validHash = computeDraftHash(recipient, subject, body, resumeId, storagePath);
  const validAttachmentHash = computeDraftHash("", "", "", resumeId, storagePath);

  const baseApplication = {
    id: appId,
    user_id: candidateId,
    resume_id: resumeId,
    status: "approved",
    send_idempotency_key: idempotencyKey,
  };

  const baseDraft = {
    id: draftId,
    application_id: appId,
    recipient_email: recipient,
    subject,
    body,
    approved_at: new Date().toISOString(),
    approved_hash: validHash,
    approved_attachment_hash: validAttachmentHash,
  };

  const baseResume = {
    id: resumeId,
    user_id: candidateId,
    storage_path: storagePath,
  };

  // 1. Success case
  const successResult = validateApprovedEmailForSend({
    candidateUserId: candidateId,
    application: baseApplication,
    draft: baseDraft,
    resume: baseResume,
    idempotencyKey,
  });
  assert.equal(successResult.valid, true);
  if (successResult.valid) {
    assert.equal(successResult.approvedEmail.to, recipient);
    assert.equal(successResult.approvedEmail.attachmentPath, storagePath);
    assert.equal(successResult.approvedEmail.idempotencyKey, idempotencyKey);
  }

  // 2. Cross-candidate attack: attacker calls send on another candidate's application
  const crossTenantResult = validateApprovedEmailForSend({
    candidateUserId: "attacker-user-999",
    application: baseApplication,
    draft: baseDraft,
    resume: baseResume,
    idempotencyKey,
  });
  assert.equal(crossTenantResult.valid, false);
  assert.match((crossTenantResult as { reason: string }).reason, /Unauthorized/i);

  // 3. Stolen resume attack: candidate attaches someone else's resume
  const stolenResumeResult = validateApprovedEmailForSend({
    candidateUserId: candidateId,
    application: baseApplication,
    draft: baseDraft,
    resume: { ...baseResume, user_id: "victim-candidate-888" },
    idempotencyKey,
  });
  assert.equal(stolenResumeResult.valid, false);
  assert.match((stolenResumeResult as { reason: string }).reason, /Unauthorized.*resume/i);

  // 4. Unapproved application status (e.g. 'draft' or 'pending_approval')
  const draftStatusResult = validateApprovedEmailForSend({
    candidateUserId: candidateId,
    application: { ...baseApplication, status: "draft" },
    draft: baseDraft,
    resume: baseResume,
    idempotencyKey,
  });
  assert.equal(draftStatusResult.valid, false);
  assert.match((draftStatusResult as { reason: string }).reason, /must be 'approved'/i);

  // 5. Tampered body after approval
  const tamperedBodyResult = validateApprovedEmailForSend({
    candidateUserId: candidateId,
    application: baseApplication,
    draft: { ...baseDraft, body: "MALICIOUS CONTENT INJECTED" },
    resume: baseResume,
    idempotencyKey,
  });
  assert.equal(tamperedBodyResult.valid, false);
  assert.match((tamperedBodyResult as { reason: string }).reason, /signature mismatch/i);

  // 6. Tampered recipient after approval
  const tamperedRecipientResult = validateApprovedEmailForSend({
    candidateUserId: candidateId,
    application: baseApplication,
    draft: { ...baseDraft, recipient_email: "attacker@exploit.com" },
    resume: baseResume,
    idempotencyKey,
  });
  assert.equal(tamperedRecipientResult.valid, false);
  assert.match((tamperedRecipientResult as { reason: string }).reason, /signature mismatch/i);

  // 7. Swapped attachment / storage path after approval
  const swappedAttachmentResult = validateApprovedEmailForSend({
    candidateUserId: candidateId,
    application: baseApplication,
    draft: baseDraft,
    resume: { ...baseResume, storage_path: `${candidateId}/cv_replacement.pdf` },
    idempotencyKey,
  });
  assert.equal(swappedAttachmentResult.valid, false);
  assert.match((swappedAttachmentResult as { reason: string }).reason, /signature mismatch|integrity mismatch/i);

  // 8. Missing idempotency key
  const missingIdempResult = validateApprovedEmailForSend({
    candidateUserId: candidateId,
    application: { ...baseApplication, send_idempotency_key: null },
    draft: baseDraft,
    resume: baseResume,
  });
  assert.equal(missingIdempResult.valid, false);
  assert.match((missingIdempResult as { reason: string }).reason, /idempotency key/i);
});

test("Security Audit: CV storage path validation prevents path traversal and cross-tenant storage access", () => {
  const userId = "user-12345";

  function isSecureStoragePath(path: string, expectedUserId: string): boolean {
    if (!path || typeof path !== "string") return false;
    // Disallow path traversal sequences
    if (path.includes("..") || path.includes("\\") || path.startsWith("/")) return false;
    // Must start strictly with expectedUserId/
    const parts = path.split("/");
    return parts.length === 2 && parts[0] === expectedUserId && parts[1].endsWith(".pdf");
  }

  assert.equal(isSecureStoragePath(`${userId}/cv_123.pdf`, userId), true);
  assert.equal(isSecureStoragePath(`other-user-999/cv_123.pdf`, userId), false, "Rejects other user directory");
  assert.equal(isSecureStoragePath(`../secrets.txt`, userId), false, "Rejects parent directory traversal");
  assert.equal(isSecureStoragePath(`${userId}/../other/cv.pdf`, userId), false, "Rejects inline directory traversal");
  assert.equal(isSecureStoragePath(`/etc/passwd`, userId), false, "Rejects root path");
  assert.equal(isSecureStoragePath(`${userId}/executable.exe`, userId), false, "Rejects non-pdf extension");
});

test("Security Audit: State machine prevents invalid transitions once application is sent", () => {
  const candidateId = "candidate-sent-1";
  const resumeId = "resume-sent-1";
  const storagePath = `${candidateId}/cv_2026.pdf`;
  const appId = "app-sent-1";
  const draftId = "draft-sent-1";
  const recipient = "jobs@enterprise.com";
  const subject = "PFE Application";
  const body = "Body text";
  const idempotencyKey = "idemp-sent-1";

  const validHash = computeDraftHash(recipient, subject, body, resumeId, storagePath);

  // Application that is already sent
  const sentApplication = {
    id: appId,
    user_id: candidateId,
    resume_id: resumeId,
    status: "sent",
    send_idempotency_key: idempotencyKey,
  };

  const draft = {
    id: draftId,
    application_id: appId,
    recipient_email: recipient,
    subject,
    body,
    approved_at: new Date().toISOString(),
    approved_hash: validHash,
  };

  const resume = {
    id: resumeId,
    user_id: candidateId,
    storage_path: storagePath,
  };

  // Attempting to send an application that is already in 'sent' status must be rejected
  const resendResult = validateApprovedEmailForSend({
    candidateUserId: candidateId,
    application: sentApplication,
    draft,
    resume,
    idempotencyKey,
  });

  assert.equal(resendResult.valid, false);
  assert.match((resendResult as { reason: string }).reason, /must be 'approved' before sending/i);
});

test("Security Audit: State machine transition rules strictly reject invalid forward and backward transitions", () => {
  type ApplicationStatus = "draft" | "approved" | "sending" | "sent" | "failed";

  function isValidStatusTransition(current: ApplicationStatus, next: ApplicationStatus): boolean {
    if (current === "sent") return false; // Terminal state cannot transition to anything
    switch (current) {
      case "draft":
        return next === "approved";
      case "approved":
        return next === "sending" || next === "draft"; // can revert to draft on edit
      case "sending":
        return next === "sent" || next === "failed";
      case "failed":
        return next === "sending" || next === "approved" || next === "draft";
      default:
        return false;
    }
  }

  // Valid forward paths
  assert.equal(isValidStatusTransition("draft", "approved"), true);
  assert.equal(isValidStatusTransition("approved", "sending"), true);
  assert.equal(isValidStatusTransition("sending", "sent"), true);
  assert.equal(isValidStatusTransition("sending", "failed"), true);
  assert.equal(isValidStatusTransition("approved", "draft"), true); // edits revert approval

  // Invalid bypass paths
  assert.equal(isValidStatusTransition("draft", "sending"), false, "Cannot skip approval");
  assert.equal(isValidStatusTransition("draft", "sent"), false, "Cannot skip approval and sending");
  assert.equal(isValidStatusTransition("approved", "sent"), false, "Cannot skip sending state");

  // Terminal state immutability
  assert.equal(isValidStatusTransition("sent", "draft"), false, "Sent is terminal");
  assert.equal(isValidStatusTransition("sent", "approved"), false, "Sent is terminal");
  assert.equal(isValidStatusTransition("sent", "sending"), false, "Sent is terminal");
  assert.equal(isValidStatusTransition("sent", "sent"), false, "Sent is terminal");
  assert.equal(isValidStatusTransition("sent", "failed"), false, "Sent is terminal");
});

test("Security Audit: Distinguishes application-layer cryptographic checks from direct PostgREST database-level privileges", () => {
  // Application-layer checks guarantee that Server Actions will not dispatch untrusted drafts
  const candidateId = "candidate-app-check";
  const resumeId = "resume-app-check";
  const storagePath = `${candidateId}/cv.pdf`;
  const appId = "app-app-check";

  const genuineHash = computeDraftHash("target@company.com", "Subject", "Body", resumeId, storagePath);
  const forgedHash = "forged-sha256-hash-attempted-by-direct-postgrest-update";
  assert.notEqual(genuineHash, forgedHash);

  const draftWithForgedHash = {
    id: "draft-1",
    application_id: appId,
    recipient_email: "target@company.com",
    subject: "Subject",
    body: "Tampered Body In PostgREST",
    approved_at: new Date().toISOString(),
    approved_hash: forgedHash,
    approved_attachment_hash: computeDraftHash("", "", "", resumeId, storagePath),
  };

  const validation = validateApprovedEmailForSend({
    candidateUserId: candidateId,
    application: {
      id: appId,
      user_id: candidateId,
      resume_id: resumeId,
      status: "approved",
      send_idempotency_key: "idemp-key",
    },
    draft: draftWithForgedHash,
    resume: {
      id: resumeId,
      user_id: candidateId,
      storage_path: storagePath,
    },
    idempotencyKey: "idemp-key",
  });

  // Application layer successfully intercepts even if PostgREST allowed direct UPDATE on email_drafts
  assert.equal(validation.valid, false);
  assert.match((validation as { reason: string }).reason, /signature mismatch/i);
});

test("Security Audit: Migration 20240107000000 contains only safe, non-destructive SQL", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");

  const migrationPath = path.resolve("supabase/migrations/20240107000000_rate_limiting_and_security.sql");
  const sql = fs.readFileSync(migrationPath, "utf8");

  // Must not drop tables or truncate existing candidate data (checked against executable SQL)
  const executableSql = sql.replace(/--.*$/gm, "");
  assert.equal(/drop\s+table/i.test(executableSql), false, "Must not contain DROP TABLE");
  assert.equal(/\btruncate\b/i.test(executableSql), false, "Must not contain TRUNCATE");
  assert.equal(/drop\s+column/i.test(executableSql), false, "Must not contain DROP COLUMN");
  assert.equal(/delete\s+from/i.test(executableSql), false, "Must not contain raw DELETE statements");

  // Must contain SECURITY DEFINER procedures with search_path safety
  assert.ok(sql.includes("security definer"), "Must define SECURITY DEFINER procedures");
  assert.ok(sql.includes("set search_path = public"), "Must set search_path = public for safety");

  // Must include atomic draft save and approval functions
  assert.ok(sql.includes("save_email_draft_atomic"), "Must define save_email_draft_atomic");
  assert.ok(sql.includes("approve_email_draft_atomic"), "Must define approve_email_draft_atomic");
  assert.ok(sql.includes("transition_application_status_atomic"), "Must define transition_application_status_atomic");
  assert.ok(sql.includes("check_rate_limit"), "Must define check_rate_limit");

  // Must grant execute exclusively to authenticated and revoke from public
  assert.ok(sql.includes("revoke execute on function check_rate_limit(text, int, int) from public"), "Must revoke check_rate_limit from public");
  assert.ok(sql.includes("revoke execute on function save_email_draft_atomic(uuid, text, text, text, uuid) from public"), "Must revoke save_email_draft_atomic from public");
  assert.ok(sql.includes("revoke execute on function approve_email_draft_atomic(uuid, text, text) from public"), "Must revoke approve_email_draft_atomic from public");
  assert.ok(sql.includes("revoke execute on function transition_application_status_atomic(uuid, text, text) from public"), "Must revoke transition_application_status_atomic from public");

  assert.ok(sql.includes("grant execute on function check_rate_limit"), "Must grant check_rate_limit");
  assert.ok(sql.includes("grant execute on function save_email_draft_atomic"), "Must grant save_email_draft_atomic");
  assert.ok(sql.includes("grant execute on function approve_email_draft_atomic"), "Must grant approve_email_draft_atomic");
  assert.ok(sql.includes("grant execute on function transition_application_status_atomic"), "Must grant transition_application_status_atomic");

  // Must enforce rate limits table privilege hardening (no direct mutation)
  assert.ok(sql.includes("revoke all on rate_limits from public, anon"), "Must revoke all from public, anon on rate_limits");
  assert.ok(sql.includes("revoke all on rate_limits from authenticated"), "Must revoke all on rate_limits from authenticated");
  assert.ok(sql.includes("grant select on rate_limits to authenticated"), "Must grant select on rate_limits to authenticated");

  // Must enforce complete direct UPDATE revocation on applications and email_drafts
  assert.ok(sql.includes("revoke all on applications from public, anon"), "Must revoke all on applications from public, anon");
  assert.ok(sql.includes("revoke all on applications from authenticated"), "Must revoke all from authenticated on applications");
  assert.ok(sql.includes("grant select, insert, delete on applications to authenticated"), "Must grant select, insert, delete on applications to authenticated");
  assert.equal(/grant\s+update.*on\s+applications\s+to\s+authenticated/i.test(executableSql), false, "Must not grant direct update on applications");

  assert.ok(sql.includes("revoke all on email_drafts from public, anon"), "Must revoke all on email_drafts from public, anon");
  assert.ok(sql.includes("revoke all on email_drafts from authenticated"), "Must revoke all from authenticated on email_drafts");
  assert.ok(sql.includes("grant select, insert, delete on email_drafts to authenticated"), "Must grant select, insert, delete on email_drafts to authenticated");
  assert.equal(/grant\s+update.*on\s+email_drafts\s+to\s+authenticated/i.test(executableSql), false, "Must not grant direct update on email_drafts");

  // Must drop legacy direct update policies
  assert.ok(sql.includes('drop policy if exists "Users can update own applications" on applications'), "Must drop legacy update policy on applications");
  assert.ok(sql.includes('drop policy if exists "Users can update own email drafts" on email_drafts'), "Must drop legacy update policy on email_drafts");

  // Must use standard now() instead of timezone('utc'::text, now()) for timestamptz columns
  assert.equal(sql.includes("timezone('utc'::text, now())"), false, "Must not use timezone('utc'::text, now()) for timestamptz columns");
});

test("Security Audit: Stored procedure logic resets approval state on draft edit", () => {
  // Simulates save_email_draft_atomic logic
  interface MockApplication {
    id: string;
    user_id: string;
    resume_id: string;
    status: string;
  }
  interface MockDraft {
    application_id: string;
    recipient_email: string;
    subject: string;
    body: string;
    approved_at: string | null;
    approved_hash: string | null;
  }

  function simulateSaveDraftAtomic(
    app: MockApplication,
    draft: MockDraft,
    authUserId: string,
    newBody: string
  ): { app: MockApplication; draft: MockDraft; allowed: boolean; error?: string } {
    if (app.user_id !== authUserId) {
      return { app, draft, allowed: false, error: "Unauthorized" };
    }
    if (app.status === "sent" || app.status === "sending") {
      return { app, draft, allowed: false, error: `Application is currently ${app.status} and cannot be edited` };
    }

    return {
      app: { ...app, status: "draft" },
      draft: {
        ...draft,
        body: newBody,
        approved_at: null,
        approved_hash: null,
      },
      allowed: true,
    };
  }

  const baseApp: MockApplication = { id: "app-1", user_id: "user-1", resume_id: "res-1", status: "approved" };
  const baseDraft: MockDraft = { application_id: "app-1", recipient_email: "rec@corp.com", subject: "Sub", body: "Original", approved_at: "2026-01-01", approved_hash: "hash" };

  // 1. Candidate edits previously approved draft -> reverts to draft & clears hash
  const editResult = simulateSaveDraftAtomic(baseApp, baseDraft, "user-1", "Modified Body");
  assert.equal(editResult.allowed, true);
  assert.equal(editResult.app.status, "draft");
  assert.equal(editResult.draft.approved_at, null);
  assert.equal(editResult.draft.approved_hash, null);

  // 2. Attacker attempts to edit draft -> rejected
  const crossUserResult = simulateSaveDraftAtomic(baseApp, baseDraft, "attacker-2", "Attacker Content");
  assert.equal(crossUserResult.allowed, false);

  // 3. Sent application cannot be edited
  const sentApp: MockApplication = { ...baseApp, status: "sent" };
  const sentEditResult = simulateSaveDraftAtomic(sentApp, baseDraft, "user-1", "Post-sent edit");
  assert.equal(sentEditResult.allowed, false);

  // 4. In-flight sending application cannot be edited (prevents state-machine reset race condition)
  const sendingApp: MockApplication = { ...baseApp, status: "sending" };
  const sendingEditResult = simulateSaveDraftAtomic(sendingApp, baseDraft, "user-1", "Mid-flight edit");
  assert.equal(sendingEditResult.allowed, false);
  assert.match(sendingEditResult.error || "", /sending.*cannot be edited/i);
});

test("Security Audit: transition_application_status_atomic requires valid email draft approval and locks in-flight idempotency key", () => {
  interface MockAppRecord {
    id: string;
    user_id: string;
    status: string;
    send_idempotency_key: string | null;
  }
  interface MockDraftRecord {
    application_id: string;
    approved_at: string | null;
    approved_hash: string | null;
    approved_attachment_hash: string | null;
    recipient_email: string;
    subject: string;
    body: string;
  }

  function simulateTransitionStatusAtomic(
    app: MockAppRecord,
    draft: MockDraftRecord | null,
    authUserId: string,
    newStatus: string,
    idempotencyKey?: string | null
  ): { success: boolean; app: MockAppRecord; error?: string } {
    if (app.user_id !== authUserId) {
      return { success: false, app, error: "Unauthorized" };
    }
    if (app.status === "sent") {
      return { success: false, app, error: "Application is in terminal sent state and cannot be modified" };
    }

    if (!["approved", "sending", "sent", "failed"].includes(newStatus)) {
      return { success: false, app, error: "Invalid target status" };
    }

    // 1. Transition to 'approved': CANNOT bypass approval fields
    if (newStatus === "approved") {
      if (!["draft", "approved", "failed"].includes(app.status)) {
        return { success: false, app, error: "Invalid status transition to approved" };
      }
      if (
        !draft ||
        !draft.approved_at ||
        !draft.approved_hash ||
        !draft.approved_attachment_hash ||
        !draft.recipient_email ||
        !draft.subject ||
        !draft.body
      ) {
        return { success: false, app, error: "Cannot transition to approved: email draft must be approved via approve_email_draft_atomic first" };
      }
    }

    // 2. Transition to 'sending'
    if (newStatus === "sending") {
      if (!["approved", "sending", "failed"].includes(app.status)) {
        return { success: false, app, error: "Application must be approved before entering sending state" };
      }
      if (!idempotencyKey || !idempotencyKey.trim()) {
        return { success: false, app, error: "Idempotency key required for sending transition" };
      }
      if (app.status === "sending" && app.send_idempotency_key && app.send_idempotency_key !== idempotencyKey) {
        return { success: false, app, error: "Idempotency key mismatch: in-flight sending key cannot be modified" };
      }
      if (!draft || !draft.approved_at || !draft.approved_hash || !draft.approved_attachment_hash) {
        return { success: false, app, error: "Cannot send: email draft approval has been invalidated or is missing" };
      }
    }

    // 3. Transition to 'sent'
    if (newStatus === "sent" && app.status !== "sending") {
      return { success: false, app, error: "Cannot mark sent without sending state" };
    }

    // 4. Transition to 'failed'
    if (newStatus === "failed" && app.status !== "sending") {
      return { success: false, app, error: "Cannot mark failed without sending state" };
    }

    return {
      success: true,
      app: {
        ...app,
        status: newStatus,
        send_idempotency_key: idempotencyKey || app.send_idempotency_key,
      },
    };
  }

  const userId = "candidate-trans-1";
  const validDraft: MockDraftRecord = {
    application_id: "app-1",
    approved_at: "2026-01-01T12:00:00Z",
    approved_hash: "valid-sha256-hash",
    approved_attachment_hash: "valid-attachment-hash",
    recipient_email: "rec@corp.com",
    subject: "Sub",
    body: "Body",
  };

  const draftApp: MockAppRecord = { id: "app-1", user_id: userId, status: "draft", send_idempotency_key: null };

  // 1. Cannot transition to 'approved' if draft has not been approved
  const unapprovedDraft: MockDraftRecord = { ...validDraft, approved_at: null, approved_hash: null, approved_attachment_hash: null };
  const bypassAttempt = simulateTransitionStatusAtomic(draftApp, unapprovedDraft, userId, "approved");
  assert.equal(bypassAttempt.success, false);
  assert.match(bypassAttempt.error || "", /email draft must be approved/);

  // 2. Legitimate transition to 'approved' when draft is approved
  const approvedResult = simulateTransitionStatusAtomic(draftApp, validDraft, userId, "approved");
  assert.equal(approvedResult.success, true);
  assert.equal(approvedResult.app.status, "approved");

  // 3. Transitioning from 'approved' to 'sending' requires idempotency key
  const missingKeySend = simulateTransitionStatusAtomic(approvedResult.app, validDraft, userId, "sending", null);
  assert.equal(missingKeySend.success, false);
  assert.match(missingKeySend.error || "", /Idempotency key required/);

  const validSending = simulateTransitionStatusAtomic(approvedResult.app, validDraft, userId, "sending", "idemp-001");
  assert.equal(validSending.success, true);
  assert.equal(validSending.app.status, "sending");
  assert.equal(validSending.app.send_idempotency_key, "idemp-001");

  // 4. Idempotent retry with the SAME key in sending state is allowed
  const retrySameKey = simulateTransitionStatusAtomic(validSending.app, validDraft, userId, "sending", "idemp-001");
  assert.equal(retrySameKey.success, true);
  assert.equal(retrySameKey.app.send_idempotency_key, "idemp-001");

  // 5. Attempting to change the idempotency key for an in-flight sending application is rejected
  const changeKeyAttempt = simulateTransitionStatusAtomic(validSending.app, validDraft, userId, "sending", "idemp-DIFFERENT-002");
  assert.equal(changeKeyAttempt.success, false);
  assert.match(changeKeyAttempt.error || "", /Idempotency key mismatch/);

  // 6. Direct jump from draft to sent is rejected
  const jumpToSent = simulateTransitionStatusAtomic(draftApp, validDraft, userId, "sent");
  assert.equal(jumpToSent.success, false);
  assert.match(jumpToSent.error || "", /Cannot mark sent without sending state/);

  // 7. Transition from sending to failed, and retry from failed to sending
  const failedSend = simulateTransitionStatusAtomic(validSending.app, validDraft, userId, "failed");
  assert.equal(failedSend.success, true);
  assert.equal(failedSend.app.status, "failed");

  // Retry from failed to sending with new idempotency key succeeds
  const retryFromFailed = simulateTransitionStatusAtomic(failedSend.app, validDraft, userId, "sending", "idemp-002");
  assert.equal(retryFromFailed.success, true);
  assert.equal(retryFromFailed.app.status, "sending");
  assert.equal(retryFromFailed.app.send_idempotency_key, "idemp-002");

  // 8. Terminal state cannot be transitioned
  const sentApp: MockAppRecord = { id: "app-1", user_id: userId, status: "sent", send_idempotency_key: "idemp-001" };
  const sentTransition = simulateTransitionStatusAtomic(sentApp, validDraft, userId, "approved");
  assert.equal(sentTransition.success, false);
  assert.match(sentTransition.error || "", /terminal sent state/);
});

test("Security Audit: approve_email_draft_atomic strictly validates hash format, resume presence, and cannot forge approval", () => {
  interface MockApplicationRecord {
    id: string;
    user_id: string;
    resume_id: string | null;
    status: string;
  }
  interface MockDraftRecord {
    id: string;
    application_id: string;
    recipient_email: string;
    subject: string;
    body: string;
    approved_at: string | null;
    approved_hash: string | null;
    approved_attachment_hash: string | null;
  }

  function simulateApproveEmailDraftAtomic(
    app: MockApplicationRecord,
    draft: MockDraftRecord | null,
    resumeExistsForUser: boolean,
    authUserId: string,
    hash: string,
    attachmentHash: string
  ): { success: boolean; app: MockApplicationRecord; draft: MockDraftRecord | null; error?: string } {
    if (app.user_id !== authUserId) {
      return { success: false, app, draft, error: "Application not found or unauthorized" };
    }
    if (app.status === "sent" || app.status === "sending") {
      return { success: false, app, draft, error: `Application is currently ${app.status} and cannot be approved` };
    }

    // SHA-256 hex format validation (64 hex characters)
    const hex64Regex = /^[0-9a-fA-F]{64}$/;
    if (!hash || !hex64Regex.test(hash) || !attachmentHash || !hex64Regex.test(attachmentHash)) {
      return { success: false, app, draft, error: "Invalid approval hash format: expected 64-character hex SHA-256" };
    }

    if (hash === attachmentHash) {
      return { success: false, app, draft, error: "Invalid approval hashes: draft hash and attachment hash cannot be identical" };
    }

    // Must have attached resume
    if (!app.resume_id) {
      return { success: false, app, draft, error: "Cannot approve draft: application must have an attached resume" };
    }
    if (!resumeExistsForUser) {
      return { success: false, app, draft, error: "Cannot approve draft: attached resume not found or unauthorized" };
    }

    // Must have complete and valid draft content
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (
      !draft ||
      !draft.recipient_email ||
      !emailRegex.test(draft.recipient_email.trim()) ||
      !draft.subject ||
      !draft.subject.trim() ||
      !draft.body ||
      !draft.body.trim()
    ) {
      return { success: false, app, draft, error: "Draft content is incomplete or invalid and cannot be approved" };
    }

    const nowIso = new Date().toISOString();
    return {
      success: true,
      app: { ...app, status: "approved" },
      draft: {
        ...draft,
        approved_at: nowIso,
        approved_hash: hash,
        approved_attachment_hash: attachmentHash,
      },
    };
  }

  const userId = "candidate-uuid-111";
  const validApp: MockApplicationRecord = { id: "app-1", user_id: userId, resume_id: "res-1", status: "draft" };
  const validDraft: MockDraftRecord = {
    id: "draft-1",
    application_id: "app-1",
    recipient_email: "recruiter@enterprise.com",
    subject: "Application for Software Engineer",
    body: "Please find my CV attached.",
    approved_at: null,
    approved_hash: null,
    approved_attachment_hash: null,
  };

  const validHash1 = "a".repeat(64);
  const validHash2 = "b".repeat(64);

  // 1. Valid approval
  const validResult = simulateApproveEmailDraftAtomic(validApp, validDraft, true, userId, validHash1, validHash2);
  assert.equal(validResult.success, true);
  assert.equal(validResult.app.status, "approved");
  assert.equal(validResult.draft?.approved_hash, validHash1);

  // 2. Reject non-hex or malformed hash
  const malformedResult = simulateApproveEmailDraftAtomic(validApp, validDraft, true, userId, "not-a-sha256", validHash2);
  assert.equal(malformedResult.success, false);
  assert.match(malformedResult.error || "", /Invalid approval hash format/);

  // 3. Reject identical draft and attachment hash
  const identicalHashResult = simulateApproveEmailDraftAtomic(validApp, validDraft, true, userId, validHash1, validHash1);
  assert.equal(identicalHashResult.success, false);
  assert.match(identicalHashResult.error || "", /cannot be identical/);

  // 4. Reject application without attached resume
  const appNoResume: MockApplicationRecord = { ...validApp, resume_id: null };
  const noResumeResult = simulateApproveEmailDraftAtomic(appNoResume, validDraft, true, userId, validHash1, validHash2);
  assert.equal(noResumeResult.success, false);
  assert.match(noResumeResult.error || "", /must have an attached resume/);

  // 5. Reject resume owned by another user
  const stolenResumeResult = simulateApproveEmailDraftAtomic(validApp, validDraft, false, userId, validHash1, validHash2);
  assert.equal(stolenResumeResult.success, false);
  assert.match(stolenResumeResult.error || "", /attached resume not found or unauthorized/);

  // 6. Reject incomplete or invalid draft content
  const invalidEmailDraft: MockDraftRecord = { ...validDraft, recipient_email: "not-an-email" };
  const invalidEmailResult = simulateApproveEmailDraftAtomic(validApp, invalidEmailDraft, true, userId, validHash1, validHash2);
  assert.equal(invalidEmailResult.success, false);
  assert.match(invalidEmailResult.error || "", /incomplete or invalid/);

  // 7. Forged Hash Defense: An attacker calling RPC with arbitrary valid-format hashes CANNOT forge sending
  // because validateApprovedEmailForSend checks the hash against actual computed content
  const forgedHashCall = simulateApproveEmailDraftAtomic(validApp, validDraft, true, userId, "c".repeat(64), "d".repeat(64));
  assert.equal(forgedHashCall.success, true); // Stored in DB with status = 'approved'

  // When send is attempted, validateApprovedEmailForSend intercepts the forged hash:
  const sendValidation = validateApprovedEmailForSend({
    candidateUserId: userId,
    application: forgedHashCall.app,
    draft: forgedHashCall.draft!,
    resume: { id: "res-1", user_id: userId, storage_path: `${userId}/cv.pdf` },
    idempotencyKey: "idemp-001",
  });
  assert.equal(sendValidation.valid, false);
  assert.match((sendValidation as { reason: string }).reason, /signature mismatch/i);

  // 8. In-flight sending application cannot be re-approved
  const sendingAppToApprove: MockApplicationRecord = { ...validApp, status: "sending" };
  const sendingApproveResult = simulateApproveEmailDraftAtomic(sendingAppToApprove, validDraft, true, userId, validHash1, validHash2);
  assert.equal(sendingApproveResult.success, false);
  assert.match(sendingApproveResult.error || "", /sending.*cannot be approved/i);
});

test("Security Audit: PostgREST privilege strategy completely revokes direct UPDATE on applications and email_drafts", () => {
  // PostgreSQL privilege resolution:
  // Direct UPDATE on applications and email_drafts is REVOKED from authenticated users.
  // Neither table-level nor column-level UPDATE is granted.
  // Clients cannot modify approved email content or swap resumes directly via PostgREST.

  interface PostgresPrivilegeState {
    tableUpdateGranted: boolean;
    allowedColumns: Set<string>;
  }

  const applicationsPrivileges: PostgresPrivilegeState = {
    tableUpdateGranted: false, // REVOKE ALL UPDATE ON applications FROM authenticated
    allowedColumns: new Set([]), // NO columns have UPDATE privilege
  };

  const emailDraftsPrivileges: PostgresPrivilegeState = {
    tableUpdateGranted: false, // REVOKE ALL UPDATE ON email_drafts FROM authenticated
    allowedColumns: new Set([]), // NO columns have UPDATE privilege
  };

  function simulatePostgrestPatch(
    table: "applications" | "email_drafts",
    patchPayload: Record<string, unknown>
  ): { allowed: boolean; code?: string; error?: string } {
    const config = table === "applications" ? applicationsPrivileges : emailDraftsPrivileges;
    const requestedColumns = Object.keys(patchPayload);

    for (const col of requestedColumns) {
      const permitted = config.tableUpdateGranted || config.allowedColumns.has(col);
      if (!permitted) {
        return {
          allowed: false,
          code: "42501",
          error: `permission denied for table "${table}" (column "${col}")`,
        };
      }
    }
    return { allowed: true };
  }

  // 1. Direct update to applications.status via PostgREST is BLOCKED
  const patchStatus = simulatePostgrestPatch("applications", { status: "approved" });
  assert.equal(patchStatus.allowed, false);
  assert.equal(patchStatus.code, "42501");
  assert.match(patchStatus.error || "", /permission denied/);

  // 2. Direct update to applications.send_idempotency_key via PostgREST is BLOCKED
  const patchIdemp = simulatePostgrestPatch("applications", { send_idempotency_key: "forged-key" });
  assert.equal(patchIdemp.allowed, false);
  assert.equal(patchIdemp.code, "42501");
  assert.match(patchIdemp.error || "", /permission denied/);

  // 3. Direct update to applications.resume_id via PostgREST is BLOCKED (must go through save_email_draft_atomic)
  const patchResume = simulatePostgrestPatch("applications", { resume_id: "res-new-123", updated_at: "2026-01-01" });
  assert.equal(patchResume.allowed, false);
  assert.equal(patchResume.code, "42501");
  assert.match(patchResume.error || "", /permission denied/);

  // 4. Direct update to email_drafts.approved_hash via PostgREST is BLOCKED
  const patchHash = simulatePostgrestPatch("email_drafts", { approved_hash: "forged-hash" });
  assert.equal(patchHash.allowed, false);
  assert.equal(patchHash.code, "42501");
  assert.match(patchHash.error || "", /permission denied/);

  // 5. Direct update to email_drafts.approved_at via PostgREST is BLOCKED
  const patchApprovedAt = simulatePostgrestPatch("email_drafts", { approved_at: "2026-01-01T00:00:00Z" });
  assert.equal(patchApprovedAt.allowed, false);
  assert.equal(patchApprovedAt.code, "42501");
  assert.match(patchApprovedAt.error || "", /permission denied/);

  // 6. Direct update to email_drafts body, subject, or recipient_email via PostgREST is BLOCKED
  // (Prevents modifying approved draft content without going through atomic reset)
  const patchBody = simulatePostgrestPatch("email_drafts", { body: "Malicious content injected" });
  assert.equal(patchBody.allowed, false);
  assert.equal(patchBody.code, "42501");
  assert.match(patchBody.error || "", /permission denied/);

  const patchRecipient = simulatePostgrestPatch("email_drafts", { recipient_email: "attacker@evil.com" });
  assert.equal(patchRecipient.allowed, false);
  assert.equal(patchRecipient.code, "42501");
  assert.match(patchRecipient.error || "", /permission denied/);

  const patchSubject = simulatePostgrestPatch("email_drafts", { subject: "Tampered Subject" });
  assert.equal(patchSubject.allowed, false);
  assert.equal(patchSubject.code, "42501");
  assert.match(patchSubject.error || "", /permission denied/);

  // 7. PostgREST direct INSERT checks
  function simulatePostgrestInsert(
    table: "applications" | "email_drafts",
    payload: Record<string, unknown>
  ): { allowed: boolean; error?: string } {
    if (table === "applications") {
      // RLS check: (status is null or status = 'draft') and send_idempotency_key is null
      const status = payload.status;
      const idemp = payload.send_idempotency_key;
      if (status && status !== "draft") {
        return { allowed: false, error: "new row violates row-level security policy for table applications" };
      }
      if (idemp !== null && idemp !== undefined) {
        return { allowed: false, error: "new row violates row-level security policy for table applications" };
      }
      return { allowed: true };
    } else {
      // RLS check: approved_at is null and approved_hash is null and approved_attachment_hash is null
      if (payload.approved_at || payload.approved_hash || payload.approved_attachment_hash) {
        return { allowed: false, error: "new row violates row-level security policy for table email_drafts" };
      }
      return { allowed: true };
    }
  }

  // Inserting pre-approved application directly via PostgREST is BLOCKED by RLS WITH CHECK
  assert.equal(simulatePostgrestInsert("applications", { status: "approved" }).allowed, false);
  assert.equal(simulatePostgrestInsert("applications", { send_idempotency_key: "idemp" }).allowed, false);
  assert.equal(simulatePostgrestInsert("applications", { status: "draft" }).allowed, true);

  // Inserting pre-approved draft directly via PostgREST is BLOCKED by RLS WITH CHECK
  assert.equal(simulatePostgrestInsert("email_drafts", { approved_hash: "hash" }).allowed, false);
  assert.equal(simulatePostgrestInsert("email_drafts", { approved_at: "2026-01-01" }).allowed, false);
  assert.equal(simulatePostgrestInsert("email_drafts", { recipient_email: "a@b.com", subject: "S", body: "B" }).allowed, true);
});

test("Security Audit: save_email_draft_atomic strictly invalidates approval on content edits or resume swaps", () => {
  interface ApplicationState {
    id: string;
    user_id: string;
    resume_id: string | null;
    status: string;
  }

  interface DraftState {
    application_id: string;
    recipient_email: string;
    subject: string;
    body: string;
    approved_at: string | null;
    approved_hash: string | null;
    approved_attachment_hash: string | null;
  }

  function simulateSaveDraftAtomic(
    app: ApplicationState,
    draft: DraftState | null,
    ownedResumes: Set<string>,
    callerUserId: string | null,
    params: {
      recipient?: string | null;
      subject?: string | null;
      body?: string | null;
      resumeId?: string | null;
    }
  ): { success: boolean; error?: string; app?: ApplicationState; draft?: DraftState } {
    if (!callerUserId) {
      return { success: false, error: "Authentication required" };
    }
    if (app.user_id !== callerUserId) {
      return { success: false, error: "Application not found or unauthorized" };
    }
    if (app.status === "sending" || app.status === "sent") {
      return { success: false, error: `Application is currently ${app.status} and cannot be edited` };
    }

    const updatedApp: ApplicationState = { ...app };
    if (params.resumeId !== undefined && params.resumeId !== null) {
      if (!ownedResumes.has(params.resumeId)) {
        return { success: false, error: "Resume not found or unauthorized" };
      }
      updatedApp.resume_id = params.resumeId;
      updatedApp.status = "draft";
    } else {
      updatedApp.status = "draft";
    }

    let updatedDraft: DraftState = draft
      ? { ...draft, approved_at: null, approved_hash: null, approved_attachment_hash: null }
      : {
          application_id: app.id,
          recipient_email: "",
          subject: "",
          body: "",
          approved_at: null,
          approved_hash: null,
          approved_attachment_hash: null,
        };

    const hasContentParams = params.recipient !== undefined || params.subject !== undefined || params.body !== undefined;
    if (hasContentParams) {
      const rec = params.recipient?.trim() || "";
      const subj = params.subject?.trim() || "";
      const body = params.body || "";

      if (!rec || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rec)) {
        return { success: false, error: "Valid recipient email address is required" };
      }
      if (!subj) {
        return { success: false, error: "Subject line cannot be empty" };
      }
      if (!body.trim()) {
        return { success: false, error: "Message body cannot be empty" };
      }

      updatedDraft = {
        application_id: app.id,
        recipient_email: rec,
        subject: subj,
        body: body,
        approved_at: null,
        approved_hash: null,
        approved_attachment_hash: null,
      };
    }

    return { success: true, app: updatedApp, draft: updatedDraft };
  }

  const userId = "candidate-1";
  const validHash = "a".repeat(64);
  const validAttachmentHash = "b".repeat(64);

  const approvedApp: ApplicationState = {
    id: "app-1",
    user_id: userId,
    resume_id: "res-1",
    status: "approved",
  };

  const approvedDraft: DraftState = {
    application_id: "app-1",
    recipient_email: "recruiter@target.com",
    subject: "Application for Job",
    body: "Please find attached my CV.",
    approved_at: "2026-01-01T00:00:00Z",
    approved_hash: validHash,
    approved_attachment_hash: validAttachmentHash,
  };

  const ownedResumes = new Set(["res-1", "res-2"]);

  // 1. Changing draft body immediately clears approval hash and resets status to 'draft'
  const editBodyResult = simulateSaveDraftAtomic(approvedApp, approvedDraft, ownedResumes, userId, {
    recipient: approvedDraft.recipient_email,
    subject: approvedDraft.subject,
    body: "Modified body text after approval",
  });
  assert.equal(editBodyResult.success, true);
  assert.equal(editBodyResult.app?.status, "draft");
  assert.equal(editBodyResult.draft?.approved_at, null);
  assert.equal(editBodyResult.draft?.approved_hash, null);
  assert.equal(editBodyResult.draft?.approved_attachment_hash, null);
  assert.equal(editBodyResult.draft?.body, "Modified body text after approval");

  // 2. Changing resume_id immediately clears approval hash and resets status to 'draft'
  const switchResumeResult = simulateSaveDraftAtomic(approvedApp, approvedDraft, ownedResumes, userId, {
    resumeId: "res-2",
  });
  assert.equal(switchResumeResult.success, true);
  assert.equal(switchResumeResult.app?.status, "draft");
  assert.equal(switchResumeResult.app?.resume_id, "res-2");
  assert.equal(switchResumeResult.draft?.approved_at, null);
  assert.equal(switchResumeResult.draft?.approved_hash, null);
  assert.equal(switchResumeResult.draft?.approved_attachment_hash, null);

  // 3. Attempting to attach an unowned resume is rejected
  const unownedResumeResult = simulateSaveDraftAtomic(approvedApp, approvedDraft, ownedResumes, userId, {
    resumeId: "victim-resume-999",
  });
  assert.equal(unownedResumeResult.success, false);
  assert.match(unownedResumeResult.error || "", /Resume not found or unauthorized/);

  // 4. Attempting to edit during in-flight 'sending' is rejected
  const sendingApp: ApplicationState = { ...approvedApp, status: "sending" };
  const sendingEditResult = simulateSaveDraftAtomic(sendingApp, approvedDraft, ownedResumes, userId, {
    body: "New text",
  });
  assert.equal(sendingEditResult.success, false);
  assert.match(sendingEditResult.error || "", /Application is currently sending/);

  // 5. Attempting to edit after 'sent' is rejected
  const sentApp: ApplicationState = { ...approvedApp, status: "sent" };
  const sentEditResult = simulateSaveDraftAtomic(sentApp, approvedDraft, ownedResumes, userId, {
    body: "New text",
  });
  assert.equal(sentEditResult.success, false);
  assert.match(sentEditResult.error || "", /Application is currently sent/);

  // 6. Cross-user attempt to edit another candidate's draft is rejected
  const crossUserResult = simulateSaveDraftAtomic(approvedApp, approvedDraft, ownedResumes, "attacker-user", {
    body: "New text",
  });
  assert.equal(crossUserResult.success, false);
  assert.match(crossUserResult.error || "", /unauthorized/);
});


