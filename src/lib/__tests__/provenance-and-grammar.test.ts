import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeFrenchGrammar,
  resolveExactProgramName,
  validateAndNormalizeDegreeClaims,
  validateAndNormalizeDegreeSubject,
  generateDeterministicDraft,
} from "../email-generator.ts";
import { searchDegrees } from "../education/degrees.ts";
import { extractDegree, extractSpecialty } from "../cv-parser.ts";
import { recordDraftProvenance, getDraftProvenance } from "../draft-provenance.ts";

test("Grammar: sanitizeFrenchGrammar corrects 'ravis' to 'ravi' for candidate", () => {
  const input1 = "Je serais ravis d'échanger avec vous sur cette opportunité.";
  const result1 = sanitizeFrenchGrammar(input1);
  assert.equal(result1, "Je serais ravi d'échanger avec vous sur cette opportunité.");

  const input2 = "je serais ravis de rejoindre l'équipe";
  const result2 = sanitizeFrenchGrammar(input2);
  assert.equal(result2, "je serais ravi de rejoindre l'équipe");

  const input3 = "Je serai ravis de présenter mes projets.";
  const result3 = sanitizeFrenchGrammar(input3);
  assert.equal(result3, "Je serai ravi de présenter mes projets.");
});

test("Grammar: sanitizeFrenchGrammar fixes school preposition 'à l'Esprit'", () => {
  const input = "Actuellement étudiant à l'Esprit School of Business, je recherche un stage.";
  const result = sanitizeFrenchGrammar(input);
  assert.equal(result, "Actuellement étudiant à Esprit School of Business, je recherche un stage.");
});

test("Degrees: searchDegrees finds Licence en Informatique de Gestion (Business Information Systems)", () => {
  const matchGestion = searchDegrees("Informatique de Gestion");
  assert.ok(matchGestion.length > 0, "Should match 'Informatique de Gestion'");
  assert.equal(matchGestion[0].id, "licence-informatique-gestion");
  assert.equal(matchGestion[0].name, "Licence en Informatique de Gestion (Business Information Systems)");

  const matchBIS = searchDegrees("Business Information Systems");
  assert.ok(matchBIS.length > 0, "Should match 'Business Information Systems'");
  assert.equal(matchBIS[0].id, "licence-informatique-gestion");

  const matchAcronym = searchDegrees("BIS");
  assert.ok(matchAcronym.length > 0, "Should match acronym 'BIS'");
  assert.equal(matchAcronym[0].id, "licence-informatique-gestion");
});

test("Parser: does not confuse French article 'la' with Licence Appliquée (LA)", () => {
  const sampleCvText = `
Mahdi Chaari
FORMATION
2022 - 2025: Licence en Informatique de Gestion (Business Information Systems) à Esprit School of Business
Passionné par la conception et la réalisation de plateformes web.
`;
  const extractedDegree = extractDegree(sampleCvText);
  assert.ok(extractedDegree, "Should extract a degree");
  assert.notEqual(extractedDegree, "Licence Appliquée (LA)", "French article 'la' must NOT trigger Licence Appliquée");
  assert.equal(extractedDegree, "Licence en Informatique de Gestion (Business Information Systems)");

  const specialty = extractSpecialty(sampleCvText);
  assert.equal(specialty, "Business Information Systems");
});

test("Email Generator: resolveExactProgramName correctly extracts degree split across PDF lines", () => {
  const candidate = {
    school: "Esprit School of Business",
    rawCvText: `
FORMATION
2022 - 2025: Licence en Informatique de Gestion (Business Information
Systems) à Esprit School of Business
Mention Bien
`,
  };

  const resolved = resolveExactProgramName(candidate);
  assert.equal(resolved, "Licence en Informatique de Gestion (Business Information Systems)");
});

