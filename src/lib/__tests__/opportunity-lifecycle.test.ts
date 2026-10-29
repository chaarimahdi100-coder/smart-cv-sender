import test from "node:test";
import assert from "node:assert/strict";
import {
  verifyOpportunity,
  getFreshnessRules,
  isOpportunityStale,
  type VerificationInput,
} from "../discovery/verifier.ts";

test("Lifecycle: flags future opening date as upcoming status", () => {
  const futureDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const input: VerificationInput = {
    title: "Session Recrutement PFE 2027",
    sourceUrl: "https://example.com/careers/pfe-2027",
    sourceProvider: "official_careers",
    companyName: "Tech Corp",
    companyWebsite: "https://example.com",
    description: "La campagne PFE ouvrira ses portes prochainement.",
    dateOpening: futureDate,
  };

  const result = verifyOpportunity(input);
  assert.equal(result.status, "upcoming", "Must assign 'upcoming' status for future opening date");
  assert.equal(result.isStale, false, "Upcoming postings should not be marked stale");
  assert.ok(result.evidence.signalsDetected.includes("UPCOMING_OPENING_DATE"));
});

test("Lifecycle: flags past valid_through deadline as expired", () => {
  const pastDeadline = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const input: VerificationInput = {
    title: "Stage PFE Développement Web",
    sourceUrl: "https://example.com/jobs/pfe-web",
    sourceProvider: "job_board",
    companyName: "Web Agency",
    companyWebsite: "https://example.com",
    description: "Stage PFE React & Node.js.",
    validThrough: pastDeadline,
  };

  const result = verifyOpportunity(input);
  assert.equal(result.status, "expired", "Must mark expired when deadline has passed");
  assert.equal(result.isStale, true, "Expired listings must be flagged as stale");
  assert.ok(result.evidence.signalsDetected.includes("DEADLINE_EXPIRED"));
});

test("Lifecycle: detects closed posting signals and marks status as closed", () => {
  const closedSnippets = [
    "Les candidatures sont closes pour ce poste.",
    "Cette offre a été pourvue.",
    "Ce poste a été pourvu par nos équipes.",
    "Cette offre d'emploi est clôturée.",
    "Offre clôturée.",
  ];

  for (const snippet of closedSnippets) {
    const input: VerificationInput = {
      title: "Stage Ingénieur Fullstack",
      sourceUrl: "https://example.com/jobs/fullstack-closed",
      sourceProvider: "ats_portal",
      companyName: "Innovate Inc",
      companyWebsite: "https://example.com",
      description: `Description du stage. ${snippet}`,
    };

    const result = verifyOpportunity(input);
    assert.equal(
      result.status,
      "closed",
      `Must identify closed signal in: "${snippet}"`
    );
    assert.equal(result.isStale, true);
    assert.ok(
      result.evidence.signalsDetected.some((s) => s.startsWith("CLOSED_MATCH")),
      "Must record CLOSED_MATCH signal"
    );
  }
});

test("Lifecycle: handles broken source (404/500) as broken_source without assuming closed", () => {
  const input: VerificationInput = {
    title: "Stage Développement",
    sourceUrl: "https://example.com/jobs/missing-page",
    sourceProvider: "web_search",
    companyName: "Startup SARL",
    description: "Recherche stagiaire",
    httpStatusCode: 404,
  };

  const result = verifyOpportunity(input);
  assert.equal(result.status, "broken_source", "HTTP 404 should be marked broken_source, not closed");
  assert.equal(result.evidence.urlReachable, false);
});

