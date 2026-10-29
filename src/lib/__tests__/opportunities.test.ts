import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateOpportunityMatchScore,
} from "../opportunity-matcher.ts";
import {
  TUNISIAN_OPPORTUNITIES_CATALOG,
  validateOpportunityPayload,
} from "../data/opportunities-catalog.ts";
import { isAuthorizedOpportunityManager } from "../auth/admin-auth.ts";
import type { CandidateData } from "../email-generator.ts";

test("Relevance Score: accurately scores candidate with matching verified CV skills & projects", () => {
  const candidate: CandidateData = {
    first_name: "Mahdi",
    last_name: "Chaari",
    school: "Esprit School of Business",
    degree: "Licence en Informatique de Gestion (Business Information Systems)",
    specialty: "Business Information Systems",
    skills: ["React", "Next.js", "TypeScript", "Node.js", "PostgreSQL", "Tailwind CSS", "Git"],
    projects: [
      {
        title: "Ecom Doctor",
        description: "Plateforme SaaS e-commerce intelligente avec Next.js et PostgreSQL",
        technologies: ["Next.js", "React", "TypeScript", "PostgreSQL", "Tailwind CSS"],
      },
    ],
    rawCvText: `
COMPÉTENCES TECHNIQUES
React, Next.js, TypeScript, Node.js, PostgreSQL, Tailwind CSS, Git
PROJETS RÉALISÉS
Ecom Doctor : Plateforme SaaS construite avec Next.js, TypeScript et PostgreSQL
FORMATION
2022 - 2025: Licence en Informatique de Gestion (Business Information Systems) à Esprit School of Business
`,
  };

  const oppNextJs = {
    title: "PFE : Développeur Fullstack Next.js / TypeScript",
    companyName: "Sofrecom Tunisie",
    description: "Recherche stagiaire PFE pour développer une application SaaS modulaire en Next.js, React, TypeScript et PostgreSQL.",
    location: "Ariana, Tunisie",
    type: "PFE",
  };

  const breakdown = calculateOpportunityMatchScore(candidate, oppNextJs);

  assert.equal(breakdown.hasCandidateCv, true, "Must recognize candidate CV");
  assert.ok(breakdown.score >= 70, `Score (${breakdown.score}) should reflect high relevance for strong technical overlap`);
  assert.equal(breakdown.relevanceLevel, "high", "Tier should be high relevance");

  // Check matched skills
  const matchedLower = breakdown.matchedSkills.map((s) => s.toLowerCase());
  assert.ok(matchedLower.includes("next.js"), "Must include Next.js in matched skills");
  assert.ok(matchedLower.includes("react"), "Must include React in matched skills");
  assert.ok(matchedLower.includes("typescript"), "Must include TypeScript in matched skills");
  assert.ok(matchedLower.includes("postgresql"), "Must include PostgreSQL in matched skills");

  // Check matched projects
  assert.ok(
    breakdown.matchedProjects.some((p) => p.includes("Ecom Doctor")),
    "Must detect Ecom Doctor as matching project"
  );

  // Check explanation disclaims hiring probability
  assert.ok(
    breakdown.explanation.includes("ne constitue pas une probabilité d'embauche"),
    "Explanation must explicitly disclaim hiring probability"
  );
});

test("Relevance Score: candidate without CV gets score of 0 and clear guidance prompt", () => {
  const candidateWithoutCv: CandidateData = {
    first_name: "Amine",
    last_name: "Gharbi",
  };

  const opp = {
    title: "Stage d'été : Développeur Web",
    companyName: "WebCorp",
    description: "Recherche stagiaire pour du dev React et Node.js",
  };

  const breakdown = calculateOpportunityMatchScore(candidateWithoutCv, opp);

  assert.equal(breakdown.hasCandidateCv, false, "Must flag missing CV");
  assert.equal(breakdown.score, 0, "Score must be 0 without verified CV");
  assert.equal(breakdown.relevanceLevel, "uncalculated");
  assert.ok(
    breakdown.explanation.toLowerCase().includes("uploadez"),
    "Must guide user to upload CV"
  );
});

