import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateOpportunityMatchScore,
} from "../opportunity-matcher.ts";
import {
  detectOpportunitySeniority,
  detectCandidateSeniority,
  validateAndNormalizeSeniorityClaims,
  detectStaleDraftClaims,
} from "../seniority-detector.ts";
import {
  generateDeterministicDraft,
  type CandidateData,
  type OpportunityData,
} from "../email-generator.ts";
import { buildDraftPayload } from "../draft-utils.ts";

// Shared fixture: Mahdi Chaari — 3rd-year student at ESPRIT School of Business
const studentCandidate: CandidateData = {
  first_name: "Mahdi",
  last_name: "Chaari",
  email: "mahdi.chaari@esprit.tn",
  school: "Esprit School of Business",
  degree: "Licence en Informatique de Gestion (Business Information Systems)",
  specialty: "Business Information Systems",
  city: "Ariana",
  country: "Tunisie",
  skills: ["React", "Next.js", "TypeScript", "Node.js", "PostgreSQL", "Tailwind CSS", "Git", "Docker"],
  projects: [
    {
      title: "Ecom Doctor",
      technologies: ["Next.js", "React", "TypeScript", "PostgreSQL", "Tailwind CSS"],
      description: "Plateforme SaaS e-commerce intelligente avec Next.js et PostgreSQL",
    },
    {
      title: "MN Cosmetics",
      technologies: ["Docker", "GitHub Actions", "CI/CD"],
      description: "Pipeline CI/CD et conteneurisation Docker",
    },
  ],
  rawCvText: `
MAHDI CHAARI
Étudiant en 3ème année Licence en Informatique de Gestion (Business Information Systems)
Esprit School of Business | Ariana, Tunisie
À la recherche d'un stage PFE (Projet de Fin d'Études) débutant en Février 2027

COMPÉTENCES TECHNIQUES
React, Next.js, TypeScript, Node.js, PostgreSQL, Tailwind CSS, Git, Docker

PROJETS
- Ecom Doctor : SaaS e-commerce sous Next.js, TypeScript, PostgreSQL
- MN Cosmetics : Déploiement automatisé avec Docker et GitHub Actions
  `,
};

// Canonical Manager vacancy fixture
const canonicalManagerOpp: OpportunityData = {
  title: "Engineering Manager - Web",
  companyName: "Canonical",
  location: "Home Based - EMEA",
  type: "MANAGER",
  description: `
As an Engineering Manager for Web at Canonical, you will lead a distributed team of software engineers.
Responsibilities:
- Manage, mentor, and grow a high-performing engineering team
- Drive delivery of web projects across Ubuntu and Canonical websites
- Collaborate with product managers on technical roadmaps and resource allocation
Requirements:
- 5+ years of software engineering experience with proven track record of managing teams
- Strong leadership, people management, and technical communication skills
- Experience with modern web technologies (JavaScript, Python, React, Go)
  `,
};

// Junior / Frontend vacancy fixture
const juniorWebOpp: OpportunityData = {
  title: "Développeur Web Junior / Frontend",
  companyName: "WebTech Solutions",
  location: "Tunis, Tunisie",
  type: "JUNIOR",
  description: `
Nous recherchons un Développeur Web Junior passionné par React, Next.js et TypeScript.
Missions :
- Intégrer des interfaces web dynamiques et responsives avec Next.js et Tailwind CSS
- Participer au développement d'applications SaaS modernes
- Collaborer avec l'équipe au sein d'un environnement Git / CI-CD
Profil :
- Diplômé ou étudiant en fin de cycle (Licence / Master / Ingénieur)
- Maîtrise de React, TypeScript, HTML/CSS
  `,
};

test("Seniority Detection: correctly identifies role hierarchy and student status", () => {
  const roleSeniority = detectOpportunitySeniority(canonicalManagerOpp);
  assert.equal(roleSeniority.level, "manager");
  assert.equal(roleSeniority.isManagement, true);
  assert.ok(roleSeniority.minYearsExpected >= 5);

  const candidateSeniority = detectCandidateSeniority(studentCandidate);
  assert.equal(candidateSeniority.level, "student");
  assert.equal(candidateSeniority.isStudent, true);
  assert.equal(candidateSeniority.hasManagementExperience, false);
});