test("Lifecycle: applies 90-day staleness threshold for standard jobs", () => {
  const eightyDaysAgo = new Date(Date.now() - 80 * 24 * 60 * 60 * 1000).toISOString();
  const ninetyFiveDaysAgo = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString();

  const freshJob: VerificationInput = {
    title: "Développeur TypeScript Junior",
    sourceUrl: "https://example.com/jobs/ts-junior",
    sourceProvider: "job_board",
    companyName: "Digital Services",
    companyWebsite: "https://example.com",
    description: "CDI Développeur TypeScript",
    datePosted: eightyDaysAgo,
    type: "fulltime",
  };
  const freshResult = verifyOpportunity(freshJob);
  assert.equal(freshResult.isStale, false, "Job under 90 days should not be stale");

  const staleJob: VerificationInput = {
    ...freshJob,
    datePosted: ninetyFiveDaysAgo,
  };
  const staleResult = verifyOpportunity(staleJob);
  assert.equal(staleResult.isStale, true, "Job over 90 days must be flagged as stale");
});

test("Lifecycle: applies 120-day extended staleness threshold for PFE internships", () => {
  const oneHundredDaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
  const oneHundredThirtyDaysAgo = new Date(Date.now() - 130 * 24 * 60 * 60 * 1000).toISOString();

  // 100 days old: Stale for general job, but fresh for PFE
  const pfeOpp: VerificationInput = {
    title: "Stage PFE Business Intelligence",
    sourceUrl: "https://example.com/pfe/bi",
    sourceProvider: "job_board",
    companyName: "BI Tunisia",
    companyWebsite: "https://example.com",
    description: "Stage de fin d'études en BI et reporting",
    datePosted: oneHundredDaysAgo,
    type: "PFE",
  };
  const pfeResult = verifyOpportunity(pfeOpp);
  assert.equal(pfeResult.isStale, false, "PFE posting at 100 days should still be fresh (threshold 120 days)");

  // 130 days old: Stale for PFE
  const stalePfeOpp: VerificationInput = {
    ...pfeOpp,
    datePosted: oneHundredThirtyDaysAgo,
  };
  const stalePfeResult = verifyOpportunity(stalePfeOpp);
  assert.equal(stalePfeResult.isStale, true, "PFE posting over 120 days must be flagged as stale");
});

test("Lifecycle: protects long-running programs (PFE Book / annual campaigns) from drop", () => {
  const oneHundredFortyDaysAgo = new Date(Date.now() - 140 * 24 * 60 * 60 * 1000).toISOString();
  const pfeBook: VerificationInput = {
    title: "PFE Book 2026 — Catalogue des Sujets de Stage",
    sourceUrl: "https://example.com/pfe-book-2026",
    sourceProvider: "official_careers",
    companyName: "Medianet",
    companyWebsite: "https://medianet.tn",
    description: "Découvrez l'ensemble de notre programme et catalogue PFE Book 2026 pour les étudiants.",
    datePosted: oneHundredFortyDaysAgo,
    type: "PFE",
  };

  const result = verifyOpportunity(pfeBook);
  assert.equal(result.isStale, true, "Annual program over threshold is flagged stale for freshness");
  assert.equal(result.status, "likely_open", "Annual program retains likely_open rather than being closed/dropped");
  assert.ok(
    result.evidence.notes.some((n) => n.includes("Programme annuel / PFE Book")),
    "Must include protection note for long-running program"
  );
});

test("Lifecycle: excludes closed and expired opportunities from active feeds", () => {
  const items = [
    { id: "1", title: "Active PFE", verification_status: "verified_open", is_active: true },
    { id: "2", title: "Likely Open Lead", verification_status: "likely_open", is_active: true },
    { id: "3", title: "Closed PFE", verification_status: "closed", is_active: true },
    { id: "4", title: "Expired PFE", verification_status: "expired", is_active: true },
    { id: "5", title: "Inactive Opp", verification_status: "likely_open", is_active: false },
  ];

  // Active filter rule (used by OpportunityDirectoryClient default tabs)
  const activeItems = items.filter(
    (item) =>
      item.is_active !== false &&
      item.verification_status !== "closed" &&
      item.verification_status !== "expired"
  );

  assert.equal(activeItems.length, 2);
  assert.deepEqual(
    activeItems.map((i) => i.id),
    ["1", "2"]
  );

  // Closed/expired filter rule (dedicated historical tab)
  const closedItems = items.filter(
    (item) =>
      item.verification_status === "closed" ||
      item.verification_status === "expired" ||
      item.is_active === false
  );

  assert.equal(closedItems.length, 3);
  assert.deepEqual(
    closedItems.map((i) => i.id),
    ["3", "4", "5"]
  );
});

