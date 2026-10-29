import test from "node:test";
import assert from "node:assert/strict";
import {
  isPlaceholderOrUntrustedEmail,
  isTrustedRecruiterEmail,
  buildDraftPayload,
} from "../draft-utils.ts";
import { cleanHtmlToPlainText, decodeHtmlEntities } from "../text-sanitizer.ts";
import { validateApprovedEmailForSend } from "../send-validation.ts";
import { computeDraftHash } from "../draft-integrity.js";

test("isPlaceholderOrUntrustedEmail: strictly identifies synthetic and placeholder addresses", () => {
  // Common placeholders and synthetic domains
  assert.equal(isPlaceholderOrUntrustedEmail("recruiter@example.com"), true);
  assert.equal(isPlaceholderOrUntrustedEmail("test@example.com"), true);
  assert.equal(isPlaceholderOrUntrustedEmail("contact@enterprise.com"), true);
  assert.equal(isPlaceholderOrUntrustedEmail("hr@enterprise.com"), true);
  assert.equal(isPlaceholderOrUntrustedEmail("admin@example.org"), true);
  assert.equal(isPlaceholderOrUntrustedEmail("recruiting@test.dev"), true);
  assert.equal(isPlaceholderOrUntrustedEmail("dev@test.local"), true);
  assert.equal(isPlaceholderOrUntrustedEmail("bot@subdomain.example.com"), true);
  assert.equal(isPlaceholderOrUntrustedEmail("placeholder@acme.org"), true);
  assert.equal(isPlaceholderOrUntrustedEmail("fake-email@corp.com"), true);

  // Null, undefined, empty
  assert.equal(isPlaceholderOrUntrustedEmail(""), true);
  assert.equal(isPlaceholderOrUntrustedEmail(null), true);
  assert.equal(isPlaceholderOrUntrustedEmail(undefined), true);
  assert.equal(isPlaceholderOrUntrustedEmail("   "), true);

  // Legitimate company and recruiter addresses must NOT be flagged
  assert.equal(isPlaceholderOrUntrustedEmail("careers@canonical.com"), false);
  assert.equal(isPlaceholderOrUntrustedEmail("recrutement@instadeep.com"), false);
  assert.equal(isPlaceholderOrUntrustedEmail("rh@vermeg.com"), false);
  assert.equal(isPlaceholderOrUntrustedEmail("talent@sofrecom.com"), false);
  assert.equal(isPlaceholderOrUntrustedEmail("hr.tunisia@expensify.com"), false);
});

test("isTrustedRecruiterEmail: validates real addresses and rejects malformed or placeholder addresses", () => {
  assert.equal(isTrustedRecruiterEmail("recruitment@canonical.com"), true);
  assert.equal(isTrustedRecruiterEmail("contact@talan.com"), true);

  // Rejected placeholders
  assert.equal(isTrustedRecruiterEmail("recruiter@example.com"), false);
  assert.equal(isTrustedRecruiterEmail("test@example.com"), false);
  assert.equal(isTrustedRecruiterEmail("contact@enterprise.com"), false);

  // Rejected malformed strings
  assert.equal(isTrustedRecruiterEmail("not-an-email"), false);
  assert.equal(isTrustedRecruiterEmail("missing-domain@"), false);
  assert.equal(isTrustedRecruiterEmail("@missing-user.com"), false);
  assert.equal(isTrustedRecruiterEmail(""), false);
  assert.equal(isTrustedRecruiterEmail(null), false);
});

test("buildDraftPayload: leaves recipient_email empty when no verified contact is provided", () => {
  // Scenario 1: missing contact email
  const payloadNoContact = buildDraftPayload({
    applicationId: "app-101",
    opportunityTitle: "Software Engineer - Solutions",
    userEmail: "candidate@esprit.tn",
  });
  assert.equal(payloadNoContact.recipient_email, "");
  assert.equal(payloadNoContact.application_id, "app-101");
  assert.ok(payloadNoContact.subject.includes("Software Engineer - Solutions"));

  // Scenario 2: placeholder contact email
  const payloadPlaceholder = buildDraftPayload({
    applicationId: "app-102",
    opportunityTitle: "Web Frontend Engineer",
    userEmail: "candidate@insat.tn",
    contactEmail: "recruiter@example.com",
  });
  assert.equal(payloadPlaceholder.recipient_email, "");

  // Scenario 3: trusted real contact email
  const payloadVerified = buildDraftPayload({
    applicationId: "app-103",
    opportunityTitle: "Python Backend Engineer",
    userEmail: "candidate@enit.tn",
    contactEmail: "jobs@canonical.com",
  });
  assert.equal(payloadVerified.recipient_email, "jobs@canonical.com");
});

