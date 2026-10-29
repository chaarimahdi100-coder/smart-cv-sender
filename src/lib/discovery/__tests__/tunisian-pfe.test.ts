import test from "node:test";
import assert from "node:assert/strict";
import { TunisianPfeDiscoveryProvider } from "../adapters/tunisian-pfe-provider.ts";
import { detectOpportunitySeniority } from "../../seniority-detector.ts";
import { verifyOpportunity } from "../verifier.ts";
import { getSourceById, SOURCE_REGISTRY } from "../registry.ts";
import { DiscoveryEngine } from "../engine.ts";
import { calculateOpportunityMatchScore } from "../../opportunity-matcher.ts";
import { generateDeterministicDraft } from "../../email-generator.ts";

test("TunisianPfeDiscoveryProvider: discovers 10 genuine live Tunisian PFE listings", async () => {
  const provider = new TunisianPfeDiscoveryProvider();
  const leads = await provider.discoverLeads();

  assert.equal(leads.length, 10, "Provider must supply exactly 10 curated genuine PFE listings");

  for (const lead of leads) {
    // 1. Title & Type
    assert.ok(
      lead.title.toLowerCase().includes("pfe"),
      `Lead "${lead.title}" must explicitly declare PFE status`
    );
    assert.equal(lead.type, "PFE", `Lead "${lead.title}" must have type PFE`);
    assert.ok(
      !lead.title.startsWith("[DEMO]"),
      `Lead "${lead.title}" must not be tagged with [DEMO]`
    );

    // 2. Demo Isolation
    const raw = lead.rawPayload as Record<string, unknown>;
    assert.equal(raw?.isDemo, false, `Lead "${lead.title}" must have isDemo: false`);

    // 3. Location & Company
    assert.ok(
      lead.location?.includes("Tunisie") || lead.location?.includes("Tunis") || lead.location?.includes("Ariana") || lead.location?.includes("Sousse"),
      `Lead "${lead.title}" must be located in Tunisia`
    );
    assert.ok(lead.companyName && lead.companyName.length > 2, "Must specify company name");
    assert.ok(
      lead.companyWebsite?.startsWith("https://"),
      `Lead "${lead.title}" must have official company HTTPS website`
    );

    // 4. Application URL
    assert.ok(
      lead.sourceUrl.startsWith("https://"),
      `Lead "${lead.title}" must have HTTPS source URL`
    );
    assert.ok(
      (raw?.applicationUrl as string)?.startsWith("https://"),
      `Lead "${lead.title}" must have HTTPS application URL`
    );

    // 5. Clean text without raw HTML entities
    assert.ok(!lead.snippet?.includes("&lt;"), "Snippet must not contain raw &lt;");
    assert.ok(!lead.snippet?.includes("&gt;"), "Snippet must not contain raw &gt;");
    assert.ok(!lead.snippet?.includes("<p>"), "Snippet must not contain raw HTML tags");
  }
});

test("Target Sector Coverage: covers Informatique de Gestion, BI, Web and ERP domains", async () => {
  const provider = new TunisianPfeDiscoveryProvider();
  const leads = await provider.discoverLeads();

  const domains = leads.map((l) => l.domain);

  assert.ok(
    domains.some((d) => d?.includes("Business Information Systems") || d?.includes("BI")),
    "Must cover Business Information Systems / BI"
  );
  assert.ok(
    domains.some((d) => d?.includes("Web Development")),
    "Must cover Web Fullstack Development"
  );
  assert.ok(
    domains.some((d) => d?.includes("ERP") || d?.includes("Digital Transformation")),
    "Must cover ERP & Digital Transformation"
  );
  assert.ok(
    domains.some((d) => d?.includes("Consulting") || d?.includes("Software Engineering")),
    "Must cover IT Consulting / Software Engineering"
  );
});

test("Seniority Detection: classifies all Tunisian PFE leads as level 'pfe'", async () => {
  const provider = new TunisianPfeDiscoveryProvider();
  const leads = await provider.discoverLeads();

  for (const lead of leads) {
    const detected = detectOpportunitySeniority({
      title: lead.title,
      description: lead.snippet,
      type: lead.type,
    });

    assert.equal(
      detected.level,
      "pfe",
      `Opportunity "${lead.title}" must be detected as level "pfe"`
    );
    assert.equal(detected.isManagement, false, "PFE must not be marked as management");
    assert.equal(detected.isSenior, false, "PFE must not be marked as senior");
    assert.equal(detected.minYearsExpected, 0, "PFE must expect 0 years of experience");
  }
});

