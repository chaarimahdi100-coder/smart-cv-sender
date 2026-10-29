import test from "node:test";
import assert from "node:assert/strict";
import {
  verifyOpportunity,
  isOpportunityStale,
  type VerificationInput,
} from "../discovery/verifier.ts";
import { resolveSourcePlatform } from "../discovery/source-resolver.ts";
import { detectAvailabilityConflict } from "../availability-detector.ts";
import {
  generateDeterministicDraft,
  type CandidateData,
  type OpportunityData,
} from "../email-generator.ts";
import { calculateOpportunityMatchScore } from "../opportunity-matcher.ts";

/**
 * End-to-End Opportunity Reliability & Provenance Audit Regression Suite.
 *
 * Verifies the 10 mandated lifecycle, provenance, availability, and draft integrity rules:
 * 1. Crawl at J+30 does not alter original date_posted
 * 2. LinkedIn post with distinct candidate portal preserves LinkedIn provenance
 * 3. Offer with past deadline is flagged expired and blocks direct application
 * 4. Explicitly closed offer is marked closed and blocks application
 * 5. Temporary network error (5xx / timeout) does not declare posting closed
 * 6. HTTP 404/410 classifies as broken_source without falsely claiming position is filled
 * 7. Spontaneous employer lead gets explicit badge without claiming specific open vacancy
 * 8. Offer without verifiable date/source keeps date null and source d'origine inconnue
 * 9. Draft blocked when opportunity period conflicts with candidate availability
 * 10. Old listing without recent status flagged as to recheck with candidate warning
 */

// Helper replicating the approval and sending lifecycle blocker
function isApplicationLifecycleBlocked(opp: {
  verification_status?: string | null;
  is_active?: boolean;
  valid_through?: string | null;
  availabilityConflict?: boolean;
  conflictResolution?: string | null;
}): { blocked: boolean; reason: string | null } {
  const isPastDeadline = opp.valid_through
    ? new Date(opp.valid_through).getTime() < Date.now()
    : false;

  if (opp.verification_status === "closed" || opp.is_active === false) {
    return { blocked: true, reason: "Offre clôturée par l'employeur." };
  }
  if (opp.verification_status === "expired" || isPastDeadline) {
    return { blocked: true, reason: "Date limite de candidature dépassée." };
  }
  if (opp.availabilityConflict && (!opp.conflictResolution || opp.conflictResolution === "unresolved")) {
    return { blocked: true, reason: "Conflit de calendrier non résolu entre la disponibilité du CV et l'offre." };
  }
  return { blocked: false, reason: null };
}

// SCENARIO 1: Crawl at J+30 does not alter original date_posted
test("Scenario 1: Crawl at J+30 does not alter original date_posted", () => {
  const originalDatePosted = "2025-11-11T09:00:00.000Z";
  const discoveryDateAtJPlus30 = "2025-12-11T14:30:00.000Z";

  const verification = verifyOpportunity({
    title: "Stage PFE Développement Web",
    sourceUrl: "https://example.com/jobs/pfe-web",
    sourceProvider: "job_board",
    companyName: "Web Tech",
    companyWebsite: "https://example.com",
    description: "Stage PFE React & Node.js.",
    datePosted: originalDatePosted,
    isSpecificVacancyAnnouncement: true,
  });

  // Must strictly preserve original publication date
  assert.equal(verification.evidence.publishedAt, originalDatePosted);
  assert.notEqual(verification.evidence.publishedAt, discoveryDateAtJPlus30);
  assert.equal(verification.evidence.isPublicationDateUnknown, false);
});

