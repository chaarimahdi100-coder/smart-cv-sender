/**
 * Seniority, Level & Experience Classification Engine.
 *
 * Provides deterministic detection of role hierarchy (executive, manager, senior,
 * mid, junior, intern, pfe) and candidate experience status (student, entry_level, mid, senior).
 *
 * Enforces strict anti-hallucination rules:
 * - Never infers professional experience or leadership not attested by candidate facts.
 * - Validates and normalizes seniority and relocation claims in generated drafts.
 */

import {
  extractCandidateAvailability,
  detectOpportunityTargetPeriod,
} from "./availability-detector.ts";
import type { CandidateData, OpportunityData } from "./email-generator.ts";

export type RoleSeniorityLevel =
  | "executive"
  | "manager"
  | "senior"
  | "mid"
  | "junior"
  | "intern"
  | "pfe"
  | "unknown";

export type CandidateSeniorityLevel =
  | "student"
  | "entry_level"
  | "mid"
  | "senior";

export interface RoleSeniorityDetection {
  level: RoleSeniorityLevel;
  label: string;
  isManagement: boolean;
  isSenior: boolean;
  minYearsExpected: number;
}

export interface CandidateSeniorityDetection {
  level: CandidateSeniorityLevel;
  label: string;
  isStudent: boolean;
  verifiedYearsOfExperience: number;
  hasManagementExperience: boolean;
}

export interface CandidateSeniorityInput {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  school?: string | null;
  degree?: string | null;
  specialty?: string | null;
  city?: string | null;
  country?: string | null;
  rawCvText?: string | null;
  skills?: string[] | null;
  experience?: Array<{ title: string; company: string; duration?: string }> | null;
}

export interface OpportunitySeniorityInput {
  title: string;
  description?: string | null;
  type?: string | null;
  location?: string | null;
}

/**
 * Detects the seniority and hierarchy level of an opportunity from its title and description.
 */
