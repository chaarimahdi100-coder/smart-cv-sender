import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  detectAvailabilityConflict,
  extractCandidateAvailability,
  detectOpportunityTargetPeriod,
  validateAndNormalizeAvailabilityClaims,
  validateAndNormalizeAvailabilitySubject,
  cleanOpportunityRoleTitle,
} from "../availability-detector.ts";
import {
  generateDeterministicDraft,
  type CandidateData,
  type OpportunityData,
} from "../email-generator.ts";
import { detectStaleDraftClaims } from "../seniority-detector.ts";

describe("Opportunity Lifecycle Intelligence & Candidate Availability Resolution", () => {
  const medianetOpp: OpportunityData = {
    title: "Stages PFE 2026 : E-business & Digital Solutions (Medianet PFE Book 2026)",
    companyName: "Medianet Group",
    description: "Recrutement des stagiaires PFE pour la session 2026. Technologies: TypeScript, Next.js, PostgreSQL.",
    type: "PFE",
    source_platform: "LinkedIn",
    source_url: "https://www.linkedin.com/posts/medianet_stages-pfe-2026-pfe-book-announcement",
    application_url: "https://rh.medianet.tn/stages-pfe-2026_11_50",
    date_posted: "2025-11-11T09:00:00.000Z",
    valid_through: null,
  };

  const feb2027Candidate: CandidateData = {
    first_name: "Mahdi",
    last_name: "Chaari",
    email: "chaarimahdi100@gmail.com",
    school: "Esprit School of Business",
    degree: "Licence en Informatique de Gestion (Business Information Systems)",
    specialty: "Business Information Systems",
    city: "Tunis",
    country: "Tunisie",
    skills: ["TypeScript", "Next.js", "PostgreSQL", "Docker"],
    rawCvText: `
      Mahdi Chaari
      Étudiant en Licence en Informatique de Gestion (Business Information Systems) à Esprit School of Business.
      Actuellement à la recherche d'un stage PFE à partir de février 2027.
      Compétences : TypeScript, Next.js, Node.js, PostgreSQL, Docker.
    `,
  };

  const feb2026Candidate: CandidateData = {
    first_name: "Amine",
    last_name: "Ben Salah",
    email: "amine@example.com",
    school: "Esprit",
    degree: "Diplôme d'Ingénieur en Informatique",
    skills: ["TypeScript", "Next.js"],
    rawCvText: `
      Amine Ben Salah
      Étudiant ingénieur disponible pour un stage PFE à partir de février 2026.
    `,
  };

  test("Scenario 1: Detects availability conflict accurately for Medianet (Candidate 2027 vs Opportunity 2026)", () => {
    const candAvail = extractCandidateAvailability(feb2027Candidate);
    assert.ok(candAvail, "Candidate availability should be extracted");
    assert.equal(candAvail.year, 2027);
    assert.equal(candAvail.statedText, "à partir de février 2027");

    const oppTarget = detectOpportunityTargetPeriod(medianetOpp);
    assert.ok(oppTarget, "Opportunity target period should be detected");
    assert.equal(oppTarget.targetYear, 2026);
    assert.equal(oppTarget.targetPeriod, "Session PFE 2026");

    const conflict = detectAvailabilityConflict(feb2027Candidate, medianetOpp);
    assert.equal(conflict.hasConflict, true, "Availability conflict must be detected when candidate 2027 > opportunity 2026");
    assert.ok(conflict.warningMessage?.includes("février 2027"));
    assert.ok(conflict.warningMessage?.includes("Session PFE 2026"));
  });

  test("Scenario 2: Unresolved initial draft does not silently claim 2026 eligibility without clarification", () => {
    const draft = generateDeterministicDraft(feb2027Candidate, medianetOpp, {
      conflictStrategy: "unresolved",
    });

    assert.equal(draft.conflictResolution, "unresolved");
    // Subject transparently signals availability and strips 2026 programme prefix
    assert.ok(
      draft.subject.includes("février 2027") || draft.subject.includes("Disponibilité"),
      `Subject should reflect availability check, got: "${draft.subject}"`
    );
    assert.ok(
      !draft.subject.includes("Stages PFE 2026 :"),
      `Subject should not contain obsolete 2026 prefix, got: "${draft.subject}"`
    );

    // Body states candidate availability and requests timing inquiry
    assert.ok(
      draft.body.includes("à partir de février 2027"),
      "Body must state verified candidate availability (février 2027)"
    );
    assert.ok(
      draft.body.includes("adapter les dates") || draft.body.includes("compatible"),
      "Body must seek timing alignment rather than claiming normal eligibility"
    );
    // Body must NOT claim direct integration into 2026 program
    assert.ok(
      !draft.body.includes("programme de Stages PFE 2026"),
      "Body must not claim to integrate programme de Stages PFE 2026"
    );
    assert.ok(draft.warnings && draft.warnings.length > 0, "Draft must include availability warning");
  });

  test("Scenario 3: Candidate confirms date compatibility (Option 1: compatible_confirmed)", () => {
    const draft = generateDeterministicDraft(feb2027Candidate, medianetOpp, {
      conflictStrategy: "compatible_confirmed",
    });

    assert.equal(draft.conflictResolution, "compatible_confirmed");
    // Keeps target role but includes availability notice
    assert.ok(
      draft.subject.includes("E-business & Digital Solutions") || draft.subject.includes("PFE"),
      `Subject should mention role, got: "${draft.subject}"`
    );
    assert.ok(
      draft.subject.includes("Disponibilité"),
      `Subject should mention availability, got: "${draft.subject}"`
    );
    // Body mentions candidate personally confirmed compatibility with real candidate availability
    assert.ok(
      draft.body.includes("à partir de février 2027"),
      "Body must retain candidate's genuine availability (février 2027)"
    );
    assert.ok(
      draft.body.includes("compatibilité de mon calendrier") || draft.body.includes("validé personnellement la compatibilité"),
      "Body must note that schedule compatibility was confirmed personally by the candidate"
    );
    // Does NOT claim Medianet confirmed eligibility
    assert.ok(
      !draft.body.includes("Medianet a confirmé") && !draft.body.includes("l'employeur a accepté"),
      "Body must not falsely claim employer pre-approval"
    );
    assert.ok(
      draft.notice?.includes("confirmation de compatibilité"),
      "Notice should inform candidate of compatible confirmed mode"
    );
  });

  test("Scenario 4: Candidate converts to spontaneous application without inventing 2027 programme (Option 2: spontaneous_converted)", () => {
    const draft = generateDeterministicDraft(feb2027Candidate, medianetOpp, {
      conflictStrategy: "spontaneous_converted",
    });

    assert.equal(draft.conflictResolution, "spontaneous_converted");
    // Subject is spontaneous and mentions actual availability, NOT an invented "Stage PFE 2027" programme
    assert.ok(
      draft.subject.includes("Candidature spontanée"),
      `Subject must be spontaneous, got: "${draft.subject}"`
    );
    assert.ok(
      draft.subject.includes("février 2027"),
      `Subject must mention candidate availability date, got: "${draft.subject}"`
    );
    // Must NOT contain 2026 references anywhere in subject
    assert.ok(!draft.subject.includes("2026"), "Subject must not contain 2026 references in converted mode");
    // Must NOT invent an unannounced 2027 programme name
    assert.ok(!draft.subject.includes("Stage PFE 2027"), "Subject must not invent 'Stage PFE 2027'");
    assert.ok(!draft.subject.includes("Session 2027"), "Subject must not invent 'Session 2027'");

    // Body is phrased as a genuine spontaneous application
    assert.ok(
      draft.body.includes("candidature spontanée"),
      "Body must be phrased as a spontaneous application"
    );
    assert.ok(
      draft.body.includes("à partir de février 2027"),
      "Body must state actual availability (à partir de février 2027)"
    );
    // Body must NOT reference 2026
    assert.ok(
      !draft.body.includes("Stages PFE 2026") && !draft.body.includes("session 2026") && !draft.body.includes("PFE Book 2026"),
      "Body must not reference the obsolete 2026 programme"
    );
    // Body must NOT invent future programme
    assert.ok(
      !draft.body.includes("session 2027") && !draft.body.includes("programme PFE 2027") && !draft.body.includes("session de stage PFE 2027"),
      "Body must not invent unannounced 2027 programme"
    );
  });

  test("Scenario 5: Availability normalization eliminates contradictory 2026 claims and invented 2027 programmes", () => {
    const rawContradictoryBody = `
      Bonjour,
      Je vous adresse ma candidature pour intégrer votre programme de Stages PFE 2026.
      Je suis disponible immédiatement pour la session 2026 et pour le Pitch Day 2026.
      Rejoindre Medianet dans le cadre de ma session de stage PFE 2027 représente une opportunité.
      Cordialement,
      Mahdi Chaari
    `;

    const normalized = validateAndNormalizeAvailabilityClaims(
      rawContradictoryBody,
      feb2027Candidate,
      medianetOpp,
      "spontaneous_converted"
    );

    assert.ok(!normalized.includes("Stages PFE 2026"), "Must replace Stages PFE 2026");
    assert.ok(!normalized.includes("session 2026"), "Must replace session 2026");
    assert.ok(!normalized.includes("Pitch Day 2026"), "Must strip Pitch Day 2026");
    assert.ok(!normalized.includes("disponible immédiatement"), "Must not claim immediate availability");
    assert.ok(!normalized.includes("session de stage PFE 2027"), "Must not invent session 2027");
    assert.ok(normalized.includes("février 2027"), "Must state candidate's real availability (février 2027)");
  });

  test("Scenario 6: Matching availability does not trigger conflict (Candidate 2026 vs Opportunity 2026)", () => {
    const conflict = detectAvailabilityConflict(feb2026Candidate, medianetOpp);
    assert.equal(conflict.hasConflict, false, "No conflict should be raised when candidate and opp both target 2026");

    const draft = generateDeterministicDraft(feb2026Candidate, medianetOpp);
    assert.equal(draft.conflictResolution, undefined, "No conflict resolution required");
    assert.ok(
      draft.subject.includes("Stages PFE 2026") || draft.subject.includes("stage PFE"),
      "Standard subject generated"
    );
  });

  test("Scenario 7: Closed opportunity (SPX Silverprod) remains non-approvable regardless of availability", () => {
    const spxOpp: OpportunityData = {
      title: "Stage PFE Développement Web & Mobile",
      companyName: "SPX / Silverprod",
      type: "PFE",
      date_posted: "2025-11-01T08:00:00.000Z",
      valid_through: "2025-12-15T00:00:00.000Z",
      source_platform: "Fabskill",
      source_url: "https://www.fabskill.com/job/spx-stage-pfe-web-mobile-closed",
    };

    const draft = generateDeterministicDraft(feb2026Candidate, spxOpp);
    assert.ok(draft.body, "Draft can be inspected");
    const isPast = new Date(spxOpp.valid_through!).getTime() < Date.now();
    assert.equal(isPast, true, "SPX deadline must be in the past");
  });

  test("Scenario 8: Role title cleaning produces natural names without 'Stages PFE 2026 :'", () => {
    const cleanRoleName = cleanOpportunityRoleTitle(medianetOpp.title);

    assert.equal(
      cleanRoleName,
      "E-business & Digital Solutions",
      "Should cleanly extract role name without session prefixes or company suffixes"
    );
  });

  test("Scenario 9: Stale draft claims detector catches contradictory 2026 application for 2027 candidate", () => {
    const conflictingDraftText = `
      Madame, Monsieur,
      Je vous adresse cette candidature pour manifester mon vif intérêt pour le programme de stages PFE 2026 : E-business & Digital Solutions au sein de Medianet Group.
      Je suis disponible immédiatement.
    `;

    const check = detectStaleDraftClaims(conflictingDraftText, feb2027Candidate, medianetOpp);
    assert.equal(check.hasStaleClaims, true, "Must flag calendar contradiction");
    assert.ok(
      check.unsupportedClaimsFound.some((c) => c.includes("2026") && c.includes("Contradiction")),
      `Should mention 2026 contradiction, got: ${JSON.stringify(check.unsupportedClaimsFound)}`
    );
  });

  test("Scenario 10: Stale draft claims detector catches invented unannounced 2027 programme", () => {
    const inventedProgrammeText = `
      Madame, Monsieur,
      Je vous adresse ma candidature pour intégrer votre programme PFE 2027 au sein de Medianet Group.
    `;

    const check = detectStaleDraftClaims(inventedProgrammeText, feb2027Candidate, medianetOpp);
    assert.equal(check.hasStaleClaims, true, "Must flag unannounced programme invention");
    assert.ok(
      check.unsupportedClaimsFound.some((c) => c.includes("2027") && c.includes("non encore annoncée")),
      `Should flag 2027 invention, got: ${JSON.stringify(check.unsupportedClaimsFound)}`
    );
  });

  test("Scenario 11: Unresolved mode normalizes both subject and body", () => {
    const rawConflictingBody = `
      Madame, Monsieur,
      Je vous adresse cette candidature pour manifester mon vif intérêt pour le programme de stages PFE 2026 : E-business & Digital Solutions au sein de Medianet Group.
      Cordialement,
      Mahdi Chaari
    `;

    const normalizedBody = validateAndNormalizeAvailabilityClaims(
      rawConflictingBody,
      feb2027Candidate,
      medianetOpp,
      "unresolved"
    );

    assert.ok(!normalizedBody.includes("programme de stages PFE 2026"), "Direct 2026 application must be sanitized");
    assert.ok(normalizedBody.includes("adapter les dates") || normalizedBody.includes("compatible"), "Inquiry phrasing must be present");
    assert.ok(normalizedBody.includes("février 2027"), "Real candidate availability must be declared");

    const rawSubject = "Candidature - Stage PFE 2026 : E-business & Digital Solutions - Mahdi Chaari";
    const normalizedSubject = validateAndNormalizeAvailabilitySubject(
      rawSubject,
      feb2027Candidate,
      medianetOpp,
      "unresolved"
    );

    assert.ok(normalizedSubject.includes("Disponibilité à partir de février 2027"), "Subject must declare availability");
    assert.ok(!normalizedSubject.includes("2026"), "Subject must not retain 2026");
  });
});
