/**
 * Candidate and Opportunity Availability & Calendar Conflict Intelligence
 *
 * Ensures candidate availability stated in their CV is strictly respected and never contradicted:
 * - Detects candidate availability from CV (e.g., "Stage PFE à partir de février 2027").
 * - Detects opportunity target recruitment session / year (e.g., "Stage PFE 2026").
 * - Identifies calendar conflicts (e.g., Candidate available Feb 2027 vs Opportunity session 2026).
 * - Prevents AI or deterministic generators from falsely claiming availability for contradictory periods.
 * - Formulates transparent, respectful phrasing when reaching out to an earlier session vacancy.
 */

import type { CandidateData, OpportunityData } from "./email-generator.ts";

export interface CandidateAvailability {
  statedText: string;
  year?: number;
  month?: string;
  isPfe: boolean;
}

export interface OpportunityTargetPeriod {
  targetYear?: number;
  targetPeriod?: string;
  isPfe: boolean;
}

export interface AvailabilityConflictDetection {
  hasConflict: boolean;
  candidateAvailability?: CandidateAvailability | null;
  opportunityTarget?: OpportunityTargetPeriod | null;
  warningMessage?: string | null;
}

const MONTH_NAMES_FR = [
  "janvier", "février", "fevrier", "mars", "avril", "mai", "juin",
  "juillet", "août", "aout", "septembre", "octobre", "novembre", "décembre", "decembre"
];

/**
 * Extracts candidate availability period strictly from their verified CV text or profile.
 */