export function detectOpportunitySeniority(
  opportunity?: OpportunitySeniorityInput | null
): RoleSeniorityDetection {
  if (!opportunity) {
    return {
      level: "unknown",
      label: "Non spécifié",
      isManagement: false,
      isSenior: false,
      minYearsExpected: 0,
    };
  }

  const title = (opportunity.title || "").toLowerCase();
  const desc = (opportunity.description || "").toLowerCase();
  const type = (opportunity.type || "").toUpperCase();

  // 1. Check PFE / Stage first if in title or explicit type
  if (
    type === "PFE" ||
    /\b(?:pfe|stage pfe|projet de fin d'études|projet de fin d'etudes|stage de fin d'études|stage de fin d'etudes|graduation project|graduation internship|end[- ]of[- ]studies)\b/i.test(title)
  ) {
    return {
      level: "pfe",
      label: "Stage PFE (Fin d'études)",
      isManagement: false,
      isSenior: false,
      minYearsExpected: 0,
    };
  }

  if (
    type === "STAGE" ||
    type === "INTERNSHIP" ||
    /\b(?:stage|intern|internship|stagiaire|alternance|apprenti|apprenant)\b/i.test(title)
  ) {
    return {
      level: "intern",
      label: "Stage étudiant",
      isManagement: false,
      isSenior: false,
      minYearsExpected: 0,
    };
  }

  // 2. Executive / Direction
  if (
    /\b(?:director|directeur|directrice|head of|vp|vice[- ]president|chief|cto|cio|cdo|vp of)\b/i.test(title)
  ) {
    return {
      level: "executive",
      label: "Direction / Exécutif",
      isManagement: true,
      isSenior: true,
      minYearsExpected: 8,
    };
  }

  // 3. Managerial Roles (e.g. Engineering Manager, Tech Lead, Team Lead, Product Manager)
  if (
    type === "MANAGER" ||
    /\b(?:engineering manager|technical manager|development manager|software manager|tech manager|team lead|responsable (?:technique|d'équipe|de pôle)|lead manager)\b/i.test(title) ||
    (/\bmanager\b/i.test(title) && !/\b(?:assistant manager|junior manager|project management)\b/i.test(title)) ||
    /\b(?:engineering manager|manage a team of engineers|people management|direct reports)\b/i.test(desc)
  ) {
    return {
      level: "manager",
      label: "Management / Direction technique",
      isManagement: true,
      isSenior: true,
      minYearsExpected: 5,
    };
  }

  // 4. Senior / Staff / Principal / Architect
  if (
    type === "SENIOR" ||
    /\b(?:senior|sr\.?|staff|principal|lead developer|tech lead|architecte|architect|expert technique)\b/i.test(title) ||
    /\b(?:minimum|at least|au moins)\s+(?:5|6|7|8)\s+(?:years?|ans?)\b/i.test(desc)
  ) {
    return {
      level: "senior",
      label: "Senior / Staff / Lead",
      isManagement: false,
      isSenior: true,
      minYearsExpected: 5,
    };
  }

  // 5. Junior / Entry-level / Graduate
  if (
    type === "JUNIOR" ||
    /\b(?:junior|jr\.?|débutant|debutant|entry[- ]level|associate|graduate|jeune diplômé|jeune diplome)\b/i.test(title) ||
    /\b(?:0[- ]2\s+ans?|0[- ]2\s+years?|première expérience|premiere experience|débutant accepté)\b/i.test(desc)
  ) {
    return {
      level: "junior",
      label: "Junior / Débutant (0-2 ans)",
      isManagement: false,
      isSenior: false,
      minYearsExpected: 0,
    };
  }

  // 6. Default for standard engineer positions (e.g. "Software Engineer", "Fullstack Developer")
  return {
    level: "mid",
    label: "Confirmé / Intermédiaire (2-4 ans)",
    isManagement: false,
    isSenior: false,
    minYearsExpected: 2,
  };
}

/**
 * Detects candidate's verified seniority level from profile and raw CV data.
 * Never infers unverified years of experience or management background.
 */
export function detectCandidateSeniority(
  candidate?: CandidateSeniorityInput | null
): CandidateSeniorityDetection {
  if (!candidate) {
    return {
      level: "student",
      label: "Étudiant (Non renseigné)",
      isStudent: true,
      verifiedYearsOfExperience: 0,
      hasManagementExperience: false,
    };
  }

  const rawCv = (candidate.rawCvText || "").toLowerCase();
  const degree = (candidate.degree || "").toLowerCase();
  const school = (candidate.school || "").toLowerCase();

  // 1. Student indicators
  const isStudent =
    Boolean(school) ||
    /\b(?:licence|master|mastère|cycle ingénieur|école|faculté|université|esprit|insat|essec|isg|isi)\b/i.test(degree) ||
    /\b(?:étudiant|etudiant|élève|3ème année|3e année|troisième année|deuxième année|1ère année|recherche un stage|stage pfe|formation académique)\b/i.test(rawCv);

  // 2. Experience verification
  let verifiedYears = 0;
  let hasManagement = false;

  if (Array.isArray(candidate.experience) && candidate.experience.length > 0) {
    for (const exp of candidate.experience) {
      const expTitle = (exp.title || "").toLowerCase();
      if (/\b(?:manager|lead|responsable|directeur|head of)\b/i.test(expTitle)) {
        hasManagement = true;
      }
      const duration = (exp.duration || "").toLowerCase();
      const matchYears = duration.match(/(\d+)\s*(?:an|yr|year)/);
      if (matchYears) {
        verifiedYears += parseInt(matchYears[1], 10);
      } else {
        verifiedYears += 0.5;
      }
    }
  } else {
    const hasFormalWorkSection =
      /\b(?:expériences? professionnelles?|professional experience|parcours professionnel)\b/i.test(rawCv) &&
      !/\b(?:aucun|sans expérience professionnelle)\b/i.test(rawCv);

    if (!hasFormalWorkSection) {
      verifiedYears = 0;
      hasManagement = false;
    }
  }

  if (isStudent && verifiedYears === 0) {
    return {
      level: "student",
      label: "Étudiant (En cours de cursus)",
      isStudent: true,
      verifiedYearsOfExperience: 0,
      hasManagementExperience: false,
    };
  }

  if (verifiedYears >= 5) {
    return {
      level: "senior",
      label: "Senior (5+ ans)",
      isStudent: false,
      verifiedYearsOfExperience: verifiedYears,
      hasManagementExperience: hasManagement,
    };
  }

  if (verifiedYears >= 2) {
    return {
      level: "mid",
      label: "Confirmé (2-4 ans)",
      isStudent: false,
      verifiedYearsOfExperience: verifiedYears,
      hasManagementExperience: hasManagement,
    };
  }

  return {
    level: "entry_level",
    label: "Jeune Diplômé / Débutant",
    isStudent: isStudent,
    verifiedYearsOfExperience: verifiedYears,
    hasManagementExperience: false,
  };
}

export interface StaleDraftDetection {
  hasStaleClaims: boolean;
  unsupportedClaimsFound: string[];
}

/**
 * Inspects a draft for stale, generic, or hallucinated claims created before the seniority fix,
 * such as claiming "solide expertise", "gestion de projets techniques", or unverified management.
 */
export function detectStaleDraftClaims(
  text: string,
  candidate: CandidateSeniorityInput,
  opportunity?: OpportunitySeniorityInput | null
): StaleDraftDetection {
  if (!text) {
    return { hasStaleClaims: false, unsupportedClaimsFound: [] };
  }

  const candSen = detectCandidateSeniority(candidate);
  const targetSen = opportunity ? detectOpportunitySeniority(opportunity) : null;
  const unsupportedClaimsFound: string[] = [];

  // Check 1: "solide expertise" / "solid expertise" for student / entry-level
  if (candSen.isStudent || candSen.level === "student" || candSen.level === "entry_level") {
    if (/\b(?:solide|forte|grande|haute)\s+expertise\b/i.test(text) || /\bsolid\s+expertise\b/i.test(text)) {
      unsupportedClaimsFound.push("Prétention de « solide expertise » non attestée pour un profil étudiant");
    }
  }

  // Check 2: "gestion de projet" / "project management" without verified PM background
  const cvText = (candidate.rawCvText || "").toLowerCase();
  const hasVerifiedProjectManagement =
    /\b(?:chef\s+de\s+projet|project\s+manager|scrum\s+master|pmp|gestionnaire\s+de\s+projet)\b/i.test(cvText);

  if (!hasVerifiedProjectManagement) {
    if (/\b(?:gestion\s+de\s+projets?\s+techniques?|gestion\s+de\s+projets?|project\s+management|pilotage\s+de\s+projets?|piloter\s+des\s+solutions\s+informatiques)\b/i.test(text)) {
      unsupportedClaimsFound.push("Prétention de gestion de projets techniques ou pilotage non documentée dans le CV");
    }
  }

  // Check 3: Management claims for student on Manager role
  if (!candSen.hasManagementExperience && (candSen.isStudent || candSen.level === "student")) {
    if (/\b(?:ayant\s+managé|expérience\s+managériale|piloter\s+des\s+équipes|conduite\s+d'équipes|encadrement\s+d'ingénieurs)\b/i.test(text)) {
      unsupportedClaimsFound.push("Revendication d'expérience managériale ou d'encadrement d'équipe");
    }
    if (targetSen && (targetSen.isManagement || targetSen.isSenior)) {
      if (/\b(?:pour\s+le\s+poste\s+de|au\s+poste\s+de)\s+Engineering\s+Manager\b/i.test(text)) {
        unsupportedClaimsFound.push("Formulation directe « au poste de Engineering Manager » sans humilité étudiante");
      }
    }
  }

  // Check 4: Unverified years of experience for student
  if (candSen.verifiedYearsOfExperience === 0 && candSen.isStudent) {
    if (/\b\d+\s+(?:ans|années?)\s+d'expérience\b/i.test(text)) {
      unsupportedClaimsFound.push("Années d'expérience professionnelle non vérifiées");
    }
  }

  // Check 5: Contradictory calendar claims when candidate is only available later (e.g. 2027)
  const candAvail = extractCandidateAvailability(candidate as unknown as CandidateData);
  const oppTarget = detectOpportunityTargetPeriod(opportunity as unknown as OpportunityData);
  if (candAvail?.year && oppTarget?.targetYear && candAvail.year > oppTarget.targetYear) {
    // If text claims to be applying directly to or available for the earlier session without candidate clarification
    if (
      /\bprogramme\s+(?:de\s+stages?\s+)?PFE\s+2026\b/i.test(text) ||
      /\b(?:pour\s+la\s+session\s+(?:PFE\s+)?2026|session\s+(?:PFE\s+)?2026)\b/i.test(text) ||
      /\bStages?\s+PFE\s+2026\b/i.test(text)
    ) {
      unsupportedClaimsFound.push(
        "Contradiction de calendrier : le texte affirme postuler au programme ou à la session 2026 alors que votre disponibilité CV est " +
          candAvail.statedText
      );
    }

    // Check 6: Inventing an unannounced future programme (e.g. "programme PFE 2027", "session PFE 2027")
    if (
      /\bprogramme\s+(?:de\s+stages?\s+)?PFE\s+202[7-9]\b/i.test(text) ||
      /\b(?:pour\s+la\s+session\s+(?:PFE\s+)?202[7-9]|session\s+(?:PFE\s+)?202[7-9]|au\s+titre\s+de\s+la\s+session\s+202[7-9])\b/i.test(
        text
      ) ||
      /\bStages?\s+PFE\s+202[7-9]\b/i.test(text)
    ) {
      unsupportedClaimsFound.push(
        "Affirmation non vérifiée : mention d'un programme ou d'une session PFE 2027 non encore annoncée officiellement"
      );
    }
  }

  return {
    hasStaleClaims: unsupportedClaimsFound.length > 0,
    unsupportedClaimsFound,
  };
}

/**
 * Validates and normalizes seniority, experience, expertise, and relocation claims in email drafts.
 * Intercepts hallucinations like "solide expertise", "gestion de projets techniques",
 * "fort de mon expérience managériale", or unverified foreign locations.
 */
export function validateAndNormalizeSeniorityClaims(
  text: string,
  candidate: CandidateSeniorityInput,
  opportunity?: OpportunitySeniorityInput | null
): string {
  if (!text) return text;

  const candSen = detectCandidateSeniority(candidate);
  const targetSen = opportunity ? detectOpportunitySeniority(opportunity) : null;
  let validated = text;

  // 1. If candidate is a student with zero management experience, remove fabricated management claims
  if (!candSen.hasManagementExperience && (candSen.isStudent || candSen.level === "student" || candSen.level === "entry_level" || (targetSen && targetSen.isManagement))) {
    validated = validated
      .replace(
        /\b(?:fort\s+de\s+(?:mes\s+)?(?:\d+|plusieurs)\s+(?:ans|années?)\s+d'expérience\s+(?:en\s+tant\s+que\s+manager|managériale|dans\s+le\s+management))\b/gi,
        "fort de mes réalisations académiques et projets pratiques"
      )
      .replace(
        /\b(?:ayant\s+(?:managé|dirigé|encadré)\s+(?:une\s+équipe|des\s+développeurs|des\s+ingénieurs)(?:[^\n,.]*))\b/gi,
        "ayant collaboré au sein de projets d'équipe sous Git"
      )
      .replace(
        /\b(?:mon\s+expérience\s+managériale|mes\s+compétences\s+en\s+people\s+management)\b/gi,
        "mon sérieux et mes compétences en développement logiciel"
      )
      .replace(
        /\b(?:ma\s+capacité\s+à\s+piloter\s+des\s+équipes\s+d'ingénierie)\b/gi,
        "ma capacité à concevoir des solutions logicielles de qualité"
      )
      .replace(
        /\b(?:en\s+tant\s+qu'Engineering\s+Manager\s+confirmé)\b/gi,
        "dans le cadre de mon profil d'étudiant orienté développement logiciel"
      );
  }

  // 2. Remove unverified "solide expertise" / "solid expertise" claims if candidate is student or entry-level
  if (candSen.isStudent || candSen.level === "student" || candSen.level === "entry_level") {
    validated = validated
      .replace(
        /\b(je\s+développe)\s+une\s+(?:solide|forte|grande|haute)\s+expertise\b/gi,
        "$1 de solides compétences pratiques"
      )
      .replace(
        /\b(j'ai\s+acquis)\s+une\s+(?:solide|forte|grande|haute)\s+expertise\b/gi,
        "$1 de solides compétences pratiques"
      )
      .replace(
        /\b(fort\s+d')une\s+(?:solide|forte|grande|haute)\s+expertise\b/gi,
        "$1une solide pratique technique"
      )
      .replace(
        /\bune\s+(?:solide|forte|grande|haute)\s+expertise\b/gi,
        "de solides compétences pratiques"
      )
      .replace(
        /\b(?:solide|forte|haute)\s+expertise\b/gi,
        "compétences pratiques approfondies"
      )
      .replace(
        /\bsolid\s+expertise\b/gi,
        "practical software engineering foundation"
      );
  }

  // 3. Remove unverified project management / "gestion de projets techniques" claims if candidate CV has no verified PM role
  const cvText = (candidate.rawCvText || "").toLowerCase();
  const hasVerifiedProjectManagement =
    /\b(?:chef\s+de\s+projet|project\s+manager|scrum\s+master|pmp|gestionnaire\s+de\s+projet)\b/i.test(cvText);

  if (!hasVerifiedProjectManagement) {
    validated = validated
      .replace(
        /\b(?:(?:en\s+)?gestion\s+de\s+projets?\s+techniques?)\b/gi,
        "en développement de solutions logicielles"
      )
      .replace(
        /\b(?:(?:en\s+)?gestion\s+de\s+projets?)\b/gi,
        "dans la réalisation de projets pratiques"
      )
      .replace(
        /\b(?:(?:in\s+)?technical\s+project\s+management)\b/gi,
        "in software solution development"
      )
      .replace(
        /\b(?:(?:in\s+)?project\s+management)\b/gi,
        "in hands-on software development"
      )
      .replace(
        /\b(?:(?:ma\s+)?capacité\s+à\s+piloter\s+des\s+solutions\s+informatiques)\b/gi,
        "mon investissement dans le développement de solutions logicielles fiables"
      )
      .replace(
        /\b(?:piloter\s+des\s+projets\s+techniques?)\b/gi,
        "contribuer activement à des projets logiciels"
      );
  }

  // 4. Remove unverified years of experience claims if student
  if (candSen.verifiedYearsOfExperience === 0 && candSen.isStudent) {
    validated = validated
      .replace(
        /\b(?:fort\s+de\s+(?:mes\s+)?(?:\d+|plusieurs)\s+(?:ans|années?)\s+d'expérience(?:\s+professionnelle)?(?:[^\n,.]*))\b/gi,
        "fort de mes projets pratiques et réalisations académiques"
      )
      .replace(
        /\b(?:avec\s+(?:plus\s+de\s+)?(?:\d+|plusieurs)\s+(?:ans|années?)\s+d'expérience(?:\s+professionnelle)?)\b/gi,
        "avec une solide pratique acquise au fil de mes projets"
      );
  }

  // 5. If role is manager and candidate is student, ensure direct manager entitlement is softened
  if (targetSen && (targetSen.isManagement || targetSen.isSenior) && (candSen.isStudent || candSen.level === "student")) {
    validated = validated
      .replace(
        /(?:^|\n)\s*Candidature\s+(?:pour\s+le\s+poste\s+de|au\s+poste\s+de)\s+(Engineering\s+Manager[^\n—–-]*)/gi,
        "Candidature : $1"
      )
      .replace(
        /\b(?:pour\s+le\s+poste\s+de|au\s+poste\s+de)\s+(Engineering\s+Manager[^\n—–-]*)/gi,
        "pour l'opportunité $1"
      );
  }

  // 6. Remove unsupported relocation / remote claims
  // Candidate location from profile: e.g. Ariana, Tunisie
  const candidateCity = (candidate.city || "").trim();
  const candidateCountry = (candidate.country || "").trim();
  const verifiedLocation = [candidateCity, candidateCountry].filter(Boolean).join(", ");

  // If text mentions being based in a different foreign city/country not in profile
  if (verifiedLocation) {
    validated = validated.replace(
      /\b(?:actuellement\s+basé\s+(?:à|au|en)\s+(?:Paris|Londres|London|Berlin|New\s+York|Montréal|Canada|France|Royaume-Uni|USA|États-Unis))\b/gi,
      `basé à ${verifiedLocation}`
    );
    validated = validated.replace(
      /\b(?:disponible\s+immédiatement\s+pour\s+(?:une\s+relocalisation|un\s+déménagement|déménager|se\s+relocaliser)(?:\s+(?:à|au|en)\s+[A-Za-zÀ-ÖØ-öø-ÿ\s-]+)?)\b/gi,
      "disponible pour collaborer à distance ou selon les modalités convenues"
    );
  }

  return validated;
}
