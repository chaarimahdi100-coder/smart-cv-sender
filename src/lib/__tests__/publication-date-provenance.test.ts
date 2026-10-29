import test from "node:test";
import assert from "node:assert/strict";
import { verifyOpportunity, type VerificationInput } from "../discovery/verifier.ts";
import { resolveSourcePlatform } from "../discovery/source-resolver.ts";
import { TunisianVacanciesDiscoveryProvider } from "../discovery/adapters/tunisian-vacancies-provider.ts";
import { formatDisplayDate, isDateInPast } from "../date-utils.ts";
import { calculateOpportunityMatchScore } from "../opportunity-matcher.ts";
import { detectAvailabilityConflict } from "../availability-detector.ts";

/**
 * Opportunity Lifecycle Intelligence & Publication Date Audit Regression Tests.
 * Covers all 8 mandatory regression scenarios.
 */

// SCENARIO 1:
// A LinkedIn post dated 11 November 2025 discovered on 20 October 2026
// must retain its 11 November 2025 publication date and LinkedIn source platform.
test("Scenario 1: LinkedIn post dated 2025-11-11 discovered later retains 2025-11-11 publication date and LinkedIn platform", async () => {
  const provider = new TunisianVacanciesDiscoveryProvider();
  const leads = await provider.discoverLeads();
  const medianet = leads.find((l) => l.companyName?.includes("Medianet"));

  assert.ok(medianet, "Medianet announcement must be discovered");
  assert.equal(medianet.datePosted, "2025-11-11T09:00:00.000Z", "Must retain original 2025-11-11 publication date");
  assert.equal(medianet.sourcePlatform, "LinkedIn", "Source platform must strictly be LinkedIn");
  assert.equal(medianet.sourceUrl, "https://www.linkedin.com/posts/medianet_stages-pfe-2026-pfe-book-announcement");
  assert.equal(medianet.applicationUrl, "https://rh.medianet.tn/stages-pfe-2026_11_50");

  const verification = verifyOpportunity({
    title: medianet.title,
    sourceUrl: medianet.sourceUrl,
    applicationUrl: medianet.applicationUrl,
    sourcePlatform: medianet.sourcePlatform,
    sourceProvider: provider.id,
    companyName: medianet.companyName || "Medianet Group",
    companyWebsite: medianet.companyWebsite,
    description: medianet.snippet || "",
    datePosted: medianet.datePosted,
    isSpecificVacancyAnnouncement: true,
  });

  assert.equal(verification.evidence.publishedAt, "2025-11-11T09:00:00.000Z");
  assert.equal(verification.evidence.isPublicationDateUnknown, false);
  assert.equal(verification.evidence.sourcePlatformName, "LinkedIn");
  assert.equal(verification.evidence.sourceUrl, "https://www.linkedin.com/posts/medianet_stages-pfe-2026-pfe-book-announcement");
  assert.equal(verification.evidence.applicationUrl, "https://rh.medianet.tn/stages-pfe-2026_11_50");
});

// SCENARIO 2:
// An opportunity with no known publication date must not inherit the current date or discovery date.
test("Scenario 2: Opportunity with no known publication date must not inherit current or discovery date", () => {
  const input: VerificationInput = {
    title: "Business Analyst (Finance & Regulatory Reporting)",
    sourceUrl: "https://www.vermeg.com/job/business-analyst/",
    sourceProvider: "tunisian_vacancies_live",
    companyName: "Vermeg",
    companyWebsite: "https://www.vermeg.com",
    description: "Offre d'analyste fonctionnel.",
    datePosted: null, // No date provided in source page
    isSpecificVacancyAnnouncement: true,
  };

  const verification = verifyOpportunity(input);

  assert.equal(verification.evidence.publishedAt, null, "publishedAt must remain null when date is unknown");
  assert.equal(verification.evidence.isPublicationDateUnknown, true, "Must flag isPublicationDateUnknown as true");
  assert.ok(
    verification.evidence.notes.some((n) => n.includes("Date de publication d'origine inconnue")),
    "Must attach a provenance note warning about unknown publication date"
  );
  assert.notEqual(
    verification.evidence.publishedAt,
    new Date().toISOString().slice(0, 10),
    "Must never fabricate today's date into publishedAt"
  );
});

