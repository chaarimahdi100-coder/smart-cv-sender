import test from "node:test";
import assert from "node:assert/strict";
import {
  computeSendTrackingKey,
  validateSendTrackingKey,
  validateApprovedEmailForSend,
  type ApplicationRecord,
  type EmailDraftRecord,
  type ResumeRecord,
} from "../send-validation.ts";
import { computeDraftHash } from "../draft-integrity.js";
import { sendEmailMock } from "../email-sender.ts";
import { canTransition } from "../application-state-machine.ts";

test("Idempotency: computeSendTrackingKey produces stable deterministic key for same approved hash", () => {
  const appId = "app-stable-001";
  const approvedHash = "sha256-approved-hash-abc123def456";

  const key1 = computeSendTrackingKey(appId, approvedHash);
  const key2 = computeSendTrackingKey(appId, approvedHash);

  assert.equal(key1, key2, "Must produce exact same key across retries and reloads");
  assert.ok(key1.startsWith(`track_${appId.slice(0, 8)}_`), "Key must contain application prefix");
  assert.equal(validateSendTrackingKey(appId, approvedHash, key1), true);
});

test("Idempotency: changing approved hash produces a completely different tracking key", () => {
  const appId = "app-stable-001";
  const hashOriginal = "sha256-original-hash";
  const hashEdited = "sha256-edited-hash";

  const keyOriginal = computeSendTrackingKey(appId, hashOriginal);
  const keyEdited = computeSendTrackingKey(appId, hashEdited);

  assert.notEqual(keyOriginal, keyEdited, "Altering approved content must invalidate previous tracking key");
  assert.equal(validateSendTrackingKey(appId, hashOriginal, keyEdited), false);
  assert.equal(validateSendTrackingKey(appId, hashEdited, keyOriginal), false);
});

test("Idempotency: validateApprovedEmailForSend rejects key mismatch against approved draft signature", () => {
  const userId = "candidate-1";
  const appId = "app-idemp-1";
  const resumeId = "res-idemp-1";
  const storagePath = `${userId}/cv.pdf`;
  const recipient = "recruiter@acme.tn";
  const subject = "Candidature PFE";
  const body = "Madame, Monsieur...";

  const draftHash = computeDraftHash(recipient, subject, body, resumeId, storagePath);
  const attachmentHash = computeDraftHash("", "", "", resumeId, storagePath);

  const app: ApplicationRecord = {
    id: appId,
    user_id: userId,
    resume_id: resumeId,
    status: "approved",
  };

  const draft: EmailDraftRecord = {
    id: "draft-idemp-1",
    application_id: appId,
    recipient_email: recipient,
    subject,
    body,
    approved_at: new Date().toISOString(),
    approved_hash: draftHash,
    approved_attachment_hash: attachmentHash,
  };

  const resume: ResumeRecord = {
    id: resumeId,
    user_id: userId,
    storage_path: storagePath,
  };

  // 1. Missing key
  const missingKeyRes = validateApprovedEmailForSend({
    candidateUserId: userId,
    application: { ...app, send_idempotency_key: null },
    draft,
    resume,
    idempotencyKey: "",
  });
  assert.equal(missingKeyRes.valid, false);
  assert.match(missingKeyRes.reason, /Missing send idempotency key/i);

  // 2. Mismatched key with strict tracking enabled
  const correctKey = computeSendTrackingKey(appId, draftHash);
  const rogueKey = `track_${appId.slice(0, 8)}_roguekey1234567890`;

  const mismatchedRes = validateApprovedEmailForSend({
    candidateUserId: userId,
    application: app,
    draft,
    resume,
    idempotencyKey: rogueKey,
    strictTrackingKey: true,
  });
  assert.equal(mismatchedRes.valid, false);
  assert.match(mismatchedRes.reason, /Idempotency key mismatch/i);

  // 3. Matching key with strict tracking enabled succeeds
  const matchedRes = validateApprovedEmailForSend({
    candidateUserId: userId,
    application: app,
    draft,
    resume,
    idempotencyKey: correctKey,
    strictTrackingKey: true,
  });
  assert.equal(matchedRes.valid, true);
});

test("Idempotency: sendEmailMock returns deterministic messageId when trackingKey is provided", async () => {
  const trackingKey = "track_app12345_67890abcdef";

  const result1 = await sendEmailMock(
    { to: "recruiter@target.tn", subject: "Hello", body: "Test" },
    { trackingKey, delayMs: 0 }
  );
  const result2 = await sendEmailMock(
    { to: "recruiter@target.tn", subject: "Hello", body: "Test" },
    { trackingKey, delayMs: 0 }
  );

  assert.equal(result1.success, true);
  assert.equal(result2.success, true);
  assert.equal(result1.messageId, result2.messageId, "Mock messageId must be completely deterministic for identical tracking key");
  assert.ok(result1.messageId?.startsWith("mock_msg_track_app12345"));
});

test("Concurrency: in-flight sending key conflict prevents concurrent overlapping sends", () => {
  const userId = "user-flight-1";
  const appId = "app-flight-1";
  const resumeId = "res-flight-1";
  const storagePath = `${userId}/cv.pdf`;
  const recipient = "recruiter@corp.tn";
  const subject = "Sub";
  const body = "Body";

  const draftHash = computeDraftHash(recipient, subject, body, resumeId, storagePath);
  const attachmentHash = computeDraftHash("", "", "", resumeId, storagePath);

  const inFlightKey = "track_app-flig_existing";
  const conflictingKey = "track_app-flig_newconflicting";

  const app: ApplicationRecord = {
    id: appId,
    user_id: userId,
    resume_id: resumeId,
    status: "sending",
    send_idempotency_key: inFlightKey,
  };

  const draft: EmailDraftRecord = {
    id: "draft-flight-1",
    application_id: appId,
    recipient_email: recipient,
    subject,
    body,
    approved_at: new Date().toISOString(),
    approved_hash: draftHash,
    approved_attachment_hash: attachmentHash,
  };

  const resume: ResumeRecord = { id: resumeId, user_id: userId, storage_path: storagePath };

  const conflictRes = validateApprovedEmailForSend({
    candidateUserId: userId,
    application: app,
    draft,
    resume,
    idempotencyKey: conflictingKey,
  });

  assert.equal(conflictRes.valid, false);
  assert.match(conflictRes.reason, /in-flight sending key cannot be modified/i);
});

test("Fencing: transition from sending requires valid fencing token", () => {
  // Missing / false fencing token must be rejected
  const withoutToken = canTransition("sending", "sent", { hasCurrentFencingToken: false });
  assert.equal(withoutToken.allowed, false);
  assert.match(withoutToken.reason || "", /fencing token/i);

  // Valid fencing token is accepted
  const withToken = canTransition("sending", "sent", { hasCurrentFencingToken: true });
  assert.equal(withToken.allowed, true);
});

test("Ambiguous states: sending cannot be automatically postponed or abandoned", () => {
  // Ensure state machine blocks any attempt to postpone or revert an in-flight sending application
  assert.equal(canTransition("sending", "postponed").allowed, false);
  assert.equal(canTransition("sending", "draft").allowed, false);
  assert.equal(canTransition("sending", "approved").allowed, false);
});
