import test from "node:test";
import assert from "node:assert/strict";
import {
  extractCandidateAvailability,
  detectOpportunityTargetPeriod,
  detectAvailabilityConflict,
  validateAndNormalizeAvailabilityClaims,
  validateAndNormalizeSpontaneousClaims,
} from "../availability-detector.ts";
import {
  generateProfessionalEmailDraft,
  type CandidateData,
  type OpportunityData,
} from "../email-generator.ts";
import { calculateOpportunityMatchScore } from "../opportunity-matcher.ts";

test("CV Grounding: extracts candidate availability accurately from CV raw text", () => {
  const candidate: CandidateData = {
    first_name: "Mahdi",
    last_name: "Chaari",
    degree: "Licence en Informatique de Gestion (Business Information Systems)",
    rawCvText: `
PROFIL
Étudiant en 2ème année Licence Informatique de Gestion à Esprit School of Business.
Je recherche un Stage PFE à partir de février 2027 dans les domaines du Software Development ou des Systèmes d’Information.
COMPÉTENCES
React, TypeScript, Next.js, Node.js, SQL
`,
  };

  const detected = extractCandidateAvailability(candidate);
  assert.ok(detected?.statedText, "Must extract availability");
  assert.ok(
    detected.statedText.toLowerCase().includes("février 2027") ||
    detected.statedText.toLowerCase().includes("fevrier 2027"),
    `Extracted availability should contain 'février 2027', got: ${detected.statedText}`
  );
  assert.equal(detected.year, 2027, "Year must be 2027");
  assert.equal(detected.month, "février", "Month must be 'février'");
});

test("CV Grounding: detects opportunity target period from title and description", () => {
  const opp2026: OpportunityData = {
    title: "Stage PFE 2026: ERP Cloud & Transformation Digitale des Entreprises",
    companyName: "SMOFT",
    description: "Recherche stagiaires PFE pour la session 2026.",
  };

  const detected = detectOpportunityTargetPeriod(opp2026);
  assert.ok(detected, "Must detect opportunity target period");
  assert.equal(detected.targetYear, 2026, "Must identify target year 2026");
  assert.ok(
    detected.targetPeriod?.includes("2026"),
    `Must include 2026 in target period, got: ${detected.targetPeriod}`
  );
});

test("CV Grounding: detects calendar conflict when candidate availability is 2027 and vacancy targets 2026", () => {
  const candidate2027: CandidateData = {
    first_name: "Mahdi",
    last_name: "Chaari",
    degree: "Licence en Informatique de Gestion",
    rawCvText: "Je recherche un Stage PFE à partir de février 2027.",
  };

  const opp2026: OpportunityData = {
    title: "Stage PFE 2026 : Développeur Fullstack",
    companyName: "Medianet",
    description: "Stage PFE pour la session de printemps 2026.",
  };

  const conflict = detectAvailabilityConflict(candidate2027, opp2026);
  assert.equal(conflict.hasConflict, true, "Must flag calendar conflict");
  assert.ok(conflict.warningMessage?.includes("février 2027"), "Warning must cite candidate availability 2027");
  assert.ok(conflict.warningMessage?.includes("2026"), "Warning must cite opportunity target session 2026");
});

test("CV Grounding: validates and normalizes availability claims in draft body", () => {
  const candidate: CandidateData = {
    first_name: "Mahdi",
    last_name: "Chaari",
    degree: "Licence en Informatique de Gestion",
    rawCvText: "Actuellement en Licence, je recherche un stage PFE à partir de février 2027.",
  };

  const opp: OpportunityData = {
    title: "Stage PFE 2026",
    companyName: "Tech Corp",
  };

  const hallucinatoryDraft = `Madame, Monsieur,
Je suis actuellement disponible immédiatement pour débuter mon stage PFE 2026 au sein de votre entreprise.`;

  const normalized = validateAndNormalizeAvailabilityClaims(hallucinatoryDraft, candidate, opp);
  assert.ok(
    !normalized.includes("disponible immédiatement"),
    "Should strip 'disponible immédiatement' when CV specifies February 2027"
  );
  assert.ok(
    normalized.includes("février 2027"),
    "Must preserve the candidate's verified availability (février 2027)"
  );
});