test("cleanHtmlToPlainText: cleans raw HTML, entity-encoded tags, and nested entities", () => {
  // Canonical description fixture containing raw HTML entities
  const canonicalRaw =
    "&lt;p&gt;Canonical is a leading provider of open source software and operating systems.&lt;/p&gt;\n" +
    "&lt;p&gt;With&amp;nbsp;&lt;strong&gt;more than 10 billion pulls&lt;/strong&gt;, container images are trusted.&lt;/p&gt;";

  const cleaned = cleanHtmlToPlainText(canonicalRaw);
  assert.ok(!cleaned.includes("&lt;"), "Must not contain raw &lt;");
  assert.ok(!cleaned.includes("&gt;"), "Must not contain raw &gt;");
  assert.ok(!cleaned.includes("<p>"), "Must not contain <p> tags");
  assert.ok(!cleaned.includes("</p>"), "Must not contain </p> tags");
  assert.ok(!cleaned.includes("&nbsp;"), "Must not contain &nbsp;");
  assert.ok(cleaned.includes("Canonical is a leading provider of open source software and operating systems."));
  assert.ok(cleaned.includes("With more than 10 billion pulls, container images are trusted."));

  // Double encoded entities
  const nested = "&amp;lt;div class=&quot;job&quot;&amp;gt;Software Engineer&amp;lt;/div&amp;gt;";
  const cleanedNested = cleanHtmlToPlainText(nested);
  assert.equal(cleanedNested, "Software Engineer");

  // Script tags with adversarial inner contents
  const xss = "<p>Title</p><script>alert('pwned')</script>Description";
  const cleanedXss = cleanHtmlToPlainText(xss);
  assert.ok(!cleanedXss.includes("alert"), "Must strip script contents entirely");
  assert.ok(cleanedXss.includes("Title"));
  assert.ok(cleanedXss.includes("Description"));

  // Tag boundary spacing
  const blockTags = "<div>First block</div><div>Second block</div>";
  const cleanedBlocks = cleanHtmlToPlainText(blockTags);
  assert.equal(cleanedBlocks, "First block\nSecond block");
});

test("decodeHtmlEntities: decodes named, decimal, and hex entities reliably", () => {
  assert.equal(decodeHtmlEntities("&amp;"), "&");
  assert.equal(decodeHtmlEntities("&lt;"), "<");
  assert.equal(decodeHtmlEntities("&gt;"), ">");
  assert.equal(decodeHtmlEntities("&quot;"), '"');
  assert.equal(decodeHtmlEntities("&#39;"), "'");
  assert.equal(decodeHtmlEntities("&nbsp;"), " ");
  assert.equal(decodeHtmlEntities("&#160;"), " ");
  assert.equal(decodeHtmlEntities("&#xA0;"), " ");
  assert.equal(decodeHtmlEntities("Canonical&#39;s Ubuntu"), "Canonical's Ubuntu");
});

test("validateApprovedEmailForSend: blocks dispatch to placeholder or missing recipients", () => {
  const resume = {
    id: "resume-001",
    user_id: "user-001",
    storage_path: "resumes/user-001/cv.pdf",
  };
  const idempotencyKey = "key-test-001";

  // Case 1: Draft with placeholder email recruiter@example.com
  const placeholderHash = computeDraftHash(
    "recruiter@example.com",
    "Application",
    "Hello",
    resume.id,
    resume.storage_path
  );
  const draftPlaceholder = {
    id: "draft-001",
    application_id: "app-001",
    recipient_email: "recruiter@example.com",
    subject: "Application",
    body: "Hello",
    approved_at: new Date().toISOString(),
    approved_hash: placeholderHash,
    approved_attachment_hash: computeDraftHash("", "", "", resume.id, resume.storage_path),
  };

  const placeholderResult = validateApprovedEmailForSend({
    candidateUserId: "user-001",
    application: {
      id: "app-001",
      user_id: "user-001",
      resume_id: resume.id,
      status: "approved",
    },
    draft: draftPlaceholder,
    resume,
    idempotencyKey,
  });

  assert.equal(placeholderResult.valid, false);
  assert.ok(
    placeholderResult.reason?.includes("placeholder") ||
    placeholderResult.reason?.includes("untrusted"),
    "Must explicitly reject placeholder recipient in validation"
  );

  // Case 2: Draft with empty recipient
  const emptyHash = computeDraftHash(
    "",
    "Application",
    "Hello",
    resume.id,
    resume.storage_path
  );
  const draftEmpty = {
    id: "draft-002",
    application_id: "app-002",
    recipient_email: "",
    subject: "Application",
    body: "Hello",
    approved_at: new Date().toISOString(),
    approved_hash: emptyHash,
    approved_attachment_hash: computeDraftHash("", "", "", resume.id, resume.storage_path),
  };

  const emptyResult = validateApprovedEmailForSend({
    candidateUserId: "user-001",
    application: {
      id: "app-002",
      user_id: "user-001",
      resume_id: resume.id,
      status: "approved",
    },
    draft: draftEmpty,
    resume,
    idempotencyKey,
  });

  assert.equal(emptyResult.valid, false);
  assert.ok(emptyResult.reason?.includes("Invalid recipient email address"));

  // Case 3: Draft with trusted verified recruiter email
  const trustedEmail = "talent@canonical.com";
  const validHash = computeDraftHash(
    trustedEmail,
    "Application",
    "Hello",
    resume.id,
    resume.storage_path
  );
  const draftValid = {
    id: "draft-003",
    application_id: "app-003",
    recipient_email: trustedEmail,
    subject: "Application",
    body: "Hello",
    approved_at: new Date().toISOString(),
    approved_hash: validHash,
    approved_attachment_hash: computeDraftHash("", "", "", resume.id, resume.storage_path),
  };

  const validResult = validateApprovedEmailForSend({
    candidateUserId: "user-001",
    application: {
      id: "app-003",
      user_id: "user-001",
      resume_id: resume.id,
      status: "approved",
    },
    draft: draftValid,
    resume,
    idempotencyKey,
  });

  assert.equal(validResult.valid, true);
  if (validResult.valid) {
    assert.equal(validResult.approvedEmail.to, trustedEmail);
  }
});