// SCENARIO 2: LinkedIn post with distinct employer application portal preserves LinkedIn provenance
test("Scenario 2: LinkedIn post with distinct employer application portal preserves LinkedIn provenance", () => {
  const linkedInPostUrl = "https://www.linkedin.com/posts/medianet_stages-pfe-2026-pfe-book-announcement";
  const employerPortalUrl = "https://rh.medianet.tn/stages-pfe-2026_11_50";

  const platformInfo = resolveSourcePlatform({
    sourceUrl: linkedInPostUrl,
    applicationUrl: employerPortalUrl,
    sourcePlatform: "LinkedIn",
    companyWebsite: "https://www.medianet.tn",
    companyName: "Medianet Group",
  });

  assert.equal(platformInfo.platformName, "LinkedIn", "Source platform must remain LinkedIn");
  assert.equal(platformInfo.sourceUrl, linkedInPostUrl, "Source URL must point to original LinkedIn post");
  assert.equal(platformInfo.applicationUrl, employerPortalUrl, "Application URL must point to employer portal");
  assert.equal(platformInfo.isOfficialEmployerSite, false, "LinkedIn post is not itself official employer site");

  const verification = verifyOpportunity({
    title: "Stages PFE 2026 : E-business & Digital Solutions",
    sourceUrl: linkedInPostUrl,
    applicationUrl: employerPortalUrl,
    sourcePlatform: "LinkedIn",
    sourceProvider: "tunisian_vacancies_live",
    companyName: "Medianet Group",
    companyWebsite: "https://www.medianet.tn",
    description: "Annonce LinkedIn pour le PFE Book 2026.",
    datePosted: "2025-11-11T09:00:00.000Z",
    isSpecificVacancyAnnouncement: true,
  });

  assert.equal(verification.evidence.sourcePlatformName, "LinkedIn");
  assert.equal(verification.evidence.sourceUrl, linkedInPostUrl);
  assert.equal(verification.evidence.applicationUrl, employerPortalUrl);
});

// SCENARIO 3: Offer with past deadline is flagged expired and blocks direct application
test("Scenario 3: Offer with past deadline is flagged expired and blocks direct application", () => {
  const pastDeadline = "2026-03-31T23:59:59.000Z";

  const verification = verifyOpportunity({
    title: "Stage PFE Consultant ERP",
    sourceUrl: "https://fabskill.com/fr/job/1471/stagiaires-pfe",
    sourceProvider: "tunisian_vacancies_live",
    companyName: "SPX Silverprod",
    description: "Stage PFE terminé.",
    validThrough: pastDeadline,
    isSpecificVacancyAnnouncement: true,
  });

  assert.equal(verification.status, "expired");
  assert.equal(verification.isStale, true);
  assert.ok(verification.evidence.signalsDetected.includes("DEADLINE_EXPIRED"));

  const blocker = isApplicationLifecycleBlocked({
    verification_status: verification.status,
    valid_through: pastDeadline,
  });

  assert.equal(blocker.blocked, true);
  assert.ok(blocker.reason?.includes("Date limite"));
});

// SCENARIO 4: Explicitly closed offer is marked closed and blocks application
test("Scenario 4: Explicitly closed offer is marked closed and blocks application", () => {
  const verification = verifyOpportunity({
    title: "Stagiaires PFE (Session 2026) - SPX Silverprod",
    sourceUrl: "https://fabskill.com/fr/job/1471/stagiaires-pfe",
    sourceProvider: "tunisian_vacancies_live",
    companyName: "SPX",
    companyWebsite: "https://silverprod.com",
    description: "Cette offre n'est plus disponible. 58 Candidature(s) reçues.",
    pageContentSnippet: "Cette offre n'est plus disponible",
    isSpecificVacancyAnnouncement: true,
  });

  assert.equal(verification.status, "closed");
  assert.equal(verification.isStale, true);
  assert.equal(verification.evidence.noClosedOrExpiredSignals, false);
  assert.ok(verification.evidence.signalsDetected.some((s) => s.includes("CLOSED_MATCH")));

  const blocker = isApplicationLifecycleBlocked({
    verification_status: "closed",
    is_active: false,
  });

  assert.equal(blocker.blocked, true);
  assert.ok(blocker.reason?.includes("Offre clôturée"));
});

// SCENARIO 5: Temporary network error (5xx / timeout) does not declare posting closed
test("Scenario 5: Temporary network error (5xx / timeout) does not declare posting closed", () => {
  const errorCodes = [500, 502, 503, 504];

  for (const statusCode of errorCodes) {
    const verification = verifyOpportunity({
      title: "Ingénieur Fullstack React/Node",
      sourceUrl: "https://example.com/careers/fullstack",
      sourceProvider: "web_search",
      companyName: "Tech SARL",
      description: "Recrutement ingénieur.",
      httpStatusCode: statusCode,
    });

    // Must not be falsely declared closed or expired
    assert.notEqual(
      verification.status,
      "closed",
      `HTTP ${statusCode} must not be declared closed`
    );
    assert.notEqual(
      verification.status,
      "expired",
      `HTTP ${statusCode} must not be declared expired`
    );
    // Is classified as broken_source with recheck recommended
    assert.equal(verification.status, "broken_source");
    assert.equal(verification.evidence.urlReachable, false);
    assert.ok(
      verification.evidence.notes.some((n) => n.includes(String(statusCode))),
      `Notes must record HTTP status code ${statusCode}`
    );
  }
});