test("Seniority Differentiation: accurately differentiates PFE vs Summer Stage vs Junior vs Manager", () => {
  // PFE role
  const pfe = detectOpportunitySeniority({
    title: "Stage PFE : Développeur Next.js",
    type: "PFE",
  });
  assert.equal(pfe.level, "pfe");

  // Summer internship (STAGE)
  const summerStage = detectOpportunitySeniority({
    title: "Stage d'été : Développeur Frontend React",
    type: "STAGE",
  });
  assert.equal(summerStage.level, "intern");

  // Junior developer
  const junior = detectOpportunitySeniority({
    title: "Développeur Junior Fullstack",
    type: "JUNIOR",
  });
  assert.equal(junior.level, "junior");

  // Manager role
  const manager = detectOpportunitySeniority({
    title: "Engineering Manager - Web",
    type: "MANAGER",
  });
  assert.equal(manager.level, "manager");

  // Word boundary regression: "Internal Auditor" must NOT be classified as intern/STAGE
  const auditor = detectOpportunitySeniority({
    title: "Internal Auditor",
    type: "OTHER",
  });
  assert.notEqual(auditor.level, "intern", "Internal Auditor must NOT match intern/stage");
  assert.notEqual(auditor.level, "pfe", "Internal Auditor must NOT match pfe");
});

test("Verification Pipeline: classifies spontaneous / general employer portals strictly as unverified", async () => {
  const provider = new TunisianPfeDiscoveryProvider();
  const leads = await provider.discoverLeads();

  for (const lead of leads) {
    const raw = (lead.rawPayload || {}) as Record<string, unknown>;
    const result = verifyOpportunity({
      title: lead.title,
      sourceUrl: lead.sourceUrl,
      sourceProvider: provider.id,
      companyName: lead.companyName || "Entreprise",
      companyWebsite: lead.companyWebsite,
      description: lead.snippet || "",
      location: lead.location,
      datePosted: lead.datePosted,
      isDirectApiFeed: false,
      isSpontaneousLead: Boolean(raw.isSpontaneousLead),
      isSpecificVacancyAnnouncement: raw.isSpecificVacancyAnnouncement !== false,
    });

    assert.equal(
      result.status,
      "unverified",
      `Listing "${lead.title}" without verified specific posting must be classified as unverified`
    );
    assert.notEqual(result.status, "verified_open", "Spontaneous portals must NEVER be marked verified_open");
    assert.notEqual(result.status, "likely_open", "Spontaneous portals must NEVER be marked likely_open");
    assert.equal(result.evidence.isSpecificListing, false, "Spontaneous career portals are not specific vacancies");
    assert.ok(
      result.evidence.signalsDetected.includes("SPONTANEOUS_APPLICATION_CHANNEL"),
      "Must detect SPONTANEOUS_APPLICATION_CHANNEL signal"
    );
    assert.equal(result.evidence.employerCorroborated, true, "Company website should be corroborated");
    assert.equal(result.evidence.urlReachable, true);
    assert.equal(result.isStale, false);
    assert.notEqual(result.status, "broken_source");
    assert.notEqual(result.status, "rejected");
  }
});

test("SMOFT ERP: verified official URL, truthful lead title, and unverified status", async () => {
  const provider = new TunisianPfeDiscoveryProvider();
  const leads = await provider.discoverLeads();
  const smoft = leads.find((l) => l.companyName?.includes("SMOFT"));

  assert.ok(smoft, "Must discover SMOFT ERP opportunity");
  assert.equal(smoft?.sourceUrl, "https://smoft.io/carriere.php?lang=fr", "Must use official smoft.io/carriere.php URL");
  assert.equal(smoft?.companyWebsite, "https://smoft.io", "Official SMOFT domain is smoft.io");
  assert.ok(smoft?.title.startsWith("Piste PFE"), "Title must indicate a spontaneous PFE lead");

  const raw = (smoft?.rawPayload || {}) as Record<string, unknown>;
  const verification = verifyOpportunity({
    title: smoft!.title,
    sourceUrl: smoft!.sourceUrl,
    sourceProvider: provider.id,
    companyName: smoft!.companyName || "SMOFT ERP",
    companyWebsite: smoft!.companyWebsite,
    description: smoft!.snippet || "",
    location: smoft!.location,
    datePosted: smoft!.datePosted,
    isSpontaneousLead: Boolean(raw.isSpontaneousLead),
    isSpecificVacancyAnnouncement: raw.isSpecificVacancyAnnouncement !== false,
  });

  assert.equal(verification.status, "unverified", "SMOFT general career form must remain unverified");
  assert.notEqual(verification.status, "likely_open");
  assert.notEqual(verification.status, "verified_open");
  assert.equal(verification.evidence.isSpecificListing, false);
});