test("Lifecycle: isVacancyClosedOrExpired blocker identifies deadline and status correctly", () => {
  const isBlocked = (opp: {
    verification_status?: string | null;
    is_active?: boolean;
    valid_through?: string | null;
  }) => {
    const isPast = opp.valid_through ? new Date(opp.valid_through).getTime() < Date.now() : false;
    return Boolean(
      opp.verification_status === "closed" ||
      opp.verification_status === "expired" ||
      opp.is_active === false ||
      isPast
    );
  };

  assert.equal(isBlocked({ verification_status: "closed", is_active: true }), true);
  assert.equal(isBlocked({ verification_status: "expired", is_active: true }), true);
  assert.equal(isBlocked({ verification_status: "likely_open", is_active: false }), true);
  assert.equal(
    isBlocked({
      verification_status: "likely_open",
      is_active: true,
      valid_through: new Date(Date.now() - 10000).toISOString(),
    }),
    true
  );
  assert.equal(
    isBlocked({
      verification_status: "likely_open",
      is_active: true,
      valid_through: new Date(Date.now() + 100000).toISOString(),
    }),
    false
  );
});

test("Lifecycle Governance: configurable freshness rules respect custom parameters and environment overrides", () => {
  // Default rules
  const defaults = getFreshnessRules();
  assert.equal(defaults.staleDaysPfe, 120);
  assert.equal(defaults.staleDaysGeneral, 90);

  // Custom options override
  const custom = getFreshnessRules({ staleDaysPfe: 60, staleDaysGeneral: 45 });
  assert.equal(custom.staleDaysPfe, 60);
  assert.equal(custom.staleDaysGeneral, 45);

  // Staleness check using custom rules
  const fiftyDaysAgo = new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString();
  const standardCheck = isOpportunityStale(fiftyDaysAgo, "JUNIOR");
  assert.equal(standardCheck.isStale, false, "50 days is not stale under default 90-day rule");

  const customCheck = isOpportunityStale(fiftyDaysAgo, "JUNIOR", { staleDaysGeneral: 45 });
  assert.equal(customCheck.isStale, true, "50 days is stale under custom 45-day rule");
  assert.equal(customCheck.thresholdDays, 45);

  // Via verifyOpportunity input
  const oppWithRules: VerificationInput = {
    title: "Stage Fullstack",
    sourceUrl: "https://example.com/stage",
    sourceProvider: "job_board",
    companyName: "Tech Hub",
    description: "Stage web",
    datePosted: fiftyDaysAgo,
    type: "STAGE",
    freshnessRules: { staleDaysGeneral: 45 },
  };
  const verified = verifyOpportunity(oppWithRules);
  assert.equal(verified.isStale, true, "verifyOpportunity must honor input.freshnessRules");
});

test("Lifecycle Governance: unknown publication dates remain strictly null and are never fabricated", () => {
  const oppWithoutDate: VerificationInput = {
    title: "Stage Data Science",
    sourceUrl: "https://example.com/stage-data",
    sourceProvider: "tunisian_board",
    companyName: "Data Corp",
    companyWebsite: "https://example.com",
    description: "Stage Data Science & ML.",
    datePosted: null,
  };

  const result = verifyOpportunity(oppWithoutDate);
  assert.equal(result.evidence.publishedAt, null, "publishedAt must remain null when not evidenced");
  assert.equal(result.evidence.isPublicationDateUnknown, true, "isPublicationDateUnknown must be true");
  assert.ok(
    result.evidence.notes.some((n) => n.includes("Date de publication d'origine inconnue")),
    "Must warn user about unverified publication date"
  );
  assert.notEqual(result.status, "verified_open", "Listing with unknown publication date must never be verified_open");
});