// SCENARIO 6: HTTP 404/410 classifies as broken_source without falsely claiming position is filled
test("Scenario 6: HTTP 404/410 classifies as broken_source without falsely claiming position is filled", () => {
  for (const statusCode of [404, 410]) {
    const verification = verifyOpportunity({
      title: "Stage Développement Web",
      sourceUrl: "https://example.com/jobs/vanished-link",
      sourceProvider: "web_search",
      companyName: "Startup SARL",
      description: "Offre devenue inaccessible.",
      httpStatusCode: statusCode,
    });

    assert.equal(
      verification.status,
      "broken_source",
      `HTTP ${statusCode} must be classified as broken_source`
    );
    assert.notEqual(
      verification.status,
      "closed",
      `HTTP ${statusCode} must not falsely claim position was closed or filled`
    );
    assert.equal(verification.evidence.urlReachable, false);
    assert.ok(
      verification.evidence.signalsDetected.includes("HTTP_ERROR"),
      "Must record HTTP_ERROR signal"
    );
  }
});

// SCENARIO 7: Spontaneous employer lead gets explicit badge without claiming specific open vacancy
test("Scenario 7: Spontaneous employer lead gets explicit badge without claiming specific open vacancy", () => {
  const verification = verifyOpportunity({
    title: "Piste PFE 2026 : Ingénierie Web & Solutions Digitales (Medianet - rh.medianet.tn)",
    sourceUrl: "https://rh.medianet.tn",
    sourceProvider: "tunisian_pfe_live",
    companyName: "Medianet Group",
    companyWebsite: "https://www.medianet.tn",
    description: "Portail carrières pour candidatures spontanées PFE.",
    datePosted: null,
    validThrough: null,
    isSpontaneousLead: true,
    isSpecificVacancyAnnouncement: false,
  });

  assert.equal(verification.status, "unverified");
  assert.equal(verification.evidence.publishedAt, null);
  assert.equal(verification.evidence.isPublicationDateUnknown, true);
  assert.equal(verification.evidence.isAvailabilityUnconfirmed, true);
  assert.equal(
    verification.statusReason,
    "Candidature spontanée — aucune offre spécifique confirmée"
  );
  assert.ok(verification.evidence.signalsDetected.includes("SPONTANEOUS_APPLICATION_CHANNEL"));
});

// SCENARIO 8: Offer without verifiable date/source keeps date null and source d'origine inconnue
test("Scenario 8: Offer without verifiable date/source keeps date null and source d'origine inconnue", () => {
  const input: VerificationInput = {
    title: "Développeur Logiciel Indépendant",
    sourceUrl: "https://unknown-aggregator-blog.xyz/post/123",
    sourceProvider: "external_web",
    companyName: "Employeur Inconnu",
    description: "Offre trouvée sans date de publication ni employeur confirmé.",
    datePosted: null,
    validThrough: null,
  };

  const verification = verifyOpportunity(input);

  // Date must remain strictly null
  assert.equal(verification.evidence.publishedAt, null);
  assert.equal(verification.evidence.isPublicationDateUnknown, true);
  assert.ok(
    verification.evidence.notes.some((n) => n.includes("Date de publication d'origine inconnue")),
    "Must warn candidate about unverified publication date"
  );

  // Platform must resolve to unknown
  const platform = resolveSourcePlatform({
    sourceUrl: input.sourceUrl,
  });

  assert.equal(platform.platformName, "Source d'origine inconnue");
  assert.equal(platform.isOfficialEmployerSite, false);
});