test("Relevance Score: NEVER awards points for skills absent from candidate's verified CV", () => {
  const candidateWithOnlyFrontend: CandidateData = {
    first_name: "Sami",
    last_name: "Ben Salah",
    skills: ["HTML", "CSS", "JavaScript"],
    rawCvText: `
COMPÉTENCES : HTML, CSS, JavaScript
PROJETS : Site vitrine statique
FORMATION : Licence en Informatique
`,
  };

  const oppDevOps = {
    title: "PFE Cloud & DevOps",
    companyName: "CloudTech",
    description: "Architecture microservices avec Kubernetes, Docker, Terraform et AWS",
  };

  const breakdown = calculateOpportunityMatchScore(candidateWithOnlyFrontend, oppDevOps);

  assert.equal(breakdown.matchedSkills.includes("Kubernetes"), false, "Must not match unverified Kubernetes");
  assert.equal(breakdown.matchedSkills.includes("Docker"), false, "Must not match unverified Docker");
  assert.equal(breakdown.matchedSkills.includes("Terraform"), false, "Must not match unverified Terraform");
  assert.ok(breakdown.score < 50, "Score should remain low when candidate lacks required DevOps skills");
});

test("Payload Validation: validateOpportunityPayload validates and normalizes correct entries", () => {
  const validEntry = {
    title: "PFE : Ingénieur Intelligence Artificielle",
    companyName: "InstaDeep Tunisia",
    companySector: "Intelligence Artificielle",
    companyWebsite: "https://www.instadeep.com",
    location: "Tunis, Tunisie",
    type: "PFE",
    domain: "Artificial Intelligence",
    description: "Conception d'agents conversationnels et modèles RAG en Python et PyTorch.",
    contactEmail: "recrutement@instadeep-demo.tn",
    sourceUrl: "https://instadeep.tn/pfe-2025",
    isDemo: true,
  };

  const validation = validateOpportunityPayload(validEntry);
  assert.equal(validation.valid, true, "Valid record must pass validation");
  assert.ok(validation.data, "Must return validated data");
  assert.equal(validation.data?.type, "PFE");
  assert.equal(validation.data?.listingKind, "illustrative_demo");
});

test("Payload Validation: validateOpportunityPayload rejects malformed or incomplete entries", () => {
  // Missing title
  const invalid1 = {
    companyName: "TechCorp",
    type: "PFE",
    location: "Tunis",
    description: "Short description.",
    contactEmail: "valid@email.com",
  };
  const res1 = validateOpportunityPayload(invalid1);
  assert.equal(res1.valid, false, "Must reject missing title");

  // Invalid email format
  const invalid2 = {
    title: "Valid Title Longer than 5 chars",
    companyName: "TechCorp",
    type: "STAGE",
    location: "Tunis",
    description: "Valid description with sufficient length for testing purposes.",
    contactEmail: "invalid-email-no-at",
  };
  const res2 = validateOpportunityPayload(invalid2);
  assert.equal(res2.valid, false, "Must reject invalid email");
  assert.ok(res2.errors?.some((e) => e.includes("contact email")), "Error must mention email");

  // Invalid opportunity type
  const invalid3 = {
    title: "Valid Title Longer than 5 chars",
    companyName: "TechCorp",
    type: "EXECUTIVE_VP",
    location: "Tunis",
    description: "Valid description with sufficient length for testing purposes.",
    contactEmail: "valid@email.com",
  };
  const res3 = validateOpportunityPayload(invalid3);
  assert.equal(res3.valid, false, "Must reject unsupported type");
});

test("Opportunities Catalog: all 10 curated Tunisian entries are strictly valid and unique", () => {
  assert.equal(
    TUNISIAN_OPPORTUNITIES_CATALOG.length >= 8 && TUNISIAN_OPPORTUNITIES_CATALOG.length <= 12,
    true,
    "Catalog must contain between 8 and 12 entries"
  );

  const slugs = new Set<string>();
  const titles = new Set<string>();

  for (const item of TUNISIAN_OPPORTUNITIES_CATALOG) {
    const validation = validateOpportunityPayload(item);
    assert.equal(validation.valid, true, `Catalog item "${item.title}" must pass validation`);

    // Verify uniqueness
    assert.equal(slugs.has(item.slug), false, `Slug "${item.slug}" must be unique`);
    slugs.add(item.slug);

    assert.equal(titles.has(item.title), false, `Title "${item.title}" must be unique`);
    titles.add(item.title);

    // Verify honest labeling: all unverified simulation demo items must have isDemo: true
    if (item.title.includes("[DEMO]") || item.sourceUrl.includes("demo")) {
      assert.equal(item.isDemo, true, `Item "${item.title}" must be flagged isDemo = true`);
      assert.equal(item.listingKind, "illustrative_demo");
    }
  }
});