test("CV Grounding: normalizes spontaneous portal leads without inventing vacancy numbers or internal titles", () => {
  const oppSpontaneous: OpportunityData = {
    title: "Piste PFE : SMOFT Entreprise Lead",
    companyName: "SMOFT",
    description: "Formulaire carrières général.",
  };

  const generatedDraft = `Madame, Monsieur,
Je vous écris pour postuler au poste de Piste PFE : SMOFT Entreprise Lead (référence #83921).`;

  const normalized = validateAndNormalizeSpontaneousClaims(generatedDraft, oppSpontaneous);
  assert.ok(
    !normalized.includes("Piste PFE"),
    "Should strip internal tool label 'Piste PFE' from employer outreach"
  );
  assert.ok(
    !normalized.includes("référence #"),
    "Should strip invented job reference numbers for spontaneous leads"
  );
  assert.ok(
    normalized.toLowerCase().includes("candidature spontanée") ||
    normalized.toLowerCase().includes("stage pfe"),
    "Must use professional spontaneous application wording"
  );
});

test("CV Grounding: replaces ungrounded 'je maîtrise' claims for collaborative Git/CI-CD practice", async () => {
  const candidate: CandidateData = {
    first_name: "Mahdi",
    last_name: "Chaari",
    school: "Esprit School of Business",
    degree: "Licence en Informatique de Gestion (Business Information Systems)",
    skills: ["React", "Next.js", "TypeScript", "Git"],
    projects: [
      {
        title: "Ecom Doctor",
        description: "Plateforme SaaS Next.js / TypeScript",
        technologies: ["Next.js", "React", "TypeScript", "Git"],
      },
    ],
    rawCvText: `
Formation: Licence en Informatique de Gestion
Compétences: React, Next.js, TypeScript, Git
Projet: Ecom Doctor en équipe avec Git
Disponibilité: recherche un Stage PFE à partir de février 2027.
`,
  };

  const opp: OpportunityData = {
    title: "Stage PFE Développement Web",
    companyName: "Sofrecom Tunisie",
    description: "Stage PFE Next.js et collaboration Git.",
  };

  const draft = await generateProfessionalEmailDraft(candidate, opp);
  assert.ok(
    !draft.body.includes("je maîtrise la collaboration"),
    "Draft must avoid 'je maîtrise' for collaborative student practice"
  );
  assert.ok(
    draft.body.includes("février 2027"),
    "Draft body must include candidate's verified availability (février 2027)"
  );
});

test("CV Grounding: Opportunity Match Score reflects availability conflict in breakdown", () => {
  const candidate: CandidateData = {
    first_name: "Mahdi",
    last_name: "Chaari",
    degree: "Licence en Informatique de Gestion (Business Information Systems)",
    skills: ["React", "TypeScript", "SQL"],
    rawCvText: "Disponibilité : Stage PFE à partir de février 2027.",
  };

  const opp: OpportunityData = {
    title: "Stage PFE 2026: ERP Cloud",
    companyName: "SMOFT",
    description: "Stage PFE 2026 orienté ERP et SQL.",
  };

  const breakdown = calculateOpportunityMatchScore(candidate, opp);
  assert.equal(breakdown.availabilityConflict, true, "Breakdown must flag availability conflict");
  assert.equal(breakdown.candidateAvailability, "à partir de février 2027");
  assert.ok(breakdown.opportunityTargetPeriod?.includes("2026"), "Target period must include 2026");
  assert.ok(
    breakdown.availabilityWarning?.includes("2027") &&
    breakdown.availabilityWarning?.includes("2026"),
    "Warning must detail both candidate year (2027) and target session (2026)"
  );
});