test("Draft Provenance: records and retrieves Gemini vs mock generation correctly", () => {
  const testAppId = "test-app-" + Date.now();
  const testDraftId = "test-draft-" + Date.now();

  // 1. Initial state: unrecorded
  const initial = getDraftProvenance(testAppId, testDraftId);
  assert.equal(initial, null, "Should return null for unknown draft");

  // 2. Record Gemini generation
  const geminiRecord = recordDraftProvenance(testAppId, {
    draftId: testDraftId,
    provider: "gemini",
    model: "gemini-3.5-flash-lite",
    isAiGenerated: true,
  });

  assert.equal(geminiRecord.applicationId, testAppId);
  assert.equal(geminiRecord.draftId, testDraftId);
  assert.equal(geminiRecord.provider, "gemini");
  assert.equal(geminiRecord.isAiGenerated, true);

  const retrieved = getDraftProvenance(testAppId, testDraftId);
  assert.ok(retrieved !== null);
  assert.equal(retrieved?.provider, "gemini");
  assert.equal(retrieved?.model, "gemini-3.5-flash-lite");

  // 3. Record fallback mock generation
  const testAppFallback = "test-app-fallback-" + Date.now();
  recordDraftProvenance(testAppFallback, {
    provider: "mock",
    isAiGenerated: false,
    fallbackReason: "Simulated quota error",
  });

  const retrievedFallback = getDraftProvenance(testAppFallback);
  assert.ok(retrievedFallback !== null);
  assert.equal(retrievedFallback?.provider, "mock");
  assert.equal(retrievedFallback?.isAiGenerated, false);
  assert.equal(retrievedFallback?.fallbackReason, "Simulated quota error");
});

test("Degree Accuracy: candidate with verified Licence en Informatique de Gestion is never rewritten as Licence Appliquée", () => {
  const candidate = {
    first_name: "Mahdi",
    last_name: "Chaari",
    school: "Esprit School of Business",
    degree: "Licence Appliquée (LA)", // stale/misleading profile value
    specialty: "Business Information Systems",
    rawCvText: `
FORMATION
2022 - 2025: Licence en Informatique de Gestion (Business Information Systems) à Esprit School of Business
COMPÉTENCES
PHP, Laravel, Next.js, PostgreSQL
`,
  };

  const resolved = resolveExactProgramName(candidate);
  assert.equal(
    resolved,
    "Licence en Informatique de Gestion (Business Information Systems)",
    "CV must be source of truth; unconfirmed 'Licence Appliquée' must be rejected"
  );

  const opportunity = {
    title: "Stage PFE - Développeur Fullstack",
    companyName: "TechCorp",
    type: "PFE",
  };

  const draft = generateDeterministicDraft(candidate, opportunity);
  assert.equal(draft.body.includes("Licence Appliquée"), false, "Must not contain Licence Appliquée");
  assert.ok(
    draft.body.includes("Licence en Informatique de Gestion (Business Information Systems)"),
    "Draft body must include exact verified degree title"
  );
});

test("Post-Validation: validateAndNormalizeDegreeClaims catches and fixes unsupported Licence Appliquée substitution", () => {
  const candidate = {
    first_name: "Mahdi",
    last_name: "Chaari",
    school: "Esprit School of Business",
    rawCvText: `
FORMATION
2022 - 2025: Licence en Informatique de Gestion (Business Information Systems) à Esprit School of Business
`,
  };

  // Simulate an LLM hallucination where it rewrote the degree into Licence Appliquée
  const simulatedLlmBody = `
Bonjour,

Actuellement étudiant en Licence Appliquée en Business Information Systems à Esprit School of Business, je vous adresse ma candidature pour le stage PFE.

Cordialement,
Mahdi Chaari
`;

  const validated = validateAndNormalizeDegreeClaims(simulatedLlmBody, candidate);
  assert.equal(validated.includes("Licence Appliquée"), false, "Validator must eliminate unsupported 'Licence Appliquée'");
  assert.ok(
    validated.includes("Licence en Informatique de Gestion (Business Information Systems)"),
    "Validator must replace with candidate's exact verified degree"
  );
});

