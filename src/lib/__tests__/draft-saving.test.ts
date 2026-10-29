import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDraftData, buildDraftPayload, type EmailDraftRecord } from "../draft-utils.ts";

test("normalizeDraftData always returns the latest updated draft when multiple drafts exist", () => {
  // Scenario: An application has an initial unedited draft, and a later edited draft.
  const oldDraft: EmailDraftRecord = {
    id: "draft-old-001",
    application_id: "app-123",
    recipient_email: "recruiter@company.com",
    subject: "Candidature pour [Titre]",
    body: "Bonjour,\n\nJe souhaite vous proposer ma candidature...",
    approved_at: "2024-01-01T10:00:00.000Z",
    approved_hash: "hash-old",
    approved_attachment_hash: "att-hash-old",
    created_at: "2024-01-01T10:00:00.000Z",
    updated_at: "2024-01-01T10:00:00.000Z",
  };

  const updatedDraft: EmailDraftRecord = {
    id: "draft-new-002",
    application_id: "app-123",
    recipient_email: "recruiter@company.com",
    subject: "Candidature personnalisée — Mahdi Chaari",
    body: "Bonjour,\n\nActuellement étudiant en 3ème année...",
    approved_at: null, // Reset on save
    approved_hash: null,
    approved_attachment_hash: null,
    created_at: "2024-01-01T10:00:00.000Z",
    updated_at: "2024-01-01T11:30:00.000Z", // Saved later
  };

  // Even if the database returns rows in reverse or physical order (old draft first)
  const draftsArray = [oldDraft, updatedDraft];
  const resolved = normalizeDraftData(draftsArray);

  assert.ok(resolved, "Should resolve a draft");
  assert.equal(resolved.id, "draft-new-002", "Must resolve the newly edited draft, not the stale one");
  assert.equal(resolved.subject, "Candidature personnalisée — Mahdi Chaari");
  assert.ok(resolved.body.includes("Actuellement étudiant"));
  assert.equal(resolved.approved_at, null, "Approval must be null after editing");
});

test("buildDraftPayload correctly preserves edited subject and body overrides", () => {
  const editedSubject = "Candidature ingénieur logiciel — Yassine Ben Salem";
  const editedBody = "Madame, Monsieur,\n\nJe vous adresse ma candidature...";

  const payload = buildDraftPayload({
    applicationId: "app-999",
    opportunityTitle: "Ingénieur Logiciel",
    userEmail: "yassine@example.com",
    contactEmail: "hr@company.com",
    subject: editedSubject,
    body: editedBody,
  });

  assert.equal(payload.subject, editedSubject, "Should preserve edited subject");
  assert.equal(payload.body, editedBody, "Should preserve edited body");
  assert.equal(payload.recipient_email, "hr@company.com");
  assert.ok(payload.updated_at, "Should include updated_at timestamp");
});

test("Simulated draft edit lifecycle: editing, saving, and reloading preserves state", () => {
  // Step 1: Initial draft created
  const initialDraft: EmailDraftRecord = {
    id: "draft-cycle-1",
    application_id: "app-lifecycle",
    recipient_email: "hr@techcorp.tn",
    subject: "Candidature initiale",
    body: "Corps initial",
    approved_at: "2024-01-01T10:00:00Z",
    approved_hash: "hash-initial",
    approved_attachment_hash: "att-hash-initial",
    created_at: "2024-01-01T10:00:00Z",
    updated_at: "2024-01-01T10:00:00Z",
  };

  // Step 2: User edits subject and body in the editor
  const userEdits = {
    recipient_email: "talents@techcorp.tn",
    subject: "Candidature Stage PFE Développement — Yassine",
    body: "Bonjour,\n\nJe vous soumets ma candidature pour ce stage...",
  };

  // Step 3: saveDraft mutation runs and invalidates approval
  const savedDraft: EmailDraftRecord = {
    ...initialDraft,
    ...userEdits,
    approved_at: null,
    approved_hash: null,
    approved_attachment_hash: null,
    updated_at: new Date().toISOString(),
  };

  // Step 4: Page reload / query returns the state
  const reloaded = normalizeDraftData(savedDraft);

  assert.ok(reloaded);
  assert.equal(reloaded.recipient_email, "talents@techcorp.tn");
  assert.equal(reloaded.subject, "Candidature Stage PFE Développement — Yassine");
  assert.equal(reloaded.body, userEdits.body);
  assert.equal(reloaded.approved_at, null, "Approval was properly invalidated");
});