test("Regression Test 1: 3rd-year student on Engineering Manager vacancy triggers seniority mismatch warning and capped score", () => {
  const match = calculateOpportunityMatchScore(studentCandidate, canonicalManagerOpp);

  // Must detect student vs manager mismatch
  assert.equal(match.roleSeniority, "manager");
  assert.equal(match.candidateSeniority, "student");
  assert.equal(match.seniorityMismatch, true, "Must flag critical seniority mismatch");

  // Score must be capped <= 25% due to critical managerial experience absence
  assert.ok(
    match.score <= 25,
    `Score for student on Engineering Manager role should be capped <= 25%, but got ${match.score}%`
  );
  assert.equal(match.relevanceLevel, "low");

  // Warning must be explicit and non-empty
  assert.ok(match.seniorityWarning, "Must generate clear seniority warning");
  assert.ok(
    match.seniorityWarning?.includes("management technique") ||
    match.seniorityWarning?.includes("encadrement"),
    "Warning should specify managerial role level"
  );
  assert.ok(
    match.seniorityWarning?.includes("attestée") || match.seniorityWarning?.includes("attesté"),
    "Warning should state experience is unsupported by student CV"
  );
});

test("Regression Test 2: Junior / Frontend vacancy evaluated separately without inheriting manager restrictions", () => {
  const match = calculateOpportunityMatchScore(studentCandidate, juniorWebOpp);

  // Role detected as junior / entry
  assert.ok(
    match.roleSeniority === "junior" || match.roleSeniority === "pfe",
    `Expected junior or pfe, got ${match.roleSeniority}`
  );
  assert.equal(match.seniorityMismatch, false, "Must not flag mismatch for junior role");
  assert.equal(match.seniorityWarning, null, "Warning must be null for matched seniority");

  // Relevance score should be high given strong Next.js/React/TypeScript/Tailwind overlap
  assert.ok(
    match.score >= 70,
    `Junior role match score (${match.score}%) should be >= 70% for directly matching skills`
  );
  assert.ok(
    match.relevanceLevel === "high" || match.relevanceLevel === "good",
    `Relevance tier should be high or good, got ${match.relevanceLevel}`
  );

  // Must detect verified skills
  assert.ok(match.matchedSkills.includes("React"));
  assert.ok(match.matchedSkills.includes("Next.js"));
  assert.ok(match.matchedSkills.includes("TypeScript"));
});

test("Regression Test 3: Missing and unevidenced requirements separated into unsupported vs unknown", () => {
  const match = calculateOpportunityMatchScore(studentCandidate, canonicalManagerOpp);

  // Unsupported requirements must flag people management and years of experience
  assert.ok(
    match.unsupportedRequirements.length > 0,
    "Must extract unsupported requirements"
  );
  const unsupportedText = match.unsupportedRequirements.join(" ").toLowerCase();
  assert.ok(
    unsupportedText.includes("management") ||
    unsupportedText.includes("gestion d'équipe") ||
    unsupportedText.includes("expérience"),
    "Must explicitly flag management or years of experience as unsupported"
  );

  // Unknown requirements should capture domain/roadmap/budget expectations
  assert.ok(
    Array.isArray(match.unknownRequirements),
    "unknownRequirements must be an array"
  );

  // Matched skills should reflect only genuine technical keywords (e.g. React)
  assert.ok(
    match.matchedSkills.every((s) => studentCandidate.skills?.includes(s)),
    "Every matched skill must strictly belong to candidate's verified skills"
  );
});