test("Neutral Fallback: when exact degree level cannot be confidently extracted, uses neutral phrase without inventing degree title", () => {
  const candidateWithoutDegreeLevel = {
    first_name: "Amine",
    last_name: "Gharbi",
    school: "Esprit School of Business",
    rawCvText: `
FORMATION
2022 - 2025: Informatique de Gestion à Esprit School of Business
COMPÉTENCES
React, TypeScript, Node.js
`,
  };

  const resolved = resolveExactProgramName(candidateWithoutDegreeLevel);
  assert.equal(
    resolved,
    "ma formation en Informatique de Gestion",
    "Must return neutral phrase when no degree level is verified in CV"
  );

  const opportunity = {
    title: "Stage d'été Développeur Web",
    companyName: "WebAgency",
    type: "Internship",
  };

  const draft = generateDeterministicDraft(candidateWithoutDegreeLevel, opportunity);
  assert.equal(draft.body.includes("Licence Appliquée"), false, "Must not invent Licence Appliquée");
  assert.equal(draft.body.includes("Licence en"), false, "Must not invent Licence");
  assert.equal(draft.body.includes("diplôme d'ingénieur"), false, "Must not invent Ingénieur");
  assert.ok(
    draft.body.includes("ma formation en Informatique de Gestion"),
    "Must use honest neutral phrase in intro"
  );

  // Test post-generation validation on neutral fallback
  const simulatedLlmBodyWithInventedDegree = `
Bonjour,

Actuellement étudiant en Licence Appliquée en Informatique de Gestion à Esprit School of Business, je vous soumets ma candidature.

Cordialement,
Amine Gharbi
`;

  const validated = validateAndNormalizeDegreeClaims(simulatedLlmBodyWithInventedDegree, candidateWithoutDegreeLevel);
  assert.equal(validated.includes("Licence Appliquée"), false, "Must eliminate invented Licence Appliquée");
  assert.ok(
    validated.includes("ma formation en Informatique de Gestion"),
    "Must substitute neutral phrase when degree title is unverified"
  );
});

test("Misleading Substitutions: validator prevents unsupported engineering or master claims", () => {
  const candidate = {
    first_name: "Sami",
    last_name: "Ben Salah",
    rawCvText: `
FORMATION
2022 - 2025: Licence en Informatique de Gestion (Business Information Systems) à Esprit School of Business
`,
  };

  const simulatedLlmEngineering = `Actuellement étudiant ingénieur en Business Information Systems, je postule.`;
  const validatedEng = validateAndNormalizeDegreeClaims(simulatedLlmEngineering, candidate);
  assert.equal(validatedEng.includes("ingénieur"), false, "Must not claim ingénieur when CV has Licence");
  assert.ok(validatedEng.includes("Licence en Informatique de Gestion"));

  const simulatedLlmMaster = `Préparant un Master en Business Information Systems, je postule.`;
  const validatedMaster = validateAndNormalizeDegreeClaims(simulatedLlmMaster, candidate);
  assert.equal(validatedMaster.includes("Master"), false, "Must not claim Master when CV has Licence");
});

test("Confirmed Degree: preserves Licence Appliquée ONLY when explicitly confirmed by uploaded CV", () => {
  const candidateWithExplicitLA = {
    first_name: "Nour",
    last_name: "Ayadi",
    school: "ISET",
    rawCvText: `
FORMATION
2021 - 2024: Licence Appliquée en Systèmes Embarqués à l'ISET
`,
  };

  const resolved = resolveExactProgramName(candidateWithExplicitLA);
  assert.equal(resolved, "Licence Appliquée en Systèmes Embarqués");

  const validated = validateAndNormalizeDegreeClaims(
    "Actuellement étudiant en Licence Appliquée en Systèmes Embarqués à l'ISET...",
    candidateWithExplicitLA
  );
  assert.ok(validated.includes("Licence Appliquée en Systèmes Embarqués"), "Must preserve when explicitly confirmed by CV");
});

test("Subject Line Validation: validateAndNormalizeDegreeSubject corrects unsupported Licence Appliquée in email subjects", () => {
  const candidate = {
    first_name: "Mahdi",
    last_name: "Chaari",
    school: "Esprit School of Business",
    rawCvText: `
FORMATION
2022 - 2025: Licence en Informatique de Gestion (Business Information Systems) à Esprit School of Business
`,
  };

  const subjectWithLA = "Candidature Stage PFE — Licence Appliquée en Business Information Systems — Mahdi Chaari";
  const normalizedSubject = validateAndNormalizeDegreeSubject(subjectWithLA, candidate);
  assert.equal(normalizedSubject.includes("Licence Appliquée"), false, "Subject must not contain unsupported Licence Appliquée");
  assert.ok(
    normalizedSubject.includes("Licence en Informatique de Gestion (Business Information Systems)"),
    "Subject must use candidate's exact verified degree"
  );
});