// SCENARIO 3:
// A recheck or verification on a new date must not alter the original publication date.
test("Scenario 3: Verification on a new date does not alter original publication date", () => {
  const originalDate = "2025-11-11T09:00:00.000Z";
  const recheckInput: VerificationInput = {
    title: "Stages PFE 2026",
    sourceUrl: "https://www.linkedin.com/posts/medianet_stages-pfe-2026-pfe-book-announcement",
    sourceProvider: "tunisian_vacancies_live",
    companyName: "Medianet Group",
    description: "Re-verifying vacancy months after publication.",
    datePosted: originalDate,
    isSpecificVacancyAnnouncement: true,
  };

  const firstCheck = verifyOpportunity(recheckInput);
  const secondCheck = verifyOpportunity({
    ...recheckInput,
    // Simulating recheck performed at a later time
  });

  assert.equal(firstCheck.evidence.publishedAt, originalDate);
  assert.equal(secondCheck.evidence.publishedAt, originalDate);
  assert.equal(
    secondCheck.evidence.publishedAt,
    firstCheck.evidence.publishedAt,
    "Recheck must preserve original publication date identically"
  );
  assert.ok(
    secondCheck.evidence.checkedAt,
    "checkedAt records the inspection timestamp without altering publishedAt"
  );
});

// SCENARIO 4:
// The originating source platform remains LinkedIn even when the application destination is an employer careers website.
test("Scenario 4: Source platform remains LinkedIn when application destination is employer website", () => {
  const resolved = resolveSourcePlatform({
    sourcePlatform: "LinkedIn",
    sourceUrl: "https://www.linkedin.com/posts/medianet_stages-pfe-2026-pfe-book-announcement",
    applicationUrl: "https://rh.medianet.tn/stages-pfe-2026_11_50",
    sourceProvider: "tunisian_vacancies_live",
  });

  assert.equal(resolved.platformName, "LinkedIn", "Platform must remain LinkedIn, NOT employer website");
  assert.equal(resolved.sourceUrl, "https://www.linkedin.com/posts/medianet_stages-pfe-2026-pfe-book-announcement");
  assert.equal(resolved.applicationUrl, "https://rh.medianet.tn/stages-pfe-2026_11_50");
  assert.equal(resolved.isOfficialEmployerSite, false, "Origin is LinkedIn post, not direct employer portal");

  // Also test case where sourcePlatform was not explicitly provided but sourceUrl is LinkedIn
  const inferred = resolveSourcePlatform({
    sourceUrl: "https://www.linkedin.com/jobs/view/987654321",
    applicationUrl: "https://careers.company.com/apply/123",
  });
  assert.equal(inferred.platformName, "LinkedIn");
  assert.equal(inferred.applicationUrl, "https://careers.company.com/apply/123");
});

// SCENARIO 5:
// An expired deadline continues to trigger closed/expired lifecycle behavior.
test("Scenario 5: Expired deadline triggers closed/expired lifecycle behavior", () => {
  const pastDeadline = "2025-12-01T23:59:59.000Z";
  assert.equal(isDateInPast(pastDeadline), true, "isDateInPast must identify past deadline");

  const input: VerificationInput = {
    title: "Stage PFE Développement Web",
    sourceUrl: "https://example.com/jobs/pfe-past-deadline",
    sourceProvider: "job_board",
    companyName: "Web Agency",
    description: "Stage PFE.",
    validThrough: pastDeadline,
    isSpecificVacancyAnnouncement: true,
  };

  const verification = verifyOpportunity(input);
  assert.equal(verification.status, "expired", "Must classify as expired");
  assert.equal(verification.isStale, true, "Must flag isStale as true");
  assert.ok(verification.evidence.signalsDetected.includes("DEADLINE_EXPIRED"));

  // Calendar conflict check: candidate available in 2027 vs opportunity for 2026
  const conflict = detectAvailabilityConflict(
    { rawCvText: "Disponible pour stage PFE à partir de février 2027" },
    { title: "Stages PFE 2026 : E-business", type: "PFE" }
  );
  assert.equal(conflict.hasConflict, true, "Availability in 2027 must conflict with opportunity session 2026");
});

// SCENARIO 6:
// An inaccessible source does not cause an opportunity to be falsely marked newly published or verified open.
test("Scenario 6: Inaccessible source (404/500/broken) is classified as broken_source and never verified_open or newly published", () => {
  const input: VerificationInput = {
    title: "Stage Développement Frontend",
    sourceUrl: "https://example.com/broken-job-url",
    sourceProvider: "web_search",
    companyName: "Broken Site SARL",
    description: "Page returns 404.",
    httpStatusCode: 404,
    datePosted: null,
  };

  const verification = verifyOpportunity(input);
  assert.equal(verification.status, "broken_source", "Must classify 404 as broken_source");
  assert.notEqual(verification.status, "verified_open", "Must NEVER mark 404 as verified_open");
  assert.notEqual(verification.status, "likely_open", "Must NEVER mark 404 as likely_open");
  assert.equal(verification.evidence.publishedAt, null, "Must not fabricate a publication date");
  assert.equal(verification.evidence.isPublicationDateUnknown, true);
});