test("Authorization: isAuthorizedOpportunityManager denies regular candidate accounts", () => {
  // Null or missing user
  const check1 = isAuthorizedOpportunityManager(null);
  assert.equal(check1.authorized, false);

  // Candidate with regular email
  const candidateUser = { email: "candidate.student@esen.tn" };
  const check2 = isAuthorizedOpportunityManager(candidateUser);
  assert.equal(check2.authorized, false, "Regular candidate user must NOT have opportunity management access");
  assert.ok(check2.reason?.includes("Accès refusé"), "Reason must clearly state access denied");

  // Admin user
  const adminUser = { email: "admin@smartcv.dev" };
  const check3 = isAuthorizedOpportunityManager(adminUser);
  assert.equal(check3.authorized, true, "Designated admin user must be authorized");
});

test("Opportunities Catalog: all 10 entries are strictly illustrative demo listings and never presented as verified live vacancies", () => {
  for (const item of TUNISIAN_OPPORTUNITIES_CATALOG) {
    // 1. Must carry [DEMO] in the title
    assert.ok(
      item.title.startsWith("[DEMO]"),
      `Listing "${item.title}" must have [DEMO] prefix`
    );

    // 2. Must be flagged as illustrative demo
    assert.equal(
      item.isDemo,
      true,
      `Listing "${item.title}" must have isDemo = true`
    );
    assert.equal(
      item.listingKind,
      "illustrative_demo",
      `Listing "${item.title}" listingKind must be illustrative_demo`
    );

    // 3. Contact email must use demo domain to prevent accidental real email dispatch
    assert.ok(
      item.contactEmail.includes("-demo.tn") || item.contactEmail.includes(".mock") || item.contactEmail.includes("demo"),
      `Listing "${item.title}" contact email (${item.contactEmail}) must be a simulated demo address`
    );

    // 4. Must specify target educational domain relevant to Tunisian students
    assert.ok(
      ["Web Development", "Business Information Systems & BI", "Business Information Systems", "Frontend Engineering", "Backend Engineering", "Fullstack Development", "Artificial Intelligence", "Cloud & DevOps"].includes(item.domain),
      `Domain "${item.domain}" should be standard`
    );
  }
});

test("Catalog Seeding: importOpportunitiesBatch is strictly idempotent against mock database", async () => {
  const { importOpportunitiesBatch } = await import("../opportunities-manager.ts");

  const databaseState: {
    companies: Array<{ id: string; name: string }>;
    opportunities: Array<{ id: string; source_url: string; title: string; is_active: boolean }>;
  } = {
    companies: [{ id: "comp-1", name: "Sofrecom Tunisie" }],
    opportunities: [
      {
        id: "opp-existing-1",
        source_url: "https://demo.sofrecom.tn/pfe-2025/fullstack-nextjs",
        title: "Old Title",
        is_active: true,
      },
    ],
  };

  // Mock Supabase client simulating idempotency checks
  const mockSupabase = {
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, val: string) => ({
          maybeSingle: async () => {
            if (table === "opportunities") {
              const found = databaseState.opportunities.find((o) => o.source_url === val);
              return { data: found || null, error: null };
            }
            return { data: null, error: null };
          },
        }),
        ilike: (_col: string, val: string) => ({
          maybeSingle: async () => {
            if (table === "companies") {
              const found = databaseState.companies.find((c) => c.name.toLowerCase() === val.toLowerCase());
              return { data: found || null, error: null };
            }
            return { data: null, error: null };
          },
        }),
      }),
      insert: (payload: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            if (table === "companies") {
              const id = `comp-${databaseState.companies.length + 1}`;
              databaseState.companies.push({ id, name: String(payload.name) });
              return { data: { id }, error: null };
            }
            if (table === "opportunities") {
              const id = `opp-${databaseState.opportunities.length + 1}`;
              databaseState.opportunities.push({
                id,
                source_url: String(payload.source_url),
                title: String(payload.title),
                is_active: Boolean(payload.is_active),
              });
              return { data: { id }, error: null };
            }
            return { data: { id: "mock-id" }, error: null };
          },
        }),
      }),
      update: (payload: Record<string, unknown>) => ({
        eq: async (_col: string, val: string) => {
          const item = databaseState.opportunities.find((o) => o.id === val);
          if (item) {
            if (payload.title) item.title = String(payload.title);
            if (payload.is_active !== undefined) item.is_active = Boolean(payload.is_active);
          }
          return { error: null };
        },
      }),
    }),
  };

  // Run import on single item that already exists in DB
  const singleItemCatalog = [TUNISIAN_OPPORTUNITIES_CATALOG[0]];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await importOpportunitiesBatch(mockSupabase as any, singleItemCatalog);

  assert.equal(result.success, true);
  assert.equal(result.updated, 1, "Should update the existing record instead of inserting duplicate");
  assert.equal(result.imported, 0, "Should not insert duplicate row");
  assert.equal(databaseState.opportunities.length, 1, "Database row count must remain 1");
  assert.equal(
    databaseState.opportunities[0].title,
    TUNISIAN_OPPORTUNITIES_CATALOG[0].title,
    "Title must be updated to current catalog title"
  );
});

