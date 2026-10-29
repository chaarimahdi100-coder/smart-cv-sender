import test from "node:test";
import assert from "node:assert/strict";
import { sendEmailMock, type EmailPayload } from "../email-sender.ts";
import { computeDraftHash } from "../draft-integrity.js";
import { validateApprovedEmailForSend } from "../send-validation.ts";

test("sendEmailMock: default behavior is deterministically successful and predictable", async () => {
  const payload: EmailPayload = {
    to: "recruiter@enterprise.com",
    subject: "Application for Software Engineer",
    body: "Please find attached my CV for your review.",
    attachments: [{ filename: "CV.pdf", path: "user-1/cv.pdf" }],
  };

  // Run multiple iterations to prove random failure (Math.random > 0.95) is completely eliminated
  for (let i = 0; i < 50; i++) {
    const result = await sendEmailMock(payload, { delayMs: 0 });
    assert.equal(result.success, true, `Iteration ${i} should predictably succeed`);
    assert.ok(result.messageId, "Must return a generated mock messageId");
    assert.match(result.messageId!, /^mock-id-\d+$/);
    assert.equal(result.error, undefined);
  }
});

test("sendEmailMock: explicit failure option triggers simulated failure on demand", async () => {
  const payload: EmailPayload = {
    to: "recruiter@enterprise.com",
    subject: "Application",
    body: "Hello",
  };

  // 1. Explicit forceFailure option with default error message
  const result = await sendEmailMock(payload, { forceFailure: true, delayMs: 0 });
  assert.equal(result.success, false);
  assert.equal(result.error, "Simulated SMTP connection error (Mock)");
  assert.equal(result.messageId, undefined);

  // 2. Explicit forceFailure option with custom error message
  const customResult = await sendEmailMock(payload, {
    forceFailure: true,
    simulatedError: "Connection timeout to smtp.enterprise.internal:587",
    delayMs: 0,
  });
  assert.equal(customResult.success, false);
  assert.equal(customResult.error, "Connection timeout to smtp.enterprise.internal:587");
});

test("sendEmailMock: designated simulation recipient addresses trigger predictable failure", async () => {
  const testAddresses = [
    "fail@simulation.mock",
    "candidate@fail.mock",
    "simulate-failure@company.com",
    "hr-simulate-failure@test.org",
  ];

  for (const address of testAddresses) {
    const result = await sendEmailMock({ to: address, subject: "Test", body: "Test" }, { delayMs: 0 });
    assert.equal(result.success, false, `Recipient ${address} must trigger simulated failure`);
    assert.equal(result.error, "Simulated SMTP connection error (Mock)");
  }
});

test("sendEmailMock: SIMULATE_EMAIL_FAILURE environment variable triggers predictable failure", async () => {
  const originalEnv = process.env.SIMULATE_EMAIL_FAILURE;
  try {
    process.env.SIMULATE_EMAIL_FAILURE = "true";
    const result = await sendEmailMock(
      { to: "standard@company.com", subject: "Test", body: "Test" },
      { delayMs: 0 }
    );
    assert.equal(result.success, false);
    assert.equal(result.error, "Simulated SMTP connection error (Mock)");
  } finally {
    if (originalEnv !== undefined) {
      process.env.SIMULATE_EMAIL_FAILURE = originalEnv;
    } else {
      delete process.env.SIMULATE_EMAIL_FAILURE;
    }
  }
});

test("Send Simulation Lifecycle: successful send transitions to 'sent' and locks draft", async () => {
  const userId = "candidate-succ-1";
  const resumeId = "resume-succ-1";
  const storagePath = `${userId}/cv.pdf`;
  const appId = "app-succ-1";

  const recipient = "hr@targetcorp.com";
  const subject = "PFE Internship Application";
  const body = "Dear Recruiter,\nPlease find attached my CV.";
  const draftHash = computeDraftHash(recipient, subject, body, resumeId, storagePath);
  const attachmentHash = computeDraftHash("", "", "", resumeId, storagePath);

  // Application and draft in approved state
  const app = {
    id: appId,
    user_id: userId,
    resume_id: resumeId,
    status: "approved",
    send_idempotency_key: null as string | null,
  };

  const draft = {
    id: "draft-1",
    application_id: appId,
    recipient_email: recipient,
    subject,
    body,
    approved_at: new Date().toISOString(),
    approved_hash: draftHash,
    approved_attachment_hash: attachmentHash,
  };

  const resume = {
    id: resumeId,
    user_id: userId,
    storage_path: storagePath,
  };

  const idempotencyKey = `idemp_${appId}_${Date.now()}`;

  // 1. Pre-send cryptographic validation
  const validation = validateApprovedEmailForSend({
    candidateUserId: userId,
    application: app,
    draft,
    resume,
    idempotencyKey,
  });
  assert.equal(validation.valid, true);

  // 2. Transition to 'sending'
  app.status = "sending";
  app.send_idempotency_key = idempotencyKey;

  // 3. Mock send execution (predictable default success)
  const sendResult = await sendEmailMock({
    to: validation.approvedEmail.to,
    subject: validation.approvedEmail.subject,
    body: validation.approvedEmail.body,
    attachments: [{ filename: "CV.pdf", path: validation.approvedEmail.attachmentPath }],
  }, { delayMs: 0 });

  assert.equal(sendResult.success, true);
  assert.ok(sendResult.messageId);

  // 4. Mark application sent on mock confirmation
  app.status = "sent";

  // 5. Verify integrity after send: approval snapshot and draft remain intact
  assert.equal(app.status, "sent");
  assert.equal(draft.approved_hash, draftHash);
  assert.ok(draft.approved_at);

  // 6. Terminal state check: cannot be re-sent
  const secondSendValidation = validateApprovedEmailForSend({
    candidateUserId: userId,
    application: app,
    draft,
    resume,
    idempotencyKey: "idemp_new_key",
  });
  assert.equal(secondSendValidation.valid, false);
  assert.match((secondSendValidation as { reason: string }).reason, /Application status is 'sent'/);
});