test("Regression Test 4: validateAndNormalizeSeniorityClaims sanitizes hallucinated management and relocation claims", () => {
  // Hallucinated AI draft claiming management and overseas relocation
  const hallucinatedDraft = `
Bonjour,

Ayant managé une équipe de 6 développeurs seniors chez Ubuntu, je vous soumets ma candidature pour le poste d'Engineering Manager - Web.
Fort de mes 5 ans d'expérience dans la conduite de projets web complexes et le recrutement technique, je saurai piloter vos équipes.
Actuellement basé à Paris et disponible immédiatement pour une relocalisation au Royaume-Uni, je serais ravi d'échanger.

Cordialement,
Mahdi Chaari
  `;

  const sanitized = validateAndNormalizeSeniorityClaims(
    hallucinatedDraft,
    studentCandidate,
    canonicalManagerOpp
  );

  // Must remove false management claim
  assert.ok(
    !sanitized.includes("Ayant managé une équipe"),
    "Must remove false 'Ayant managé une équipe' claim"
  );
  assert.ok(
    !sanitized.includes("5 ans d'expérience"),
    "Must remove false '5 ans d'expérience' claim"
  );
  assert.ok(
    !sanitized.includes("basé à Paris"),
    "Must remove false foreign residency claim"
  );
  assert.ok(
    !sanitized.includes("relocalisation au Royaume-Uni"),
    "Must remove false relocation availability claim"
  );
});

test("Regression Test 5: Deterministic draft for student on manager vacancy adopts humble contributor framing", () => {
  const draft = generateDeterministicDraft(studentCandidate, canonicalManagerOpp);

  // Subject line must NOT claim seasoned manager status
  assert.ok(
    draft.subject.includes("Candidature : Engineering Manager - Web"),
    `Subject line should be humble, got: ${draft.subject}`
  );
  assert.ok(
    !draft.subject.includes("Candidature au poste de"),
    "Subject should avoid claiming direct entitlement to managerial post"
  );

  // Body must state humble contributor motivation without inventing management history
  assert.ok(
    draft.body.includes("Conscient du niveau d'exigence et des responsabilités attachés à cette opportunité"),
    "Must include honest awareness of seniority gap"
  );
  assert.ok(
    draft.body.includes("avec humilité"),
    "Must frame contribution with humility"
  );
  assert.ok(
    !draft.body.includes("expérience managériale"),
    "Draft must never claim management experience"
  );
  assert.ok(
    !draft.body.includes("ayant dirigé"),
    "Draft must never claim having directed teams"
  );
});

test("Regression Test 6: Recruiter email safeguards strictly prevent placeholder email fabrication", () => {
  // When no verified recruiter email exists (e.g. ATS web source)
  const draftPayload = buildDraftPayload({
    applicationId: "app-canonical-123",
    opportunityTitle: canonicalManagerOpp.title,
    userEmail: "mahdi.chaari@esprit.tn",
    contactEmail: null, // No verified email available
    subject: "Candidature : Engineering Manager - Web",
    body: "Email body content",
  });

  // Must be empty string, never a synthetic placeholder
  assert.equal(
    draftPayload.recipient_email,
    "",
    "Recipient email must be empty string when no verified contact is provided"
  );
  assert.notEqual(
    draftPayload.recipient_email,
    "recruiter@example.com",
    "Must never fabricate recruiter@example.com"
  );
  assert.notEqual(
    draftPayload.recipient_email,
    "recruiter@canonical.com",
    "Must never guess email from company domain"
  );
});