test("Privileged Seeding: getServiceRoleClient gracefully returns null when SUPABASE_SERVICE_ROLE_KEY is absent", async () => {
  const { getServiceRoleClient } = await import("../opportunities-manager.ts");
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = getServiceRoleClient();
    assert.equal(client, null, "Must return null when SUPABASE_SERVICE_ROLE_KEY is not defined");
  } finally {
    if (previousKey) {
      process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    }
  }
});

test("Security: regular candidate accounts are strictly denied catalog write access under any environment check", async () => {
  const candidateEmails = [
    "candidate.john@esprit.tn",
    "student@esen.tn",
    "user@gmail.com",
    "developer.junior@tunisia.dev",
    "random.user@smartcv.app",
  ];

  for (const email of candidateEmails) {
    const authResult = isAuthorizedOpportunityManager({ email });
    assert.equal(
      authResult.authorized,
      false,
      `Candidate email "${email}" must NEVER have administrative write authorization`
    );
    assert.ok(
      authResult.reason?.includes("Accès refusé"),
      "Must state that candidate accounts are denied opportunity management access"
    );
  }
});

test("SQL Seed Script Integrity: supabase/seed_tunisian_opportunities.sql matches curated catalog exactly and is idempotent", async () => {
  const fs = await import("fs");
  const path = await import("path");
  const seedSqlPath = path.resolve(process.cwd(), "supabase/seed_tunisian_opportunities.sql");
  assert.ok(fs.existsSync(seedSqlPath), "supabase/seed_tunisian_opportunities.sql must exist");

  const sqlContent = fs.readFileSync(seedSqlPath, "utf8");

  // 1. Must never execute destructive commands
  assert.equal(sqlContent.includes("drop table"), false, "Must not drop tables");
  assert.equal(sqlContent.includes("truncate"), false, "Must not truncate tables");
  assert.equal(sqlContent.includes("delete from"), false, "Must not delete rows");

  // 2. Must contain every curated catalog opportunity with idempotency guard
  for (const item of TUNISIAN_OPPORTUNITIES_CATALOG) {
    assert.ok(
      sqlContent.includes(item.sourceUrl),
      `SQL seed script must contain sourceUrl for "${item.title}"`
    );
    assert.ok(
      sqlContent.includes(item.companyName),
      `SQL seed script must contain company name "${item.companyName}"`
    );
  }

  // 3. Every opportunity insert must check if not exists
  const insertOppMatches = sqlContent.match(/insert into public\.opportunities/g);
  const ifNotExistsMatches = sqlContent.match(/if not exists\s*\(\s*select 1 from public\.opportunities/gi);
  assert.equal(
    insertOppMatches?.length,
    10,
    "SQL seed script must insert exactly 10 curated opportunities"
  );
  assert.equal(
    ifNotExistsMatches?.length,
    10,
    "Each of the 10 opportunity inserts must be protected by an if not exists check"
  );
});