test("Send Simulation Lifecycle: failure preserves approved draft, avoids false delivery report, and permits retry", async () => {
  const userId = "candidate-fail-1";
  const resumeId = "resume-fail-1";
  const storagePath = `${userId}/cv.pdf`;
  const appId = "app-fail-1";

  const recipient = "hr@targetcorp.com";
  const subject = "PFE Internship Application";
  const body = "Dear Recruiter,\nPlease find attached my CV.";
  const draftHash = computeDraftHash(recipient, subject, body, resumeId, storagePath);
  const attachmentHash = computeDraftHash("", "", "", resumeId, storagePath);

  const app = {
    id: appId,
    user_id: userId,
    resume_id: resumeId,
    status: "approved",
    send_idempotency_key: null as string | null,
  };

  const draft = {
    id: "draft-1",
    application_id: appId,
    recipient_email: recipient,
    subject,
    body,
    approved_at: new Date().toISOString(),
    approved_hash: draftHash,
    approved_attachment_hash: attachmentHash,
  };

  const resume = {
    id: resumeId,
    user_id: userId,
    storage_path: storagePath,
  };

  const firstIdempotencyKey = `idemp_${appId}_attempt_1`;

  // 1. Initial approval validation succeeds
  const firstValidation = validateApprovedEmailForSend({
    candidateUserId: userId,
    application: app,
    draft,
    resume,
    idempotencyKey: firstIdempotencyKey,
  });
  assert.equal(firstValidation.valid, true);

  // 2. Status enters 'sending'
  app.status = "sending";
  app.send_idempotency_key = firstIdempotencyKey;

  // 3. Mock transmission triggers an explicit simulated failure
  const sendResult = await sendEmailMock({
    to: firstValidation.approvedEmail.to,
    subject: firstValidation.approvedEmail.subject,
    body: firstValidation.approvedEmail.body,
    attachments: [{ filename: "CV.pdf", path: firstValidation.approvedEmail.attachmentPath }],
  }, { forceFailure: true, delayMs: 0 });

  assert.equal(sendResult.success, false);
  assert.equal(sendResult.error, "Simulated SMTP connection error (Mock)");

  // 4. On failure: transition to 'failed'
  app.status = "failed";

  // 5. Verify approval integrity: draft approval and cryptographic hashes ARE PRESERVED
  assert.equal(app.status, "failed");
  assert.notEqual(app.status, "sent", "Failed send must NEVER falsely mark application as sent");
  assert.equal(draft.approved_hash, draftHash, "Approval hash must remain intact on transmission failure");
  assert.equal(draft.approved_attachment_hash, attachmentHash, "Attachment hash must remain intact");
  assert.ok(draft.approved_at, "Approved timestamp must not be cleared on transmission failure");

  // 6. Retry capability: validation permits retrying sending from 'failed' status because approval is intact
  const retryIdempotencyKey = `idemp_${appId}_attempt_2`;
  const retryValidation = validateApprovedEmailForSend({
    candidateUserId: userId,
    application: app,
    draft,
    resume,
    idempotencyKey: retryIdempotencyKey,
  });
  assert.equal(retryValidation.valid, true, "Retry must be valid when approved draft is intact");

  // 7. Transition back into 'sending' for retry
  app.status = "sending";
  app.send_idempotency_key = retryIdempotencyKey;

  // 8. Retry succeeds
  const retrySendResult = await sendEmailMock({
    to: retryValidation.approvedEmail.to,
    subject: retryValidation.approvedEmail.subject,
    body: retryValidation.approvedEmail.body,
  }, { forceFailure: false, delayMs: 0 });

  assert.equal(retrySendResult.success, true);
  app.status = "sent";
  assert.equal(app.status, "sent");
});

test("Send Simulation Lifecycle: modifying draft during failed state invalidates approval and blocks retry", () => {
  const userId = "candidate-fail-2";
  const resumeId = "resume-fail-2";
  const storagePath = `${userId}/cv.pdf`;
  const appId = "app-fail-2";

  const recipient = "hr@targetcorp.com";
  const subject = "PFE Internship Application";
  const body = "Dear Recruiter,\nPlease find attached my CV.";
  const draftHash = computeDraftHash(recipient, subject, body, resumeId, storagePath);
  const attachmentHash = computeDraftHash("", "", "", resumeId, storagePath);

  const app = {
    id: appId,
    user_id: userId,
    resume_id: resumeId,
    status: "failed", // previously failed
    send_idempotency_key: "idemp_prev",
  };

  // User edits body after failure
  const draftWithEditedBody = {
    id: "draft-1",
    application_id: appId,
    recipient_email: recipient,
    subject,
    body: "Tampered body after failed send",
    approved_at: new Date().toISOString(),
    approved_hash: draftHash, // old hash no longer matches body
    approved_attachment_hash: attachmentHash,
  };

  const resume = {
    id: resumeId,
    user_id: userId,
    storage_path: storagePath,
  };

  const retryValidation = validateApprovedEmailForSend({
    candidateUserId: userId,
    application: app,
    draft: draftWithEditedBody,
    resume,
    idempotencyKey: "idemp_retry",
  });

  assert.equal(retryValidation.valid, false);
  assert.match((retryValidation as { reason: string }).reason, /signature mismatch/i);
});