// SCENARIO 9: Draft blocked when opportunity period conflicts with candidate availability
test("Scenario 9: Draft blocked when opportunity period conflicts with candidate availability", () => {
  const candidate2027: CandidateData = {
    first_name: "Mahdi",
    last_name: "Chaari",
    email: "chaari@example.com",
    degree: "Licence en Informatique de Gestion",
    skills: ["TypeScript", "Next.js", "PostgreSQL"],
    rawCvText: "Étudiant disponible pour un stage PFE à partir de février 2027.",
  };

  const opp2026: OpportunityData = {
    title: "Stages PFE 2026 : E-business & Digital Solutions (Medianet)",
    companyName: "Medianet Group",
    description: "Programme de stages PFE session 2026.",
    type: "PFE",
    source_platform: "LinkedIn",
    source_url: "https://www.linkedin.com/posts/medianet_stages-pfe-2026-pfe-book-announcement",
    application_url: "https://rh.medianet.tn/stages-pfe-2026_11_50",
    date_posted: "2025-11-11T09:00:00.000Z",
  };

  const conflict = detectAvailabilityConflict(candidate2027, opp2026);
  assert.equal(conflict.hasConflict, true, "Must detect 2027 availability vs 2026 session conflict");

  // Initial unresolved draft blocks approval
  const unresolvedBlocker = isApplicationLifecycleBlocked({
    verification_status: "likely_open",
    is_active: true,
    availabilityConflict: conflict.hasConflict,
    conflictResolution: "unresolved",
  });
  assert.equal(unresolvedBlocker.blocked, true);
  assert.ok(unresolvedBlocker.reason?.includes("Conflit de calendrier"));

  // Generating spontaneous conversion resolves conflict cleanly
  const spontaneousDraft = generateDeterministicDraft(candidate2027, opp2026, {
    conflictStrategy: "spontaneous_converted",
  });

  assert.equal(spontaneousDraft.conflictResolution, "spontaneous_converted");
  assert.ok(
    !spontaneousDraft.subject.includes("2026"),
    "Spontaneous converted subject must not claim 2026 program"
  );
  assert.ok(
    !spontaneousDraft.body.includes("programme de stages PFE 2026"),
    "Spontaneous converted body must not claim 2026 program"
  );
  assert.ok(
    !spontaneousDraft.body.includes("PFE 2027"),
    "Must not invent an unannounced 2027 programme"
  );
  assert.ok(
    spontaneousDraft.body.includes("février 2027"),
    "Must state candidate's truthful availability"
  );

  // Resolved draft unblocks approval
  const resolvedBlocker = isApplicationLifecycleBlocked({
    verification_status: "likely_open",
    is_active: true,
    availabilityConflict: conflict.hasConflict,
    conflictResolution: "spontaneous_converted",
  });
  assert.equal(resolvedBlocker.blocked, false);
});

// SCENARIO 10: Old listing without recent status flagged as to recheck with candidate warning
test("Scenario 10: Old listing without recent status flagged as to recheck with candidate warning", () => {
  const ninetyFiveDaysAgo = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString();
  const oneHundredThirtyDaysAgo = new Date(Date.now() - 130 * 24 * 60 * 60 * 1000).toISOString();

  // Freshness check: standard job older than 90 days is stale
  const jobStaleCheck = isOpportunityStale(ninetyFiveDaysAgo, "Développeur Junior");
  assert.equal(jobStaleCheck.isStale, true, "Standard jobs older than 90 days must be stale");
  assert.ok((jobStaleCheck.daysOld || 0) >= 95);

  // Freshness check: PFE program older than 120 days is stale
  const pfeStaleCheck = isOpportunityStale(oneHundredThirtyDaysAgo, "Stage PFE");
  assert.equal(pfeStaleCheck.isStale, true, "PFE programs older than 120 days must be stale");
  assert.ok((pfeStaleCheck.daysOld || 0) >= 130);

  const verification = verifyOpportunity({
    title: "Stage PFE Développement",
    sourceUrl: "https://example.com/jobs/old-pfe",
    sourceProvider: "job_board",
    companyName: "Ancient Tech",
    companyWebsite: "https://example.com",
    description: "Offre publiée il y a plus de 130 jours.",
    datePosted: oneHundredThirtyDaysAgo,
    isSpecificVacancyAnnouncement: true,
  });

  assert.equal(pfeStaleCheck.needsRecheck, true);
  assert.equal(verification.isStale, true);
  assert.ok(
    verification.evidence.signalsDetected.some((s) => s.includes("STALE") || s.includes("OLDER_THAN")),
    "Must record stale detection signal"
  );

  // Match score reports staleness warning to candidate
  const matchResult = calculateOpportunityMatchScore(
    { degree: "Licence en Informatique de Gestion", rawCvText: "React, SQL" },
    {
      title: "Stage PFE Développement",
      companyName: "Ancient Tech",
      date_posted: oneHundredThirtyDaysAgo,
    }
  );

  assert.equal(matchResult.isStale, true);
  assert.ok(
    matchResult.staleWarning?.includes("120 jours"),
    "Candidate match result must include clear staleness warning"
  );
});