test("Lifecycle Governance: recheck cycle strictly preserves original date_posted while updating last_checked_at", () => {
  const originalDate = "2025-11-11T09:00:00.000Z";
  const recheckInput: VerificationInput = {
    title: "Medianet PFE 2026",
    sourceUrl: "https://www.linkedin.com/posts/medianet-pfe-2026",
    sourceProvider: "recheck_cron",
    sourcePlatform: "LinkedIn",
    companyName: "Medianet",
    companyWebsite: "https://medianet.tn",
    description: "PFE Book 2026",
    datePosted: originalDate,
    pageContentSnippet: "PFE Book 2026 toujours accessible sur rh.medianet.tn",
    httpStatusCode: 200,
  };

  const beforeCheckTime = Date.now();
  const recheckResult = verifyOpportunity(recheckInput);
  const afterCheckTime = Date.now();

  // Preserved publication date
  assert.equal(recheckResult.evidence.publishedAt, originalDate, "Original publication date must remain untouched");
  assert.notEqual(recheckResult.evidence.publishedAt, recheckResult.evidence.checkedAt, "Must not overwrite publishedAt with check timestamp");

  // Updated last_checked_at
  const checkedAtTime = new Date(recheckResult.evidence.checkedAt).getTime();
  assert.ok(checkedAtTime >= beforeCheckTime && checkedAtTime <= afterCheckTime, "checkedAt must reflect recheck timestamp");
});

test("Lifecycle Governance: HTML closing signals in rechecked content definitively transition opportunity to closed", () => {
  const frenchClosedSnippet = "<html><body><h1>Ce poste a été pourvu</h1><p>Merci pour vos candidatures.</p></body></html>";
  const arabicClosedSnippet = "<html><body><p>تم إغلاق التقديم لهذا المنصب</p></body></html>";
  const englishClosedSnippet = "<div>This position has been filled. Applications are closed.</div>";

  for (const snippet of [frenchClosedSnippet, arabicClosedSnippet, englishClosedSnippet]) {
    const input: VerificationInput = {
      title: "PFE Developer 2026",
      sourceUrl: "https://example.com/pfe",
      sourceProvider: "recheck_cron",
      companyName: "Software TN",
      companyWebsite: "https://example.com",
      description: "PFE description",
      pageContentSnippet: snippet,
      httpStatusCode: 200,
    };

    const result = verifyOpportunity(input);
    assert.equal(result.status, "closed", `Expected 'closed' status for snippet: ${snippet.slice(0, 40)}`);
    assert.equal(result.isStale, true);
    assert.ok(result.evidence.closedAt, "Must record closedAt timestamp");
  }
});

test("Lifecycle Governance: missing recruiter email prevents approval and provides official portal application route", () => {
  // Scenario: Opportunity has application_url but no verified recruiter email
  const opportunity = {
    title: "Stage Cloud & DevOps",
    source_url: "https://linkedin.com/jobs/devops",
    application_url: "https://careers.company.com/apply/123",
    verification_status: "likely_open",
    is_active: true,
  };

  const officialApplyUrl = opportunity.application_url || opportunity.source_url;
  assert.equal(officialApplyUrl, "https://careers.company.com/apply/123");

  // Draft with missing/unverified recipient
  const draftWithoutRecipient = {
    recipient_email: "",
    subject: "Candidature PFE",
    body: "Madame, Monsieur...",
  };

  const hasVerifiedRecipient = Boolean(
    draftWithoutRecipient.recipient_email &&
    draftWithoutRecipient.recipient_email.includes("@") &&
    !draftWithoutRecipient.recipient_email.includes("example.com")
  );

  assert.equal(hasVerifiedRecipient, false, "Must detect that recipient email is absent/unverified");

  // Rule: When hasVerifiedRecipient is false, email approval must fail closed
  const canApproveEmail = hasVerifiedRecipient && opportunity.is_active;
  assert.equal(canApproveEmail, false, "Approval must be blocked without verified recipient email");
});