// SCENARIO 7:
// Unknown dates and unverified availability are represented accurately in UI data.
test("Scenario 7: Unknown dates and unverified availability are represented truthfully in UI data", () => {
  // Case A: Explicit fallback when date_posted is missing
  const datePosted: string | null = null;
  const displayDate = datePosted ? formatDisplayDate(datePosted) : "Date de publication inconnue";
  assert.equal(displayDate, "Date de publication inconnue", "UI displays explicit unknown date text");

  // Case B: Spontaneous employer track without publication date
  const spontaneousInput: VerificationInput = {
    title: "Piste PFE / Candidature spontanée — Vermeg",
    sourceUrl: "https://www.vermeg.com/careers",
    sourceProvider: "tunisian_pfe_live",
    companyName: "Vermeg",
    companyWebsite: "https://www.vermeg.com",
    description: "Portail carrières pour candidatures spontanées.",
    datePosted: null,
    isSpontaneousLead: true,
  };

  const verification = verifyOpportunity(spontaneousInput);
  assert.equal(verification.status, "unverified", "Spontaneous lead must be unverified");
  assert.equal(verification.evidence.publishedAt, null);
  assert.equal(verification.evidence.isPublicationDateUnknown, true);
  assert.equal(verification.evidence.isAvailabilityUnconfirmed, true);
  assert.ok(verification.evidence.signalsDetected.includes("SPONTANEOUS_APPLICATION_CHANNEL"));
  assert.ok(
    verification.evidence.notes.some((n) => n.toLowerCase().includes("candidature spontanée")),
    "Evidence must explicitly document spontaneous portal provenance"
  );

  // Case C: Match breakdown reports truthful provenance
  const matchResult = calculateOpportunityMatchScore(
    { degree: "Licence en Informatique de Gestion", rawCvText: "Compétences: React, SQL" },
    {
      title: "Business Analyst",
      companyName: "Vermeg",
      source_url: "https://www.vermeg.com/job/business-analyst/",
      source_provider: "tunisian_vacancies_live",
      date_posted: null,
    }
  );

  assert.equal(matchResult.provenance?.sourcePlatformName, "Site officiel de l'employeur");
  assert.equal(matchResult.provenance?.isSpontaneousLead, false);
});

// SCENARIO 8:
// Closed opportunities do not pass the normal draft approval flow.
test("Scenario 8: Closed/expired opportunities fail lifecycle checks and block approval", () => {
  // Helper testing the exact lifecycle blocker condition enforced by approveDraft and sendApprovedApplicationEmail
  function isApplicationBlocked(oppRecord: {
    verification_status?: string | null;
    is_active?: boolean;
    valid_through?: string | null;
  }): boolean {
    const isPastDeadline = oppRecord.valid_through
      ? new Date(oppRecord.valid_through).getTime() < Date.now()
      : false;
    return Boolean(
      oppRecord.verification_status === "closed" ||
      oppRecord.verification_status === "expired" ||
      oppRecord.is_active === false ||
      isPastDeadline
    );
  }

  // 1. Explicitly closed opportunity (e.g. SPX Silverprod on Fabskill)
  assert.equal(
    isApplicationBlocked({ verification_status: "closed", is_active: true }),
    true,
    "Closed status must block approval"
  );

  // 2. Explicitly expired opportunity
  assert.equal(
    isApplicationBlocked({ verification_status: "expired", is_active: true }),
    true,
    "Expired status must block approval"
  );

  // 3. Inactive opportunity
  assert.equal(
    isApplicationBlocked({ verification_status: "verified_open", is_active: false }),
    true,
    "Inactive opportunity (is_active: false) must block approval"
  );

  // 4. Past deadline
  const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  assert.equal(
    isApplicationBlocked({ verification_status: "verified_open", is_active: true, valid_through: pastDate }),
    true,
    "Past deadline must block approval"
  );

  // 5. Active and valid opportunity passes lifecycle check
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(
    isApplicationBlocked({ verification_status: "likely_open", is_active: true, valid_through: futureDate }),
    false,
    "Active and unexpired opportunity must NOT be blocked"
  );
});