test("Decoupled Architecture: candidate relevance match score remains distinct from vacancy verification status", async () => {
  const candidate = {
    first_name: "Youssef",
    last_name: "Ben Salem",
    degree: "Licence en Informatique de Gestion",
    school: "Esprit School of Business",
    skills: ["ERP", "SQL", "Web Development", "TypeScript", "Next.js"],
    projects: [
      {
        title: "Système ERP & Gestion Commerciale",
        technologies: ["SQL", "TypeScript", "Next.js"],
      },
    ],
    rawCvText: "Étudiant en Licence en Informatique de Gestion à Esprit School of Business. Compétences : SQL, TypeScript, Next.js. Projets : Système ERP & Gestion Commerciale (SQL, Next.js).",
  };

  const provider = new TunisianPfeDiscoveryProvider();
  const leads = await provider.discoverLeads();
  const smoftLead = leads.find((l) => l.companyName?.includes("SMOFT"))!;

  // 1. Calculate relevance score (measures profile/skill fit)
  const matchScore = calculateOpportunityMatchScore(candidate, {
    title: smoftLead.title,
    description: smoftLead.snippet,
    type: smoftLead.type,
    companyName: smoftLead.companyName,
  });

  assert.ok(
    matchScore.score >= 80,
    `Candidate with ERP & SQL should have high technical match score (got ${matchScore.score}%)`
  );

  // 2. Verification status (measures posting auditability)
  const raw = (smoftLead.rawPayload || {}) as Record<string, unknown>;
  const verification = verifyOpportunity({
    title: smoftLead.title,
    sourceUrl: smoftLead.sourceUrl,
    sourceProvider: provider.id,
    companyName: smoftLead.companyName || "SMOFT ERP",
    companyWebsite: smoftLead.companyWebsite,
    description: smoftLead.snippet || "",
    isSpontaneousLead: Boolean(raw.isSpontaneousLead),
    isSpecificVacancyAnnouncement: raw.isSpecificVacancyAnnouncement !== false,
  });

  assert.equal(verification.status, "unverified", "Verification status remains strictly unverified");
  assert.notEqual(verification.status, "likely_open");

  // 3. Draft generation handles spontaneous lead cleanly without double title prefixes
  const draft = generateDeterministicDraft(candidate, {
    title: smoftLead.title,
    companyName: smoftLead.companyName,
    description: smoftLead.snippet,
    type: smoftLead.type,
  });

  assert.ok(
    draft.subject.includes("Candidature spontanée — Stage PFE : ERP Cloud & Transformation Digitale des Entreprises"),
    `Draft subject should be formatted cleanly without duplicate PFE prefixes (got: "${draft.subject}")`
  );
  assert.ok(
    draft.body.includes("un stage de fin d'études (PFE) axé sur ERP Cloud & Transformation Digitale des Entreprises"),
    `Draft body should reference clean role title (got: "${draft.body}")`
  );
  assert.ok(!draft.body.includes("Piste PFE 2026 :"), "Draft body must not contain 'Piste PFE 2026 :'");
});

test("Feed & Category Filtering: PFE filter returns positive genuine results in LIVE mode without demo leakage", async () => {
  const provider = new TunisianPfeDiscoveryProvider();
  const liveLeads = await provider.discoverLeads();

  const demoOpportunities = [
    { id: "demo-1", title: "[DEMO] PFE : Web", type: "PFE", isDemo: true },
    { id: "demo-2", title: "[DEMO] Stage : Mobile", type: "STAGE", isDemo: true },
  ];

  const liveOpportunities = liveLeads.map((l, idx) => ({
    id: `live-${idx}`,
    title: l.title,
    type: l.type || "PFE",
    isDemo: false,
  }));

  const allOpportunities = [...demoOpportunities, ...liveOpportunities];

  // 1. LIVE Feed mode
  const liveFeed = allOpportunities.filter((op) => !op.isDemo);
  assert.equal(liveFeed.length, 10, "LIVE feed must contain exactly 10 genuine opportunities");
  assert.ok(liveFeed.every((op) => !op.isDemo), "Zero demo listings in LIVE feed");

  // 2. LIVE Feed + PFE Category
  const livePfe = liveFeed.filter((op) => op.type.toUpperCase() === "PFE");
  assert.equal(livePfe.length, 10, "LIVE feed PFE category must return all 10 genuine PFE listings");

  // 3. DEMO Feed mode
  const demoFeed = allOpportunities.filter((op) => op.isDemo);
  assert.equal(demoFeed.length, 2, "DEMO feed must contain exactly 2 demo items");
});

test("Source Registry: tunisian_pfe_live registered with primary coverage for Tunisian PFE programs", () => {
  const pfeSource = getSourceById("tunisian_pfe_live");
  assert.ok(pfeSource, "tunisian_pfe_live must be registered in SOURCE_REGISTRY");
  assert.equal(pfeSource?.tunisiaCoverage, "primary");
  assert.equal(pfeSource?.enabled, true);
  assert.equal(pfeSource?.isConfigured, true);
  assert.ok(pfeSource?.description.includes("PFE 2026"));
  assert.ok(SOURCE_REGISTRY.some((s) => s.id === "tunisian_pfe_live"), "SOURCE_REGISTRY must contain tunisian_pfe_live");
});

test("Discovery Engine Integration: includes TunisianPfeDiscoveryProvider in active providers", () => {
  const engine = new DiscoveryEngine();
  // Verify private providers array via reflected property
  const providers = Reflect.get(engine, "providers") as Array<{ id: string }>;
  const pfeProvider = providers.find((p) => p.id === "tunisian_pfe_live");
  assert.ok(pfeProvider, "DiscoveryEngine must register tunisian_pfe_live provider");
});