export function extractCandidateAvailability(candidate?: CandidateData | null): CandidateAvailability | null {
  if (!candidate) return null;
  const rawText = candidate.rawCvText || "";
  if (!rawText) return null;

  // Regex patterns targeting availability declarations in French CVs:
  // e.g. "recherche un Stage PFE à partir de février 2027"
  // e.g. "disponible à partir de février 2027"
  // e.g. "disponibilité : dès février 2027"
  // e.g. "PFE à partir de février 2027"
  const pfeAvailabilityRegex = /(?:recherche\s+(?:un\s+)?stage\s+(?:pfe|de\s+fin\s+d['’]études)|stage\s+pfe|disponibilit[ée]|disponible)[^\n.]{0,60}?(?:à\s+partir\s+de|dès|en)\s+([a-zéèêûô]+)?\s*(202[5-9]|203\d)/i;
  const match = rawText.match(pfeAvailabilityRegex);

  if (match) {
    const rawMonth = match[1]?.toLowerCase().trim();
    const rawYear = parseInt(match[2], 10);
    const month = MONTH_NAMES_FR.find((m) => m === rawMonth) ? (rawMonth.replace("fevrier", "février").replace("aout", "août").replace("decembre", "décembre")) : undefined;
    const statedText = month ? `à partir de ${month} ${rawYear}` : `à partir de ${rawYear}`;

    return {
      statedText,
      year: rawYear,
      month,
      isPfe: true,
    };
  }

  // General availability fallback: "disponible à partir de [mois] [année]"
  const generalAvailabilityRegex = /(?:disponible|disponibilit[ée])[^\n.]{0,40}?(?:à\s+partir\s+de|dès|en)\s+([a-zéèêûô]+)?\s*(202[5-9]|203\d)/i;
  const genMatch = rawText.match(generalAvailabilityRegex);
  if (genMatch) {
    const rawMonth = genMatch[1]?.toLowerCase().trim();
    const rawYear = parseInt(genMatch[2], 10);
    const month = MONTH_NAMES_FR.find((m) => m === rawMonth) ? (rawMonth.replace("fevrier", "février").replace("aout", "août").replace("decembre", "décembre")) : undefined;
    const statedText = month ? `à partir de ${month} ${rawYear}` : `à partir de ${rawYear}`;

    return {
      statedText,
      year: rawYear,
      month,
      isPfe: /pfe/i.test(rawText),
    };
  }

  return null;
}

/**
 * Detects the target year or recruitment campaign of an opportunity.
 */
export function detectOpportunityTargetPeriod(
  opp?: (OpportunityData & { date_posted?: string | null; valid_through?: string | null }) | null
): OpportunityTargetPeriod | null {
  if (!opp) return null;
  const textToScan = `${opp.title} ${opp.description || ""}`;

  // Check explicit mention of PFE session: "Stage PFE 2026", "PFE Book 2026", "Session 2026", "PFE 2026"
  const pfeSessionMatch = textToScan.match(/(?:stage\s+pfe|pfe\s+book|session\s+pfe|pfe)\s*(?:[-:–—\s])?\s*(202[4-9]|203\d)/i);
  if (pfeSessionMatch) {
    const year = parseInt(pfeSessionMatch[1], 10);
    return {
      targetYear: year,
      targetPeriod: `Session PFE ${year}`,
      isPfe: true,
    };
  }

  // Check general year in title: e.g. "Recrutement 2026"
  const titleYearMatch = opp.title.match(/\b(202[4-9]|203\d)\b/);
  if (titleYearMatch) {
    const year = parseInt(titleYearMatch[1], 10);
    return {
      targetYear: year,
      targetPeriod: `Année ${year}`,
      isPfe: /pfe/i.test(opp.title) || (opp.type || "").toUpperCase() === "PFE",
    };
  }

  // Check deadline year if valid_through provided
  if (opp.valid_through) {
    try {
      const deadline = new Date(opp.valid_through);
      if (!isNaN(deadline.getTime())) {
        const year = deadline.getFullYear();
        return {
          targetYear: year,
          targetPeriod: `Échéance ${year}`,
          isPfe: /pfe/i.test(opp.title) || (opp.type || "").toUpperCase() === "PFE",
        };
      }
    } catch {
      // Ignore
    }
  }

  return null;
}

/**
 * Detects whether there is a scheduling conflict between candidate availability
 * and target opportunity recruitment session.
 */
export function detectAvailabilityConflict(
  candidate?: CandidateData | null,
  opp?: (OpportunityData & { date_posted?: string | null; valid_through?: string | null }) | null
): AvailabilityConflictDetection {
  const candAvail = extractCandidateAvailability(candidate);
  const oppTarget = detectOpportunityTargetPeriod(opp);

  if (!candAvail || !candAvail.year || !oppTarget || !oppTarget.targetYear) {
    return {
      hasConflict: false,
      candidateAvailability: candAvail,
      opportunityTarget: oppTarget,
      warningMessage: null,
    };
  }

  // If candidate is available in 2027, but opportunity targets 2026: CONFLICT!
  if (candAvail.year > oppTarget.targetYear) {
    const warningMessage = `⚠️ Conflit de calendrier : Votre CV indique une disponibilité pour un stage PFE ${candAvail.statedText}, alors que cette opportunité cible la ${oppTarget.targetPeriod} (session antérieure).`;
    return {
      hasConflict: true,
      candidateAvailability: candAvail,
      opportunityTarget: oppTarget,
      warningMessage,
    };
  }

  return {
    hasConflict: false,
    candidateAvailability: candAvail,
    opportunityTarget: oppTarget,
    warningMessage: null,
  };
}

export function cleanOpportunityRoleTitle(title?: string | null): string {
  if (!title) return "";
  return title
    .replace(/^(?:Piste|Stages?)\s+PFE(?:\s+\d{4})?\s*:\s*/i, "")
    .replace(/^Candidature\s+spontanée(?:\s+PFE)?\s*:\s*/i, "")
    .replace(/^Recrutement\s+(?:des\s+stagiaires\s+PFE\s+)?(?:\d{4}\s*)?:\s*/i, "")
    .replace(/\s*\([^)]*(?:pfe\s+book|session|\d{4}|medianet|group|entreprise)[^)]*\)\s*$/i, "")
    .replace(/\s*\([^)]+\)\s*$/, "")
    .trim();
}

/**
 * Normalizes email draft body to ensure candidate availability dates are never corrupted.
 * If candidate is available in 2027, never allow claims of availability for 2026 or immediately.
 */
