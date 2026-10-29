import test from "node:test";
import assert from "node:assert/strict";
import { TunisianVacanciesDiscoveryProvider } from "../adapters/tunisian-vacancies-provider.ts";
import { TunisianPfeDiscoveryProvider } from "../adapters/tunisian-pfe-provider.ts";
import { verifyOpportunity } from "../verifier.ts";
import { isDuplicatePosting } from "../normalizer.ts";
import { DiscoveryEngine } from "../engine.ts";
import { SOURCE_REGISTRY, getSourceById } from "../registry.ts";
import { calculateOpportunityMatchScore } from "../../opportunity-matcher.ts";
import { generateDeterministicDraft } from "../../email-generator.ts";

test("TunisianVacanciesDiscoveryProvider: discovers genuine published specific vacancies", async () => {
  const provider = new TunisianVacanciesDiscoveryProvider();
  const leads = await provider.discoverLeads();

  assert.ok(leads.length >= 3, "Must discover at least 3 genuine published vacancies");
  assert.equal(provider.id, "tunisian_vacancies_live");

  for (const lead of leads) {
    assert.ok(lead.sourceUrl.startsWith("https://"), `Source URL "${lead.sourceUrl}" must be secure HTTPS`);
    assert.ok(lead.companyName, `Lead "${lead.title}" must have explicit employer name`);
    assert.ok(lead.location?.includes("Tunis"), `Lead "${lead.title}" must be located in Tunisia tech hubs`);
    assert.ok((lead.snippet || "").length > 50, `Lead "${lead.title}" must contain genuine description snippet`);
    assert.equal(lead.rawPayload?.isDemo, false, "Must not be demo simulation");
    assert.equal(lead.rawPayload?.isSpecificVacancyAnnouncement, true, "Must be flagged as specific vacancy announcement");
  }
});

test("Medianet PFE 2026: specific published PFE announcement, likely_open status, included in PFE filter", async () => {
  const provider = new TunisianVacanciesDiscoveryProvider();
  const leads = await provider.discoverLeads();
  const medianet = leads.find((l) => l.companyName?.includes("Medianet"));

  assert.ok(medianet, "Must discover Medianet PFE 2026 announcement");
  assert.equal(medianet?.sourceUrl, "https://www.linkedin.com/posts/medianet_stages-pfe-2026-pfe-book-announcement");
  assert.equal(medianet?.applicationUrl, "https://rh.medianet.tn/stages-pfe-2026_11_50");
  assert.equal(medianet?.sourcePlatform, "LinkedIn");
  assert.equal(medianet?.datePosted, "2025-11-11T09:00:00.000Z");
  assert.equal(medianet?.type, "PFE", "Must be classified as PFE");
  assert.ok((medianet?.snippet || "").includes("PFE BOOK 2026"), "Must reference official PFE Book 2026");
  assert.equal((medianet?.rawPayload as Record<string, unknown>)?.pfeBookPdfUrl, "https://rh.medianet.tn/upload/1762877658.pdf");

  const verification = verifyOpportunity({
    title: medianet!.title,
    sourceUrl: medianet!.sourceUrl,
    sourceProvider: provider.id,
    companyName: medianet!.companyName || "Medianet Group",
    companyWebsite: medianet!.companyWebsite,
    description: medianet!.snippet || "",
    location: medianet!.location,
    datePosted: medianet!.datePosted,
    isDirectApiFeed: false,
    isSpontaneousLead: false,
    isSpecificVacancyAnnouncement: true,
  });

  // Strict verification criteria: specific listing + corroborated employer site = likely_open
  assert.equal(verification.status, "likely_open", "Specific active announcement with corroborated website must be likely_open");
  assert.notEqual(verification.status, "verified_open", "Must NEVER be marked verified_open without direct ATS API feed");
  assert.notEqual(verification.status, "unverified", "Specific announcement with verified employer site must not be unverified");
  assert.equal(verification.evidence.isSpecificListing, true);
  assert.equal(verification.evidence.employerCorroborated, true);
  assert.equal(verification.evidence.noClosedOrExpiredSignals, true);

  // Belongs in PFE filter
  assert.equal(medianet?.type?.toUpperCase(), "PFE", "Must qualify under PFE category filter");
});

