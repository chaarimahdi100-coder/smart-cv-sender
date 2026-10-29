/**
 * Deterministic, transparent CV-to-Opportunity Relevance Scoring Engine.
 *
 * Evaluates candidate suitability strictly against verified facts extracted from
 * the candidate's CV and profile (skills, projects, education, seniority).
 *
 * IMPORTANT:
 * - This score evaluates factual technical and seniority relevance, NOT a "hiring probability".
 * - Never awards points for skills, qualifications, or leadership not evidenced in the candidate's verified data.
 * - Flags senior/managerial roles when candidate profile does not provide evidence of the required experience.
 * - Separates matched skills, missing skills, unsupported requirements, and unknown requirements.
 * - Always explains the scoring breakdown transparently to the user.
 */

import type {
  CandidateData,
  OpportunityData,
} from "./email-generator.ts";
import {
  KNOWN_TECH_KEYWORDS,
  extractVerifiableSkills,
  extractVerifiableProjects,
  resolveExactProgramName,
} from "./email-generator.ts";
import type {
  RoleSeniorityLevel,
  CandidateSeniorityLevel,
  RoleSeniorityDetection,
  CandidateSeniorityDetection,
} from "./seniority-detector.ts";
import {
  detectOpportunitySeniority,
  detectCandidateSeniority,
} from "./seniority-detector.ts";
import {
  detectAvailabilityConflict,
  extractCandidateAvailability,
  detectOpportunityTargetPeriod,
} from "./availability-detector.ts";
import { resolveSourcePlatform } from "./discovery/source-resolver.ts";
import { isOpportunityStale } from "./discovery/verifier.ts";

export type {
  RoleSeniorityLevel,
  CandidateSeniorityLevel,
  RoleSeniorityDetection,
  CandidateSeniorityDetection,
};

export {
  detectOpportunitySeniority,
  detectCandidateSeniority,
};

export interface OpportunityMatchBreakdown {
  /** Score from 0 to 100 */
  score: number;
  /** Qualitative relevance tier */
  relevanceLevel: "high" | "good" | "moderate" | "low" | "uncalculated";
  /** Human-readable tier label */
  relevanceLabel: string;
  /** Verified skills that match the opportunity requirements */
  matchedSkills: string[];
  /** Opportunity skills not detected in candidate's verified CV */
  missingSkills: string[];
  /** Non-technical or specialized requirements extracted from the job that cannot be verified from the CV */
  unknownRequirements: string[];
  /** Critical job requirements directly unsupported by candidate evidence (e.g. management, 5+ years experience) */
  unsupportedRequirements: string[];
  /** Candidate verified projects that demonstrate relevant technologies */
  matchedProjects: string[];
  /** Exact verified degree name used in the evaluation */
  verifiedDegreeName: string;
  /** Whether the candidate has an uploaded and parsed CV */
  hasCandidateCv: boolean;
  /** Detected seniority level of the target role */
  roleSeniority: RoleSeniorityLevel;
  /** Human-readable role seniority label */
  roleSeniorityLabel: string;
  /** Detected seniority level of the candidate */
  candidateSeniority: CandidateSeniorityLevel;
  /** Human-readable candidate seniority label */
  candidateSeniorityLabel: string;
  /** Whether there is a significant seniority/experience mismatch */
  seniorityMismatch: boolean;
  /** Explicit warning message explaining the mismatch if any */
  seniorityWarning?: string | null;
  /** Transparent explanation of the score composition */
  explanation: string;
  /** Whether candidate availability year conflicts with opportunity target session */
  availabilityConflict?: boolean;
  /** Explicit warning message if availability conflict exists */
  availabilityWarning?: string | null;
  /** Candidate stated availability */
  candidateAvailability?: string | null;
  /** Target recruitment period/session */
  opportunityTargetPeriod?: string | null;
  /** Whether the opportunity posting date is stale */
  isStale?: boolean;
  /** Warning message if the posting is stale */
  staleWarning?: string | null;
  /** Provenance metadata */
  provenance?: {
    sourcePlatformName?: string | null;
    sourceUrl?: string | null;
    directApplicationUrl?: string | null;
    isSpontaneousLead?: boolean;
  } | null;
}

/**
 * Extracts non-tech requirements (management, leadership, years of experience) from job posting
 * and categorizes them into unsupported or unknown.
 */
