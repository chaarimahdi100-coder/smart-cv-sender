import test from "node:test";
import assert from "node:assert/strict";
import {
  canTransition,
  assertValidTransition,
  canEditDraft,
  canDeleteApplication,
  isValidApplicationStatus,
  ALL_APPLICATION_STATUSES,
  type ApplicationStatus,
} from "../application-state-machine.ts";

test("Application State Machine: status validation recognizes all valid statuses", () => {
  for (const status of ALL_APPLICATION_STATUSES) {
    assert.equal(isValidApplicationStatus(status), true);
  }
  assert.equal(isValidApplicationStatus("invalid_status"), false);
  assert.equal(isValidApplicationStatus(null), false);
  assert.equal(isValidApplicationStatus(undefined), false);
  assert.equal(isValidApplicationStatus(123), false);
});

test("Application State Machine: permitted transitions adhere strictly to the intended transition policy", () => {
  // 1. draft -> approved (Approval action)
  assert.equal(canTransition("draft", "approved", { hasValidApproval: true }).allowed, true);
  assert.equal(canTransition("draft", "approved", { hasValidApproval: false }).allowed, false);

  // 2. failed -> approved (Re-approval action)
  assert.equal(canTransition("failed", "approved", { hasValidApproval: true }).allowed, true);
  assert.equal(canTransition("failed", "approved", { hasValidApproval: false }).allowed, false);

  // 3. approved -> sending (Valid approved draft)
  assert.equal(canTransition("approved", "sending", { hasValidApproval: true }).allowed, true);
  assert.equal(canTransition("approved", "sending", { hasValidApproval: false }).allowed, false);

  // 4. failed -> sending (Valid approval and same logical send key)
  assert.equal(
    canTransition("failed", "sending", { hasValidApproval: true, isSameLogicalSendKey: true }).allowed,
    true
  );
  assert.equal(
    canTransition("failed", "sending", { hasValidApproval: true, isSameLogicalSendKey: false }).allowed,
    false
  );

  // 5. sending -> sent (Valid provider result and fencing token)
  assert.equal(canTransition("sending", "sent", { hasCurrentFencingToken: true }).allowed, true);
  assert.equal(canTransition("sending", "sent", { hasCurrentFencingToken: false }).allowed, false);

  // 6. sending -> failed (Current fencing token)
  assert.equal(canTransition("sending", "failed", { hasCurrentFencingToken: true }).allowed, true);
  assert.equal(canTransition("sending", "failed", { hasCurrentFencingToken: false }).allowed, false);

  // 7. draft -> postponed (Authorized conflict pause)
  assert.equal(canTransition("draft", "postponed").allowed, true);

  // 8. approved -> postponed (Authorized postponement resets approval)
  assert.equal(canTransition("approved", "postponed").allowed, true);

  // 9. failed -> postponed (Authorized postponement)
  assert.equal(canTransition("failed", "postponed").allowed, true);

  // 10. postponed -> draft (Save action / resume)
  assert.equal(canTransition("postponed", "draft").allowed, true);

  // 11. approved -> draft (Editing draft resets approval)
  assert.equal(canTransition("approved", "draft").allowed, true);

  // 12. failed -> draft (Editing draft resets failure)
  assert.equal(canTransition("failed", "draft").allowed, true);
});

test("Application State Machine: strictly forbids illegal transitions", () => {
  // CRITICAL INVARIANT: sending -> postponed is STRICTLY FORBIDDEN
  const sendingToPostponed = canTransition("sending", "postponed");
  assert.equal(sendingToPostponed.allowed, false);
  assert.match(sendingToPostponed.reason || "", /actively in 'sending' state cannot be postponed/i);

  // CRITICAL INVARIANT: postponed -> approved directly is STRICTLY FORBIDDEN
  const postponedToApproved = canTransition("postponed", "approved");
  assert.equal(postponedToApproved.allowed, false);
  assert.match(postponedToApproved.reason || "", /cannot transition directly to 'approved'/i);

  // CRITICAL INVARIANT: postponed -> sending directly is STRICTLY FORBIDDEN
  const postponedToSending = canTransition("postponed", "sending");
  assert.equal(postponedToSending.allowed, false);
  assert.match(postponedToSending.reason || "", /cannot transition directly from 'postponed'/i);

  // CRITICAL INVARIANT: draft -> sending directly without approval is FORBIDDEN
  const draftToSending = canTransition("draft", "sending");
  assert.equal(draftToSending.allowed, false);

  // CRITICAL INVARIANT: draft -> sent directly is FORBIDDEN
  const draftToSent = canTransition("draft", "sent");
  assert.equal(draftToSent.allowed, false);
});

test("Application State Machine: terminal status 'sent' is irreversible and immutable", () => {
  const allOtherStatuses: ApplicationStatus[] = ["draft", "approved", "sending", "failed", "postponed"];

  for (const target of allOtherStatuses) {
    const result = canTransition("sent", target);
    assert.equal(result.allowed, false, `'sent' must never transition to '${target}'`);
    assert.match(result.reason || "", /terminal 'sent' status/i);
  }

  // Idempotent return is allowed
  const idempotentResult = canTransition("sent", "sent");
  assert.equal(idempotentResult.allowed, true);
  assert.match(idempotentResult.reason || "", /idempotent/i);
});

test("Application State Machine: assertValidTransition throws on forbidden transition", () => {
  assert.doesNotThrow(() => assertValidTransition("draft", "approved", { hasValidApproval: true }));
  assert.throws(
    () => assertValidTransition("sending", "postponed"),
    /cannot be postponed/i
  );
  assert.throws(
    () => assertValidTransition("sent", "draft"),
    /terminal 'sent'/i
  );
});

test("Application State Machine: draft editing permissions", () => {
  assert.equal(canEditDraft("draft"), true);
  assert.equal(canEditDraft("approved"), true); // Editing allowed, will reset approval to draft
  assert.equal(canEditDraft("failed"), true);
  assert.equal(canEditDraft("postponed"), true);

  // Strictly forbidden during active dispatch and after completion
  assert.equal(canEditDraft("sending"), false);
  assert.equal(canEditDraft("sent"), false);
});

test("Application State Machine: deletion protection guards permanent audit trail", () => {
  // 'sending' must NOT be deleted
  const sendingDelete = canDeleteApplication("sending");
  assert.equal(sendingDelete.allowed, false);
  assert.match(sendingDelete.reason || "", /en cours d'envoi/i);

  // 'sent' must NOT be deleted
  const sentDelete = canDeleteApplication("sent");
  assert.equal(sentDelete.allowed, false);
  assert.match(sentDelete.reason || "", /historique d'audit d'envoi est permanent/i);

  // Deletion is permitted for un-sent statuses
  assert.equal(canDeleteApplication("draft").allowed, true);
  assert.equal(canDeleteApplication("failed").allowed, true);
  assert.equal(canDeleteApplication("postponed").allowed, true);
  assert.equal(canDeleteApplication("approved").allowed, true);
});