test("Vermeg Business Analyst: specific CDD vacancy, classified as JUNIOR, strictly EXCLUDED from PFE filter", async () => {
  const provider = new TunisianVacanciesDiscoveryProvider();
  const leads = await provider.discoverLeads();
  const vermeg = leads.find((l) => l.sourceUrl?.includes("business-analyst"));

  assert.ok(vermeg, "Must discover Vermeg Business Analyst vacancy");
  assert.equal(vermeg?.sourceUrl, "https://www.vermeg.com/job/business-analyst/");
  assert.equal(vermeg?.type, "JUNIOR", "Source explicitly states CDD contract — must be JUNIOR, NOT PFE");
  assert.notEqual(vermeg?.type, "PFE", "Must NEVER classify CDD Business Analyst as PFE");

  const raw = (vermeg?.rawPayload || {}) as Record<string, unknown>;
  assert.equal(raw.contractType, "CDD");

  const verification = verifyOpportunity({
    title: vermeg!.title,
    sourceUrl: vermeg!.sourceUrl,
    sourceProvider: provider.id,
    companyName: vermeg!.companyName || "Vermeg",
    companyWebsite: vermeg!.companyWebsite,
    description: vermeg!.snippet || "",
    location: vermeg!.location,
    datePosted: vermeg!.datePosted,
    isDirectApiFeed: false,
    isSpontaneousLead: false,
    isSpecificVacancyAnnouncement: true,
  });

  assert.equal(verification.status, "likely_open");
  assert.equal(verification.evidence.isSpecificListing, true);
  assert.equal(verification.evidence.employerCorroborated, true);

  // PFE Filter exclusion test
  const pfeFilter = [vermeg!].filter((opp) => opp.type?.toUpperCase() === "PFE");
  assert.equal(pfeFilter.length, 0, "Vermeg Business Analyst CDD must NOT appear in PFE filter");
});

test("SPX Silverprod PFE: detect 'Cette offre n'est plus disponible' and classify strictly as closed", async () => {
  const provider = new TunisianVacanciesDiscoveryProvider();
  const leads = await provider.discoverLeads();
  const spx = leads.find((l) => l.companyName?.includes("SPX"));

  assert.ok(spx, "Must discover SPX PFE listing");
  assert.equal(spx?.sourceUrl, "https://fabskill.com/fr/job/1471/stagiaires-pfe");
  assert.equal(spx?.type, "PFE");

  const raw = (spx?.rawPayload || {}) as Record<string, unknown>;
  const verification = verifyOpportunity({
    title: spx!.title,
    sourceUrl: spx!.sourceUrl,
    sourceProvider: provider.id,
    companyName: spx!.companyName || "SPX",
    companyWebsite: spx!.companyWebsite,
    description: spx!.snippet || "",
    location: spx!.location,
    datePosted: spx!.datePosted,
    pageContentSnippet: String(raw.pageContentSnippet || "Cette offre n'est plus disponible 58 Candidature(s)"),
    isDirectApiFeed: false,
    isSpontaneousLead: false,
    isSpecificVacancyAnnouncement: true,
  });

  // Strict closed classification
  assert.equal(verification.status, "closed", "Unavailable listing must be strictly marked as closed");
  assert.notEqual(verification.status, "verified_open", "Closed listing must never be verified_open");
  assert.notEqual(verification.status, "likely_open", "Closed listing must never be likely_open");
  assert.equal(verification.evidence.noClosedOrExpiredSignals, false);
  assert.ok(
    verification.evidence.signalsDetected.some((s) => s.includes("CLOSED_MATCH")),
    "Must detect CLOSED_MATCH signal"
  );
});

test("Coexistence with Spontaneous Leads: 10 general employer tracks remain preserved as unverified", async () => {
  const pfeProvider = new TunisianPfeDiscoveryProvider();
  const spontaneousLeads = await pfeProvider.discoverLeads();

  assert.equal(spontaneousLeads.length, 10, "Must preserve all 10 spontaneous employer leads");
  for (const lead of spontaneousLeads) {
    const raw = (lead.rawPayload || {}) as Record<string, unknown>;
    assert.equal(raw.isSpontaneousLead, true, `Lead "${lead.title}" must be tagged isSpontaneousLead: true`);
    assert.equal(raw.isSpecificVacancyAnnouncement, false, `Lead "${lead.title}" must be isSpecificVacancyAnnouncement: false`);

    const verification = verifyOpportunity({
      title: lead.title,
      sourceUrl: lead.sourceUrl,
      sourceProvider: pfeProvider.id,
      companyName: lead.companyName || "Entreprise",
      companyWebsite: lead.companyWebsite,
      description: lead.snippet || "",
      isSpontaneousLead: true,
      isSpecificVacancyAnnouncement: false,
    });

    assert.equal(verification.status, "unverified", "Spontaneous portals must strictly remain unverified");
    assert.equal(verification.evidence.isSpecificListing, false);
  }
});