function extractExperienceRequirements(
  oppTitle: string,
  oppDesc: string,
  candidateSeniority: CandidateSeniorityDetection
): { unsupported: string[]; unknown: string[] } {
  const unsupported: string[] = [];
  const unknown: string[] = [];

  const combined = `${oppTitle} ${oppDesc}`.toLowerCase();

  // Management / Leadership checks
  const seeksManagement =
    /\b(?:engineering manager|technical manager|people management|manage (?:a team|engineers)|encadrement d'équipe|management d'équipe|direct reports|hiring|mentoring junior)\b/i.test(
      combined
    );

  if (seeksManagement) {
    if (!candidateSeniority.hasManagementExperience) {
      unsupported.push("Expérience d'encadrement ou de management d'équipe technique");
    }
  }

  // Years of experience requirements
  const yearsMatch = combined.match(/\b(?:au moins|minimum|at least)?\s*(\d+)\+?\s*(?:ans?|years?)\s*(?:d'expérience|of experience)?\b/i);
  if (yearsMatch) {
    const requiredYears = parseInt(yearsMatch[1], 10);
    if (requiredYears > 2 && candidateSeniority.verifiedYearsOfExperience < requiredYears) {
      unsupported.push(`Expérience professionnelle requise (${requiredYears}+ ans d'expérience)`);
    }
  } else if (/\b(?:senior|lead|principal|staff)\b/i.test(oppTitle)) {
    if (candidateSeniority.verifiedYearsOfExperience < 3 && candidateSeniority.isStudent) {
      unsupported.push("Expérience confirmée de niveau Senior / Lead");
    }
  }

  // Specialized / Methodological requirements that cannot be proven from standard CV
  if (/\b(?:budget|p&l|gestion budgétaire)\b/i.test(combined)) {
    unknown.push("Gestion budgétaire et allocation des ressources");
  }
  if (/\b(?:performance reviews?|évaluations annuelles)\b/i.test(combined)) {
    unknown.push("Conduite d'entretiens et évaluations de performance");
  }
  if (/\b(?:roadmaps? stratégiques?|strategic roadmap)\b/i.test(combined)) {
    unknown.push("Définition et pilotage de roadmaps stratégiques");
  }
  if (/\b(?:kubernetes en production|cluster k8s à grande échelle)\b/i.test(combined)) {
    unknown.push("Administration de clusters Kubernetes en production à grande échelle");
  }

  return { unsupported, unknown };
}

/**
 * Calculates a transparent, evidence-based relevance score between a candidate and an opportunity.
 */
export function calculateOpportunityMatchScore(
  candidate?: CandidateData | null,
  opportunity?: OpportunityData | null
): OpportunityMatchBreakdown {
  if (!opportunity) {
    return {
      score: 0,
      relevanceLevel: "uncalculated",
      relevanceLabel: "Non calculé",
      matchedSkills: [],
      missingSkills: [],
      unknownRequirements: [],
      unsupportedRequirements: [],
      matchedProjects: [],
      verifiedDegreeName: "",
      hasCandidateCv: false,
      roleSeniority: "unknown",
      roleSeniorityLabel: "Non spécifié",
      candidateSeniority: "student",
      candidateSeniorityLabel: "Non spécifié",
      seniorityMismatch: false,
      seniorityWarning: null,
      explanation: "Aucune opportunité spécifiée pour le calcul de pertinence.",
    };
  }

  const roleSen = detectOpportunitySeniority(opportunity);
  const candSen = detectCandidateSeniority(candidate);

  const verifiedSkills = candidate ? extractVerifiableSkills(candidate) : [];
  const rawCv = candidate?.rawCvText?.trim() || "";
  const hasCandidateCv = rawCv.length > 0 || (candidate?.skills && candidate.skills.length > 0) || false;

  // If candidate has not uploaded a CV, score cannot be honestly determined
  if (!hasCandidateCv || verifiedSkills.length === 0) {
    return {
      score: 0,
      relevanceLevel: "uncalculated",
      relevanceLabel: "CV requis",
      matchedSkills: [],
      missingSkills: [],
      unknownRequirements: [],
      unsupportedRequirements: [],
      matchedProjects: [],
      verifiedDegreeName: candidate?.degree || "",
      hasCandidateCv: false,
      roleSeniority: roleSen.level,
      roleSeniorityLabel: roleSen.label,
      candidateSeniority: candSen.level,
      candidateSeniorityLabel: candSen.label,
      seniorityMismatch: false,
      seniorityWarning: null,
      explanation:
        "Uploadez ou synchronisez votre CV pour calculer votre score de pertinence personnalisé basé sur vos compétences réelles.",
    };
  }

  // 1. Detect required tech keywords in opportunity title and description
  // Strip URLs and web script extensions (e.g. carriere.php, index.html) to prevent false positive tech keyword matches
  const textWithoutUrls = `${opportunity.title} ${opportunity.description || ""}`
    .replace(/https?:\/\/[^\s)]+/gi, "")
    .replace(/\b[\w.-]+\.(?:php|html|htm|aspx|jsp)\b/gi, "");
  const combinedOppText = `${opportunity.title} ${opportunity.description || ""}`.toLowerCase();
  const requiredSkills: string[] = [];

  for (const kw of KNOWN_TECH_KEYWORDS) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(textWithoutUrls)) {
      requiredSkills.push(kw);
    }
  }

  // 2. Compute Skill Match (Max 40 points)
  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];

  for (const req of requiredSkills) {
    if (verifiedSkills.some((s) => s.toLowerCase() === req.toLowerCase())) {
      matchedSkills.push(req);
    } else {
      missingSkills.push(req);
    }
  }

  let skillsPoints = 0;
  if (requiredSkills.length > 0) {
    const ratio = matchedSkills.length / requiredSkills.length;
    skillsPoints = Math.round(ratio * 40);
  } else {
    // If job description doesn't explicitly name tech keywords, grant modest base points for verified skills
    skillsPoints = Math.min(20, verifiedSkills.length * 4);
  }

  // 3. Compute Projects Match (Max 25 points)
  const allProjects = candidate ? extractVerifiableProjects(candidate.rawCvText, candidate.projects) : [];
  const matchedProjectTitles: string[] = [];

  for (const proj of allProjects) {
    const projTechs = proj.technologies.map((t) => t.toLowerCase());
    const matchesReq = requiredSkills.some((req) => projTechs.includes(req.toLowerCase()));
    const matchesOppDomain =
      (combinedOppText.includes("web") && proj.title.toLowerCase().includes("web")) ||
      (combinedOppText.includes("commerce") && proj.title.toLowerCase().includes("ecom")) ||
      (combinedOppText.includes("gestion") && proj.title.toLowerCase().includes("gestion"));

    if (matchesReq || matchesOppDomain) {
      matchedProjectTitles.push(proj.title);
    }
  }

  let projectPoints = 0;
  if (matchedProjectTitles.length >= 2) {
    projectPoints = 25;
  } else if (matchedProjectTitles.length === 1) {
    projectPoints = 15;
  } else if (allProjects.length > 0) {
    projectPoints = 8;
  }

  // 4. Compute Education & Domain Alignment (Max 15 points)
  const verifiedDegreeName = candidate ? resolveExactProgramName(candidate) : "";
  const degreeLower = verifiedDegreeName.toLowerCase();
  let educationPoints = 0;

  const isBISOpp =
    combinedOppText.includes("gestion") ||
    combinedOppText.includes("bi") ||
    combinedOppText.includes("business information") ||
    combinedOppText.includes("erp");

  const isWebOpp =
    combinedOppText.includes("web") ||
    combinedOppText.includes("react") ||
    combinedOppText.includes("fullstack") ||
    combinedOppText.includes("javascript");

  if (degreeLower.includes("informatique de gestion") || degreeLower.includes("business information systems")) {
    if (isBISOpp || isWebOpp) {
      educationPoints = 15;
    } else {
      educationPoints = 10;
    }
  } else if (degreeLower.includes("informatique") || degreeLower.includes("ingénieur") || degreeLower.includes("licence")) {
    educationPoints = 10;
  } else if (candidate?.school) {
    educationPoints = 5;
  }

  // 5. Seniority & Experience Alignment (Max 20 points)
  let seniorityPoints = 0;
  let seniorityMismatch = false;
  let seniorityWarning: string | null = null;
  let mismatchSeverity: "none" | "moderate" | "critical" = "none";

  if (candSen.isStudent || candSen.level === "student") {
    if (roleSen.level === "pfe" || roleSen.level === "intern") {
      seniorityPoints = 20; // Perfect match for student
    } else if (roleSen.level === "junior") {
      seniorityPoints = 18; // Good match for graduating student
    } else if (roleSen.level === "mid") {
      seniorityPoints = 8;
      seniorityMismatch = true;
      mismatchSeverity = "moderate";
      seniorityWarning = `Ce poste s'adresse typiquement à des profils confirmés (2 à 4 ans d'expérience). En tant qu'étudiant, vos réalisations de projets seront déterminantes.`;
    } else if (roleSen.level === "senior") {
      seniorityPoints = 0;
      seniorityMismatch = true;
      mismatchSeverity = "critical";
      seniorityWarning = `Ce poste est un rôle Senior / Lead (« ${opportunity.title} ») requérant plusieurs années d'expérience confirmée non attestées dans votre profil.`;
    } else if (roleSen.level === "manager" || roleSen.level === "executive") {
      seniorityPoints = 0;
      seniorityMismatch = true;
      mismatchSeverity = "critical";
      seniorityWarning = `Ce poste est un rôle de management technique (« ${opportunity.title} ») requérant une expérience professionnelle d'encadrement d'équipe qui n'est pas attestée dans votre profil d'étudiant en ${verifiedDegreeName || "Licence"}.`;
    }
  } else if (candSen.level === "entry_level") {
    if (roleSen.level === "junior" || roleSen.level === "intern" || roleSen.level === "pfe") {
      seniorityPoints = 20;
    } else if (roleSen.level === "mid") {
      seniorityPoints = 12;
    } else {
      seniorityPoints = 0;
      seniorityMismatch = true;
      mismatchSeverity = "critical";
      seniorityWarning = `Ce poste de niveau ${roleSen.label} requiert une expérience professionnelle plus avancée.`;
    }
  } else {
    // Experienced candidate
    if (roleSen.minYearsExpected <= candSen.verifiedYearsOfExperience) {
      seniorityPoints = 20;
    } else {
      seniorityPoints = 10;
    }
  }

  // 6. Extract Unsupported and Unknown Requirements
  const { unsupported: unsupportedRequirements, unknown: unknownRequirements } =
    extractExperienceRequirements(opportunity.title, opportunity.description || "", candSen);

  // 7. Calculate raw score
  let rawScore = skillsPoints + projectPoints + educationPoints + seniorityPoints;

  // Seniority mismatch cap to enforce evidence-based realism
  if (mismatchSeverity === "critical") {
    // If role is Manager/Executive or Senior while candidate is student, cap score at 25%
    if (roleSen.isManagement) {
      if (rawScore > 25) rawScore = 25;
    } else {
      if (rawScore > 35) rawScore = 35;
    }
  } else if (mismatchSeverity === "moderate") {
    if (rawScore > 50) rawScore = 50;
  }

  // Bound score between 5 and 96
  if (rawScore > 96) rawScore = 96;
  if (rawScore < 5 && hasCandidateCv) rawScore = 5;

  let relevanceLevel: OpportunityMatchBreakdown["relevanceLevel"] = "low";
  let relevanceLabel = "Adéquation initiale";

  if (rawScore >= 75) {
    relevanceLevel = "high";
    relevanceLabel = "Excellente adéquation";
  } else if (rawScore >= 55) {
    relevanceLevel = "good";
    relevanceLabel = "Bonne adéquation";
  } else if (rawScore >= 35) {
    relevanceLevel = "moderate";
    relevanceLabel = "Adéquation modérée";
  } else {
    relevanceLevel = "low";
    if (seniorityMismatch && roleSen.isManagement) {
      relevanceLabel = "Écart majeur (Poste Manager)";
    } else if (seniorityMismatch && roleSen.isSenior) {
      relevanceLabel = "Adéquation faible (Poste Senior)";
    } else {
      relevanceLabel = "Faible adéquation";
    }
  }

  // 6b. Calendar Availability & Conflict Check
  const conflict = detectAvailabilityConflict(candidate, opportunity);
  const candAvail = extractCandidateAvailability(candidate);
  const oppTarget = detectOpportunityTargetPeriod(opportunity);

  // 6c. Staleness Check
  const datePostedStr = (opportunity as { date_posted?: string | null })?.date_posted;
  const stalenessCheck = isOpportunityStale(datePostedStr, opportunity.type || opportunity.title);
  const isStale = stalenessCheck.isStale;
  const staleWarning = stalenessCheck.isStale
    ? `Cette offre a été publiée il y a plus de ${stalenessCheck.thresholdDays} jours (${stalenessCheck.daysOld} j). Sa disponibilité actuelle est à confirmer.`
    : null;
  const oppRecord = opportunity as unknown as Record<string, unknown> | null;

  // Provenance extraction
  const evidenceObj = oppRecord?.verification_evidence as Record<string, unknown> | undefined;
  const isSpontaneousLead = Boolean(
    opportunity.title.toLowerCase().includes("piste") ||
    opportunity.title.toLowerCase().includes("spontanée") ||
    (typeof oppRecord?.status_reason === "string" && oppRecord.status_reason.toLowerCase().includes("spontanée"))
  );

  const resolvedPlatform = resolveSourcePlatform({
    sourceUrl: (oppRecord?.source_url as string) || null,
    applicationUrl:
      (oppRecord?.application_url as string) ||
      (oppRecord?.canonical_url as string) ||
      (evidenceObj?.directApplicationUrl as string) ||
      null,
    sourceProvider: (oppRecord?.source_provider as string) || null,
    declaredPlatform:
      (oppRecord?.source_platform as string) ||
      (evidenceObj?.sourcePlatformName as string) ||
      null,
    companyWebsite:
      (oppRecord?.company_website as string) ||
      (oppRecord?.companyWebsite as string) ||
      null,
    companyName:
      (oppRecord?.company_name as string) ||
      (oppRecord?.companyName as string) ||
      opportunity.companyName ||
      null,
    isSpontaneousLead,
  });

  const provenance = {
    sourcePlatformName: resolvedPlatform.platformName,
    sourceUrl: (oppRecord?.source_url as string) || null,
    directApplicationUrl:
      (oppRecord?.application_url as string) ||
      (oppRecord?.canonical_url as string) ||
      (evidenceObj?.directApplicationUrl as string) ||
      null,
    isSpontaneousLead,
  };

  const skillSummary =
    matchedSkills.length > 0
      ? `${matchedSkills.length} compétence(s) vérifiée(s) (${matchedSkills.slice(0, 3).join(", ")}${matchedSkills.length > 3 ? "..." : ""})`
      : "aucune compétence technique directement commune";

  const projectSummary =
    matchedProjectTitles.length > 0
      ? `${matchedProjectTitles.length} projet(s) connexe(s)`
      : "aucun projet directement aligné";

  let explanation = `Score de pertinence factuel (${rawScore}%) calculé à partir de vos données vérifiées : ${skillSummary}, ${projectSummary}, et formation (${verifiedDegreeName || "cursus renseigné"}). Ce score évalue l'adéquation technique et documentaire et ne constitue pas une probabilité d'embauche.`;

  if (seniorityMismatch && seniorityWarning) {
    explanation += ` NOTA : ${seniorityWarning}`;
  }

  if (conflict.hasConflict && conflict.warningMessage) {
    explanation += ` ${conflict.warningMessage}`;
  }

  if (isStale && staleWarning) {
    explanation += ` AVERTISSEMENT : ${staleWarning}`;
  }

  return {
    score: rawScore,
    relevanceLevel,
    relevanceLabel,
    matchedSkills,
    missingSkills,
    unknownRequirements,
    unsupportedRequirements,
    matchedProjects: matchedProjectTitles,
    verifiedDegreeName,
    hasCandidateCv: true,
    roleSeniority: roleSen.level,
    roleSeniorityLabel: roleSen.label,
    candidateSeniority: candSen.level,
    candidateSeniorityLabel: candSen.label,
    seniorityMismatch,
    seniorityWarning,
    explanation,
    availabilityConflict: conflict.hasConflict,
    availabilityWarning: conflict.warningMessage,
    candidateAvailability: candAvail?.statedText || null,
    opportunityTargetPeriod: oppTarget?.targetPeriod || null,
    isStale,
    staleWarning,
    provenance,
  };
}