export function validateAndNormalizeAvailabilityClaims(
  body: string,
  candidate: CandidateData,
  opp?: OpportunityData,
  conflictStrategy?: "unresolved" | "compatible_confirmed" | "spontaneous_converted"
): string {
  if (!body) return body;
  const candAvail = extractCandidateAvailability(candidate);
  if (!candAvail) return body;

  const oppTarget = detectOpportunityTargetPeriod(opp);
  const companyName = opp?.companyName?.trim() || "votre entreprise";
  const roleName = cleanOpportunityRoleTitle(opp?.title) || "stage PFE";

  let normalized = body;
  normalized = normalized.replace(/\bje\s+me\s+perm\s+de\b/gi, "je me permets de");

  // 1. Universal date truth-grounding:
  // If candidate is available in 2027 or later, eliminate any false claims of immediate or 2026 availability
  if (candAvail.statedText) {
    normalized = normalized.replace(
      /\b(?:disponible\s+immédiatement|disponible\s+dès\s+maintenant|disponible\s+dès\s+février\s+2026|disponible\s+à\s+partir\s+de\s+février\s+2026|disponibilité\s+immédiate)\b/gi,
      `disponible ${candAvail.statedText}`
    );
  }

  const hasConflict = candAvail.year && oppTarget?.targetYear && candAvail.year > oppTarget.targetYear;

  if (conflictStrategy === "spontaneous_converted") {
    // SPONTANEOUS CONVERTED MODE:
    // - Eliminate ALL claims that candidate is applying to the specific 2026 program
    // - Eliminate any mentions of 2026 (PFE Book 2026, session 2026, programme 2026, Pitch Day 2026)
    // - NEVER INVENT a future 2027 program (no "programme 2027", "session 2027", "PFE 2027")
    // - Express genuine spontaneous application for candidate's actual availability (e.g. à partir de février 2027)

    // Remove direct applications to 2026 program:
    normalized = normalized
      .replace(
        /(?:je\s+vous\s+adresse\s+ma\s+candidature|je\s+souhaite\s+postuler|je\s+me\s+permets\s+de\s+postuler)\s+(?:pour\s+intégrer\s+votre\s+programme\s+de\s+stages?\s+PFE\s+2026|pour\s+le\s+programme\s+de\s+stages?\s+PFE\s+2026|au\s+programme\s+de\s+stages?\s+PFE\s+2026|à\s+votre\s+programme\s+PFE\s+2026)[^.,\n]*/gi,
        `je me permets de vous adresser ma candidature spontanée pour un stage de fin d'études (PFE) au sein de ${companyName}`
      )
      .replace(
        /(?:je\s+vous\s+adresse\s+cette\s+candidature\s+pour\s+manifester\s+mon\s+vif\s+intérêt\s+pour\s+le\s+programme\s+de\s+stages?\s+PFE\s+2026[^.,\n]*)/gi,
        `je me permets de vous adresser ma candidature spontanée pour un stage de fin d'études (PFE) au sein de ${companyName}`
      );

    // Replace any remaining programme / session 2026 references
    normalized = normalized
      .replace(/\bprogramme\s+(?:de\s+stages?\s+)?PFE\s+2026\b/gi, "stage de fin d'études (PFE)")
      .replace(/\bStages?\s+PFE\s+2026\b/gi, "stage de fin d'études (PFE)")
      .replace(/\bsession\s+(?:PFE\s+)?2026\b/gi, "un stage PFE")
      .replace(/\b(?:le\s+)?PFE\s+Book\s+2026\b/gi, "vos domaines d'expertise")
      .replace(/\b(?:lors\s+du\s+|au\s+)?Pitch\s+Day(?:\s+2026)?\b/gi, "au sein de vos équipes");

    // Remove any mistakenly generated/invented future programme (e.g. "session 2027", "programme PFE 2027")
    normalized = normalized
      .replace(/\b(?:pour\s+la\s+session\s+(?:PFE\s+)?202[7-9]|session\s+(?:PFE\s+)?202[7-9])\b/gi, "pour de futures opportunités de stage PFE")
      .replace(/\bau\s+titre\s+de\s+la\s+session\s+(?:PFE\s+)?202[7-9]\b/gi, "pour mon stage PFE")
      .replace(/\bprogramme\s+(?:de\s+stages?\s+)?PFE\s+202[7-9]\b/gi, "stage de fin d'études (PFE)")
      .replace(/\bStages?\s+PFE\s+202[7-9]\b/gi, "stage de fin d'études (PFE)")
      .replace(/\b(?:le\s+)?PFE\s+Book\s+202[7-9]\b/gi, "vos domaines d'expertise")
      .replace(/\bPitch\s+Day(?:\s+202[7-9])?\b/gi, "au sein de vos équipes");

    // In motivation sentence: remove "Rejoindre ... dans le cadre de ma session de stage PFE 2027"
    normalized = normalized.replace(
      /\bdans\s+le\s+cadre\s+de\s+ma\s+session\s+de\s+stage\s+PFE\s+\d{4}\b/gi,
      "pour mener mon stage de fin d'études"
    );

    // Make sure candidate availability is explicitly declared if not present
    if (candAvail.statedText && !normalized.includes(candAvail.statedText)) {
      normalized = normalized.replace(
        /(je\s+me\s+permets\s+de\s+vous\s+adresser\s+ma\s+candidature\s+spontanée\s+(?:pour\s+un\s+stage\s+de\s+fin\s+d'études\s+\(PFE\))?)/i,
        `disponible ${candAvail.statedText} pour mon stage de fin d'études (PFE), $1`
      );
    }
  } else if (conflictStrategy === "compatible_confirmed") {
    // COMPATIBLE CONFIRMED MODE:
    // Candidate personally confirmed schedule compatibility.
    // Clearly state that the candidate personally confirmed their availability/academic arrangements.
    // Do NOT claim Medianet or the employer confirmed eligibility without evidence.

    // If text claims Medianet/company accepted or approved:
    normalized = normalized.replace(
      /\b(?:l'entreprise|l'employeur|votre\s+équipe|Medianet(?:\s+Group)?)\s+a\s+(?:confirmé|validé|accepté)\s+(?:mon\s+éligibilité|ma\s+candidature|mes\s+dates|mon\s+calendrier)\b/gi,
      "j'ai validé personnellement la compatibilité de mon calendrier avec cette opportunité"
    );

    // Ensure candidate's verified availability is stated
    if (candAvail.statedText && !normalized.includes(candAvail.statedText)) {
      normalized = normalized.replace(
        /(Mon\s+calendrier\s+académique\s+prévoyant\s+une\s+disponibilité)[^.,\n]*/i,
        `$1 ${candAvail.statedText}`
      );
    }
  } else if (hasConflict || conflictStrategy === "unresolved") {
    // UNRESOLVED CONFLICT MODE:
    // Candidate available in 2027, opportunity targets 2026.
    // Approval is blocked. Body must NOT claim unreserved eligibility or direct application for the 2026 programme!

    // Replace unreserved application to 2026 program:
    normalized = normalized
      .replace(
        /(?:je\s+vous\s+adresse\s+ma\s+candidature|je\s+souhaite\s+postuler|je\s+me\s+permets\s+de\s+postuler)\s+(?:pour\s+intégrer\s+votre\s+programme\s+de\s+stages?\s+PFE\s+2026|pour\s+le\s+programme\s+de\s+stages?\s+PFE\s+2026|au\s+programme\s+de\s+stages?\s+PFE\s+2026|à\s+votre\s+programme\s+PFE\s+2026)[^.,\n]*/gi,
        `je me permets de vous contacter au sujet de votre opportunité « ${roleName} » au sein de ${companyName} afin d'échanger sur la possibilité d'adapter les dates ou de convenir d'une organisation compatible`
      )
      .replace(
        /(?:je\s+vous\s+adresse\s+cette\s+candidature\s+pour\s+manifester\s+mon\s+vif\s+intérêt\s+pour\s+le\s+programme\s+de\s+stages?\s+PFE\s+2026[^.,\n]*)/gi,
        `je me permets de vous contacter au sujet de votre opportunité « ${roleName} » au sein de ${companyName} afin d'échanger sur la possibilité d'adapter les dates ou de convenir d'une organisation compatible`
      );

    // Sanitize any remaining unconditioned 2026 program references in body
    normalized = normalized
      .replace(/\bprogramme\s+(?:de\s+stages?\s+)?PFE\s+2026\b/gi, `opportunité « ${roleName} »`)
      .replace(/\bStages?\s+PFE\s+2026\b/gi, `stage PFE « ${roleName} »`)
      .replace(/\b(?:le\s+)?PFE\s+Book\s+2026\b/gi, "vos axes technologiques");

    // Ensure candidate's verified availability is stated
    if (candAvail.statedText && !normalized.includes(candAvail.statedText)) {
      normalized = normalized.replace(
        /(je\s+me\s+permets\s+de\s+vous\s+contacter\s+au\s+sujet\s+de\s+votre\s+opportunité)/i,
        `avec une disponibilité prévue ${candAvail.statedText} pour mon stage de fin d'études (PFE), $1`
      );
    }
  }

  return normalized;
}

/**
 * Ensures spontaneous application leads use natural, respectful exploratory phrasing,
 * never claiming "Votre offre pour [Piste PFE] a retenu mon attention".
 */
export function validateAndNormalizeSpontaneousClaims(
  body: string,
  opp: OpportunityData
): string {
  if (!body) return body;
  const oppTitle = opp.title || "";
  const isSpontaneous =
    oppTitle.toLowerCase().includes("piste pfe") ||
    oppTitle.toLowerCase().includes("candidature spontanée") ||
    oppTitle.toLowerCase().includes("piste entreprise") ||
    /carriere/i.test(opp.description || "");

  if (!isSpontaneous) return body;

  let normalized = body;
  // Strip "Piste PFE 2026 :" or "Piste Entreprise :" from body if echoed
  normalized = normalized.replace(/\bPiste\s+PFE(?:\s+\d{4})?\s*:\s*/gi, "");
  normalized = normalized.replace(/\bPiste\s+Entreprise\s*:\s*/gi, "");
  // Strip fake reference codes e.g. (référence #83921)
  normalized = normalized.replace(/\s*\((?:référence|reference|ref|réf)\s*#?[a-z0-9_-]+\)/gi, "");
  // Replace "postuler au poste de [Piste PFE ...]" with "vous adresser ma candidature spontanée"
  normalized = normalized.replace(/postuler\s+au\s+poste\s+de\s+(?:Piste\s+(?:PFE|Entreprise)\s*:\s*)?[^.,\n]+/gi, "vous adresser ma candidature spontanée pour un stage PFE");
  normalized = normalized.replace(/Votre\s+offre\s+(?:pour\s+le\s+poste\s+de\s+|d'emploi\s+pour\s+|intitulée\s+)?["«']?[^"»\n]+["»']?\s+a\s+retenu\s+tout(?:e)?\s+mon\s+attention/gi, "Votre entreprise et l'envergure de vos projets retiennent toute mon attention");

  return normalized;
}

/**
 * Normalizes email draft subject line based on candidate availability and conflict strategy.
 */
export function validateAndNormalizeAvailabilitySubject(
  subject: string,
  candidate: CandidateData,
  opp?: OpportunityData,
  conflictStrategy?: "unresolved" | "compatible_confirmed" | "spontaneous_converted"
): string {
  if (!subject) return subject;
  const normalized = subject;
  const candAvail = extractCandidateAvailability(candidate);
  const oppTarget = detectOpportunityTargetPeriod(opp);
  const hasConflict = candAvail?.year && oppTarget?.targetYear && candAvail.year > oppTarget.targetYear;
  const roleName = cleanOpportunityRoleTitle(opp?.title || subject);

  const candidateName = [candidate.first_name, candidate.last_name].filter(Boolean).join(" ").trim();
  const nameSuffix = candidateName ? ` — ${candidateName}` : "";

  if (conflictStrategy === "spontaneous_converted") {
    // Must NOT contain 2026!
    // Must NOT invent a 2027 programme name (e.g. no "Stage PFE 2027" or "Session 2027")!
    // State actual availability truthful text
    const availPart = candAvail?.statedText ? ` (Disponibilité ${candAvail.statedText})` : "";
    const rolePart = roleName ? ` : ${roleName}` : "";
    return `Candidature spontanée — Stage PFE${availPart}${rolePart}${nameSuffix}`;
  } else if (conflictStrategy === "compatible_confirmed") {
    const availPart = candAvail?.statedText ? ` (Disponibilité ${candAvail.statedText})` : "";
    const rolePart = roleName ? ` : ${roleName}` : "";
    return `Candidature Stage PFE${rolePart}${availPart}${nameSuffix}`;
  } else if (hasConflict || conflictStrategy === "unresolved") {
    const availPart = candAvail?.statedText ? ` (Disponibilité ${candAvail.statedText})` : "";
    const rolePart = roleName ? ` : ${roleName}` : "";
    return `Candidature Stage PFE${availPart}${rolePart}${nameSuffix}`;
  }

  return normalized;
}
