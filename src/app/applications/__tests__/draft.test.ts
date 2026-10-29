import test from "node:test";
import assert from "node:assert/strict";
import { computeDraftHash } from "../../../lib/draft-integrity.js";
import { normalizeDraftData, buildDraftPayload } from "../../../lib/draft-utils.ts";

test("computeDraftHash generates different hashes for different inputs", async () => {
  const hash1 = await computeDraftHash("hr@example.com", "Application", "Hello", "resume-123");
  const hash2 = await computeDraftHash("hr@example.com", "Application", "Hello World", "resume-123");
  const hash3 = await computeDraftHash("hr@example.com", "Application", "Hello", "resume-456");

  assert.notEqual(hash1, hash2, "Changing body should invalidate hash");
  assert.notEqual(hash1, hash3, "Changing resume should invalidate hash");
});

test("computeDraftHash generates same hash for same inputs", async () => {
  const hash1 = await computeDraftHash("test@test.com", "Subject", "Body", "resume-1");
  const hash2 = await computeDraftHash("test@test.com", "Subject", "Body", "resume-1");

  assert.equal(hash1, hash2, "Same inputs should yield same hash");
});

test("normalizeDraftData correctly extracts draft from PostgREST 1-to-1 object format", () => {
  // Regression test: PostgREST returns a single object when unique constraint is on application_id
  const draftObject = {
    id: "draft-obj-123",
    application_id: "app-456",
    recipient_email: "recruiter@tech.tn",
    subject: "Candidature pour Junior Dev",
    body: "Bonjour...",
    approved_at: null,
    approved_hash: null,
    approved_attachment_hash: null,
  };

  const result = normalizeDraftData(draftObject);
  assert.ok(result, "Should successfully normalize single object format");
  assert.equal(result.id, "draft-obj-123");
  assert.equal(result.recipient_email, "recruiter@tech.tn");
});

test("normalizeDraftData correctly extracts draft from array format (1-to-many)", () => {
  const draftArray = [
    {
      id: "draft-arr-789",
      application_id: "app-456",
      recipient_email: "hr@company.com",
      subject: "Candidature PFE",
      body: "Cher recruteur...",
      approved_at: null,
      approved_hash: null,
      approved_attachment_hash: null,
    },
  ];

  const result = normalizeDraftData(draftArray);
  assert.ok(result, "Should successfully normalize array format");
  assert.equal(result.id, "draft-arr-789");
});

test("normalizeDraftData returns null for empty, missing, or malformed data", () => {
  assert.equal(normalizeDraftData([]), null, "Empty array should yield null");
  assert.equal(normalizeDraftData(null), null, "Null should yield null");
  assert.equal(normalizeDraftData(undefined), null, "Undefined should yield null");
  assert.equal(normalizeDraftData({}), null, "Object without id should yield null");
  assert.equal(normalizeDraftData([{}]), null, "Array with empty object should yield null");
});

test("buildDraftPayload correctly structures draft parameters with contact email", () => {
  const payload = buildDraftPayload({
    applicationId: "app-abc",
    opportunityTitle: "Fullstack Next.js Engineer",
    userEmail: "candidate@smartcv.tn",
    contactEmail: "recruiter@techcorp.tn",
  });

  assert.equal(payload.application_id, "app-abc");
  assert.equal(payload.recipient_email, "recruiter@techcorp.tn");
  assert.equal(payload.subject, "Candidature pour Fullstack Next.js Engineer");
  assert.ok(payload.body.includes("Fullstack Next.js Engineer"));
  assert.ok(payload.body.includes("candidate@smartcv.tn"));
});

test("buildDraftPayload leaves recipient_email empty on missing, invalid, or placeholder email", () => {
  const payload = buildDraftPayload({
    applicationId: "app-def",
    opportunityTitle: "AI Specialist",
    userEmail: "student@esprit.tn",
    contactEmail: "invalid-email-string",
  });

  assert.equal(payload.recipient_email, "", "Invalid email must leave recipient empty");

  const payloadNoContact = buildDraftPayload({
    applicationId: "app-ghi",
    opportunityTitle: "Data Scientist",
    userEmail: "candidate@insat.tn",
  });

  assert.equal(payloadNoContact.recipient_email, "", "Missing contact email must leave recipient empty");

  const payloadPlaceholder = buildDraftPayload({
    applicationId: "app-jkl",
    opportunityTitle: "Software Engineer",
    userEmail: "candidate@esprit.tn",
    contactEmail: "recruiter@example.com",
  });

  assert.equal(payloadPlaceholder.recipient_email, "", "Placeholder example.com email must be rejected and left empty");
});

test("Regression: Draft editor form specifies action={saveDraft} on the form element", async () => {
  const fs = await import("fs");
  const draftPageContent = fs.readFileSync("src/app/applications/[id]/draft/page.tsx", "utf8");

  // Verify that the editor form specifies action={saveDraft}
  assert.match(
    draftPageContent,
    /<form\s+action=\{saveDraft\}\s+className="p-6 sm:p-8 space-y-6">/,
    "Editor form must have action={saveDraft} to prevent uncaught 'unexpected response' runtime errors"
  );
  assert.doesNotMatch(
    draftPageContent,
    /<form\s+className="p-6 sm:p-8 space-y-6">/,
    "Editor form must not be rendered without an action attribute"
  );
});

test("Regression: saveDraft handles empty recipient email without throwing permission errors", async () => {
  // Test that when a draft has an empty recipient (portal/unverified application),
  // isTrustedRecruiterEmail returns false but payload is normalized with empty string
  const { isTrustedRecruiterEmail } = await import("../../../lib/draft-utils.ts");
  assert.equal(isTrustedRecruiterEmail(""), false);
  assert.equal(isTrustedRecruiterEmail("   "), false);

  // Verify buildDraftPayload creates a valid payload with empty recipient
  const payload = buildDraftPayload({
    applicationId: "app-portal-1",
    opportunityTitle: "ERP Cloud & Transformation Digitale",
    userEmail: "candidate@smartcv.dev",
    contactEmail: undefined,
  });
  assert.equal(payload.recipient_email, "");
  assert.ok(payload.subject.length > 0);
  assert.ok(payload.body.length > 0);
});