test("Regression Test 7: Opening an existing draft created before seniority fix detects stale claims and validates recalculation", () => {
  // Stored legacy draft from draft row a37ea1f6-b3c1-4904-9e3d-4405fed44a17 (created 2026-10-19T07:39:26)
  const legacyStoredDraftBody = `Madame, Monsieur,

Je vous adresse ma candidature pour le poste de Engineering Manager - Web au sein de Canonical. Actuellement en troisième année de Licence en Informatique de Gestion (Business Information Systems) à Esprit School of Business, je développe une solide expertise en développement web, en conception de logiciels et en gestion de projets techniques.

Au cours de mon parcours académique et de mes projets personnels, j'ai eu l'opportunité de concevoir des applications web robustes intégrant des bases de données, des API et des outils modernes. Mes compétences techniques couvrent des langages et frameworks tels que JavaScript, TypeScript, PHP, Laravel, Next.js, ainsi que la containerisation et l'automatisation avec Docker, Git et CI/CD. J'ai également exploré l'intégration de fonctionnalités d'intelligence artificielle, ce qui me permet d'aborder les défis techniques avec une vision globale et orientée vers l'innovation.

Particulièrement attiré par l'écosystème open-source et les technologies de pointe portées par Canonical, je serais ravi de mettre ma rigueur, mes compétences techniques et ma capacité à piloter des solutions informatiques au service de vos équipes et de vos projets.

Vous trouverez ci-joint mon CV qui détaille l'ensemble de mes compétences et réalisations. Je me tiens à votre entière disposition pour un entretien afin de discuter de ma motivation et de ma contribution potentielle à vos initiatives.

Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

Mahdi Chaari`;

  // 1. Stale draft claims detection on pre-fix draft
  const staleCheck = detectStaleDraftClaims(legacyStoredDraftBody, studentCandidate, canonicalManagerOpp);
  assert.equal(staleCheck.hasStaleClaims, true, "Must flag that pre-fix draft contains unverified claims");
  assert.ok(
    staleCheck.unsupportedClaimsFound.some((c) => c.includes("solide expertise")),
    "Must detect unverified 'solide expertise' claim"
  );
  assert.ok(
    staleCheck.unsupportedClaimsFound.some((c) => c.includes("gestion de projets techniques") || c.includes("pilotage")),
    "Must detect unverified 'gestion de projets techniques' claim"
  );
  assert.ok(
    staleCheck.unsupportedClaimsFound.some((c) => c.includes("Engineering Manager")),
    "Must detect direct entitlement without student humility"
  );

  // 2. Opportunity match score recalculation on opening
  const recalculatedMatch = calculateOpportunityMatchScore(studentCandidate, canonicalManagerOpp);
  assert.equal(recalculatedMatch.roleSeniority, "manager");
  assert.equal(recalculatedMatch.candidateSeniority, "student");
  assert.equal(recalculatedMatch.seniorityMismatch, true);
  assert.ok(recalculatedMatch.score <= 25, "Score must be capped at 25%");
  assert.equal(recalculatedMatch.relevanceLevel, "low");
  assert.ok(
    recalculatedMatch.unsupportedRequirements.some((req) => req.toLowerCase().includes("manag")),
    "Must list managerial role as unsupported by candidate facts"
  );

  // 3. Sanitizing and normalizing the legacy draft body
  const sanitized = validateAndNormalizeSeniorityClaims(legacyStoredDraftBody, studentCandidate, canonicalManagerOpp);

  // Must no longer contain unverified claims
  assert.ok(
    !sanitized.includes("solide expertise"),
    "Sanitized text must not contain 'solide expertise'"
  );
  assert.ok(
    !sanitized.includes("gestion de projets techniques"),
    "Sanitized text must not contain 'gestion de projets techniques'"
  );
  assert.ok(
    !sanitized.includes("ma capacité à piloter des solutions informatiques"),
    "Sanitized text must not contain unverified project leadership claim"
  );

  // Must contain humble, honest, factual student phrasing
  assert.ok(
    sanitized.includes("de solides compétences pratiques"),
    "Sanitized text must frame skills as practical skills"
  );
  assert.ok(
    sanitized.includes("en développement de solutions logicielles"),
    "Sanitized text must refer to software development instead of PM"
  );
  assert.ok(
    sanitized.includes("mon investissement dans le développement de solutions logicielles fiables"),
    "Sanitized text must refer to software solution contribution"
  );
  assert.ok(
    sanitized.includes("pour l'opportunité Engineering Manager - Web"),
    "Sanitized text must frame application for the opportunity rather than claiming the post directly"
  );

  // 4. Stale check on sanitized draft must now pass with zero issues
  const sanitizedCheck = detectStaleDraftClaims(sanitized, studentCandidate, canonicalManagerOpp);
  assert.equal(sanitizedCheck.hasStaleClaims, false, "Sanitized draft must have zero stale claims");
  assert.equal(sanitizedCheck.unsupportedClaimsFound.length, 0);
});