test("Decoupled Relevance Scoring: candidate match score evaluates technical fit without altering verification status", () => {
  const bisCandidate = {
    first_name: "Amira",
    last_name: "Trabelsi",
    degree: "Licence en Informatique de Gestion",
    school: "Institut Supérieur de Gestion de Tunis (ISG)",
    skills: ["SQL", "ETL", "Business Intelligence", "Power BI", "Finance"],
    projects: [
      {
        title: "Projet Décisionnel Bancaire",
        technologies: ["SQL", "ETL", "Power BI"],
      },
    ],
    rawCvText: "Étudiante en Licence en Informatique de Gestion (ISG Tunis). Compétences : SQL, ETL, Power BI, Finance. Projet Décisionnel Bancaire.",
  };

  // 1. Candidate score on Vermeg Business Analyst
  const vermegMatch = calculateOpportunityMatchScore(bisCandidate, {
    title: "Business Analyst (Finance & Regulatory Reporting / ETL / SQL)",
    description: "Analyse fonctionnelle, ETL bancaire et requêtes SQL financières.",
    type: "JUNIOR",
    companyName: "Vermeg",
  });

  assert.ok(vermegMatch.score >= 70, `BIS student with SQL/ETL/Finance should score high on BA role (got ${vermegMatch.score}%)`);

  // 2. Draft generation for Vermeg Business Analyst
  const draft = generateDeterministicDraft(bisCandidate, {
    title: "Business Analyst (Finance & Regulatory Reporting / ETL / SQL)",
    companyName: "Vermeg",
    description: "Analyse fonctionnelle, ETL bancaire et requêtes SQL financières.",
    type: "JUNIOR",
  });

  assert.ok(
    draft.subject.includes("Candidature au poste de Business Analyst"),
    `Draft subject must be formatted properly (got: "${draft.subject}")`
  );
  assert.ok(draft.body.includes("Vermeg"), "Draft body must reference company Vermeg");
  assert.ok(!draft.body.includes("recruiter@example.com"), "Draft must never contain fake placeholder email");
});

test("Deduplication Engine: handles identical announcements cleanly", () => {
  const opp1 = {
    title: "Stages PFE 2026 : E-business & Digital Solutions (Medianet PFE Book 2026)",
    companyName: "Medianet Group",
    canonicalUrl: "https://rh.medianet.tn/stages-pfe-2026_11_50",
  };

  const opp2 = {
    title: "Stages PFE 2026 : E-business & Digital Solutions",
    companyName: "Medianet",
    canonicalUrl: "https://rh.medianet.tn/stages-pfe-2026_11_50?utm_source=linkedin",
  };

  const opp3 = {
    title: "Piste PFE 2026 : Ingénierie Web & Solutions Digitales (Medianet - rh.medianet.tn)",
    companyName: "Medianet Group",
    canonicalUrl: "https://rh.medianet.tn",
  };

  assert.equal(isDuplicatePosting(opp1, opp2), true, "Cross-posted vacancy with UTM parameters should be recognized as duplicate");
  assert.equal(isDuplicatePosting(opp1, opp3), false, "Specific announcement vs root career portal must NOT collide as duplicate");
});

test("Source Registry: registers tunisian_vacancies_live with primary coverage", () => {
  const vacanciesSource = getSourceById("tunisian_vacancies_live");
  assert.ok(vacanciesSource, "tunisian_vacancies_live must be registered in SOURCE_REGISTRY");
  assert.equal(vacanciesSource?.tunisiaCoverage, "primary");
  assert.equal(vacanciesSource?.enabled, true);
  assert.equal(vacanciesSource?.isConfigured, true);
  assert.ok(SOURCE_REGISTRY.some((s) => s.id === "tunisian_vacancies_live"));
});

test("Discovery Engine Integration: includes TunisianVacanciesDiscoveryProvider in active providers", () => {
  const engine = new DiscoveryEngine();
  const providers = Reflect.get(engine, "providers") as Array<{ id: string }>;
  const vacanciesProvider = providers.find((p) => p.id === "tunisian_vacancies_live");
  assert.ok(vacanciesProvider, "DiscoveryEngine must register tunisian_vacancies_live provider");
});
