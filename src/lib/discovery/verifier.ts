import type {
  VerificationEvidence,
  VerificationStatus,
} from "./types.ts";
import { normalizeCanonicalUrl } from "./normalizer.ts";
import { resolveSourcePlatform, type SourcePlatformInfo } from "./source-resolver.ts";

// Closed and filled posting phrases
const CLOSED_SIGNALS = [
  /\bthis\s+position\s+has\s+been\s+filled\b/i,
  /\bno\s+longer\s+accepting\s+applications\b/i,
  /\bapplications\s+(are\s+)?closed\b/i,
  /\bjob\s+(has\s+)?expired\b/i,
  /\bthis\s+(?:job|offer|position|posting|vacancy)\s+is\s+no\s+longer\s+(?:available|active|open|accepting\s+applications)\b/i,
  /\bvacancy\s+(is\s+)?closed\b/i,
  /\bposting\s+closed\b/i,
  /\b(?:ce\s+poste|cette\s+offre)\s+a\s+été\s+pourvu(?:e)?\b/i,
  /\b(?:poste|offre)\s+pourvu(?:e)?\b/i,
  /\bles\s+candidatures\s+sont\s+closes\b/i,
  /\bcandidatures\s+fermées\b/i,
  /\boffre\s+(d'emploi\s+)?expirée\b/i,
  /\bcette\s+offre\s+(?:d['’]emploi\s+)?(?:n'est\s+plus\s+disponible|est\s+clôturée|est\s+fermée|est\s+expirée)\b/i,
  /\brecrutement\s+terminé\b/i,
  /\bclôture\s+des\s+candidatures\b/i,
  /\boffre\s+clôturée\b/i,
  /تم\s+إغلاق\s+التقديم/,
  /الوظيفة\s+لم\s+تعد\s+متاحة/,
];

// Fraudulent recruitment & scam patterns
const SCAM_SIGNALS = [
  /\bfrais\s+de\s+dossier\s+(obligatoire|à\s+payer)\b/i,
  /\bpayer\s+pour\s+postuler\b/i,
  /\bfrais\s+d'inscription\s+préalable\b/i,
  /\bwestern\s+union\b/i,
  /\bmoneygram\b/i,
  /\bwire\s+transfer\s+before\s+interview\b/i,
  /\bsend\s+money\s+for\s+training\b/i,
  /\bvisa\s+processing\s+fee\s+to\s+personal\s+account\b/i,
  /\bargent\s+facile\s+sans\s+compétence\b/i,
  /\bgagnez\s+\d+\s*\$\s+par\s+jour\s+en\s+cliquant\b/i,
];

// Search results & aggregator index indicators (not a specific job posting)
const GENERIC_AGGREGATOR_PATTERNS = [
  /\/search\b/i,
  /\/jobs\?keyword=/i,
  /\/recherche\?/i,
  /\/offres-emploi\?page=/i,
  /\/browse\//i,
  /\/categories\//i,
];

export interface FreshnessRules {
  staleDaysPfe: number;
  staleDaysGeneral: number;
}

export function getFreshnessRules(customRules?: Partial<FreshnessRules>): FreshnessRules {
  const envPfe = process.env.OPPORTUNITY_STALE_PFE_DAYS ? parseInt(process.env.OPPORTUNITY_STALE_PFE_DAYS, 10) : NaN;
  const envGeneral = process.env.OPPORTUNITY_STALE_JOB_DAYS ? parseInt(process.env.OPPORTUNITY_STALE_JOB_DAYS, 10) : NaN;

  return {
    staleDaysPfe: customRules?.staleDaysPfe ?? (!isNaN(envPfe) && envPfe > 0 ? envPfe : 120),
    staleDaysGeneral: customRules?.staleDaysGeneral ?? (!isNaN(envGeneral) && envGeneral > 0 ? envGeneral : 90),
  };
}

export function isOpportunityStale(
  datePosted: string | null | undefined,
  typeOrTitle?: string | null,
  customRules?: Partial<FreshnessRules>,
  lastCheckedAt?: string | null | undefined
): { isStale: boolean; daysOld?: number; thresholdDays: number; reason?: string; needsRecheck?: boolean } {
  const isPfe =
    (typeOrTitle || "").toUpperCase() === "PFE" ||
    /\bpfe\b/i.test(typeOrTitle || "") ||
    /\bstage\s+de\s+fin\s+d['’]études\b/i.test(typeOrTitle || "");
  const rules = getFreshnessRules(customRules);
  const thresholdDays = isPfe ? rules.staleDaysPfe : rules.staleDaysGeneral;

  if (datePosted) {
    try {
      const posted = new Date(datePosted);
      if (!isNaN(posted.getTime())) {
        const daysOld = Math.round((Date.now() - posted.getTime()) / (1000 * 60 * 60 * 24));
        if (daysOld > thresholdDays) {
          return {
            isStale: true,
            daysOld,
            thresholdDays,
            reason: `Offre publiée il y a plus de ${thresholdDays} jours (${daysOld} j).`,
            needsRecheck: true,
          };
        }
        return { isStale: false, daysOld, thresholdDays, needsRecheck: false };
      }
    } catch {
      // Ignore invalid date
    }
  }

  // If datePosted is unknown, check last_checked_at or past years in title
  if (lastCheckedAt) {
    try {
      const checked = new Date(lastCheckedAt);
      if (!isNaN(checked.getTime())) {
        const daysSinceCheck = Math.round((Date.now() - checked.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceCheck > thresholdDays) {
          return {
            isStale: true,
            daysOld: daysSinceCheck,
            thresholdDays,
            reason: `Dernière vérification il y a plus de ${thresholdDays} jours (${daysSinceCheck} j). Statut à revérifier.`,
            needsRecheck: true,
          };
        }
      }
    } catch {
      // Ignore
    }
  }

  return { isStale: false, thresholdDays, needsRecheck: !datePosted };
}

export interface VerificationInput {
  title: string;
  sourceUrl: string;
  sourceProvider: string;
  sourceProviderName?: string;
  sourcePlatform?: string;
  companyName: string;
  companyWebsite?: string;
  description: string;
  location?: string;
  validThrough?: string | null;
  datePosted?: string | null;
  dateOpening?: string | null;
  dateModified?: string | null;
  updatedAtSource?: string | null;
  closedAt?: string | null;
  applicationUrl?: string;
  directApplicationUrl?: string;
  pageContentSnippet?: string;
  httpStatusCode?: number;
  isDirectApiFeed?: boolean;
  isSpontaneousLead?: boolean;
  isSpecificVacancyAnnouncement?: boolean;
  type?: string;
  freshnessRules?: Partial<FreshnessRules>;
}

export interface VerificationResult {
  status: VerificationStatus;
  statusReason: string;
  evidence: VerificationEvidence;
  isStale: boolean;
}

function makeEvidence(
  status: VerificationStatus,
  base: Partial<VerificationEvidence> & {
    urlReachable: boolean;
    isSpecificListing: boolean;
    employerCorroborated: boolean;
    noClosedOrExpiredSignals: boolean;
    noSuspiciousScamSignals: boolean;
  },
  input: VerificationInput,
  resolvedPlatform: SourcePlatformInfo,
  notes: string[],
  signalsDetected: string[],
  isStale: boolean,
  staleReason?: string
): VerificationEvidence {
  const publishedAt = input.datePosted || null;
  const isPublicationDateUnknown = !publishedAt;
  const isAvailabilityUnconfirmed = status !== "verified_open";
  const directAppUrl = input.directApplicationUrl || input.applicationUrl;

  return {
    urlReachable: base.urlReachable,
    httpStatusCode: base.httpStatusCode ?? input.httpStatusCode ?? 200,
    isSpecificListing: base.isSpecificListing,
    employerCorroborated: base.employerCorroborated,
    corroborationMethod:
      base.corroborationMethod ||
      (base.employerCorroborated ? "official_website_provided" : "unconfirmed"),
    datePostedVerified: Boolean(input.datePosted),
    deadlineVerified: base.deadlineVerified ?? Boolean(input.validThrough),
    applicationRouteVerified:
      base.applicationRouteVerified ?? Boolean(directAppUrl || input.sourceUrl),
    noClosedOrExpiredSignals: base.noClosedOrExpiredSignals,
    noSuspiciousScamSignals: base.noSuspiciousScamSignals,
    signalsDetected,
    notes,
    checkedAt: new Date().toISOString(),
    dateOpening: input.dateOpening,
    dateModified: input.dateModified,
    directApplicationUrl: directAppUrl,
    sourcePlatformName: resolvedPlatform.platformName,
    sourcePlatform: resolvedPlatform.platformName,
    sourceUrl: input.sourceUrl,
    applicationUrl: directAppUrl || input.sourceUrl,
    publishedAt,
    updatedAtSource: input.updatedAtSource || null,
    closedAt:
      input.closedAt ||
      (status === "closed" || status === "expired"
        ? input.closedAt || input.validThrough || new Date().toISOString()
        : null),
    isPublicationDateUnknown,
    isAvailabilityUnconfirmed,
    isStale,
    staleReason,
  };
}

/**
 * Executes a multi-stage verification pipeline for any discovered opportunity.
 * Never labels a listing "verified_open" merely on HTTP 200.
 */
export function verifyOpportunity(input: VerificationInput): VerificationResult {
  const notes: string[] = [];
  const signalsDetected: string[] = [];

  const combinedContent = `${input.title} ${input.description} ${input.pageContentSnippet || ""}`.toLowerCase();
  const canonical = normalizeCanonicalUrl(input.sourceUrl);

  const resolvedPlatform = resolveSourcePlatform({
    sourceUrl: input.sourceUrl,
    applicationUrl: input.directApplicationUrl || input.applicationUrl,
    sourceProvider: input.sourceProvider,
    declaredPlatform: input.sourcePlatform || input.sourceProviderName,
    companyWebsite: input.companyWebsite,
    isSpontaneousLead: Boolean(input.isSpontaneousLead),
  });

  if (!input.datePosted) {
    notes.push(
      "Date de publication d'origine inconnue. Disponibilité à confirmer directement auprès de l'employeur."
    );
  }

  // 1. URL Reachability Check
  const httpStatus = input.httpStatusCode ?? 200;
  const urlReachable = httpStatus >= 200 && httpStatus < 400;

  if (!urlReachable) {
    notes.push(`Source inaccessible (Code HTTP: ${httpStatus}). À revérifier.`);
    signalsDetected.push("HTTP_ERROR");
    return {
      status: "broken_source",
      statusReason: `L'URL source ne répond plus (code HTTP ${httpStatus}).`,
      evidence: makeEvidence(
        "broken_source",
        {
          urlReachable: false,
          httpStatusCode: httpStatus,
          isSpecificListing: false,
          employerCorroborated: false,
          datePostedVerified: false,
          deadlineVerified: false,
          applicationRouteVerified: false,
          noClosedOrExpiredSignals: false,
          noSuspiciousScamSignals: true,
        },
        input,
        resolvedPlatform,
        notes,
        signalsDetected,
        true
      ),
      isStale: true,
    };
  }

  // 1b. Upcoming Opening Date Check
  if (input.dateOpening) {
    try {
      const openDate = new Date(input.dateOpening);
      if (!isNaN(openDate.getTime()) && openDate.getTime() > Date.now()) {
        signalsDetected.push("UPCOMING_OPENING_DATE");
        notes.push(
          `Offre ou vague de recrutement à venir (ouverture prévue le ${openDate.toLocaleDateString("fr-FR")}).`
        );
        return {
          status: "upcoming",
          statusReason: `Offre à venir : les candidatures ouvriront le ${openDate.toLocaleDateString("fr-FR")}.`,
          evidence: makeEvidence(
            "upcoming",
            {
              urlReachable: true,
              httpStatusCode: httpStatus,
              isSpecificListing: true,
              employerCorroborated: Boolean(input.companyWebsite),
              noClosedOrExpiredSignals: true,
              noSuspiciousScamSignals: true,
            },
            input,
            resolvedPlatform,
            notes,
            signalsDetected,
            false
          ),
          isStale: false,
        };
      }
    } catch {
      // Ignored
    }
  }

  // 2. Specific Listing vs Generic Search Results Page / Spontaneous Portal Check
  const isGenericSearch = GENERIC_AGGREGATOR_PATTERNS.some((pattern) => pattern.test(canonical));
  const isSpontaneousLead = Boolean(
    input.isSpontaneousLead ||
    input.isSpecificVacancyAnnouncement === false ||
    input.title.toLowerCase().includes("candidature spontanée") ||
    input.title.toLowerCase().includes("piste pfe") ||
    input.title.toLowerCase().includes("piste entreprise") ||
    /\/carriere\.php/i.test(canonical) ||
    /\/careers\/?$/i.test(canonical) ||
    /\/carrieres\/?$/i.test(canonical) ||
    /\/recrutement\/?$/i.test(canonical)
  );

  if (isSpontaneousLead) {
    notes.push(
      "Portail carrières de l'employeur (Candidature spontanée — aucune offre spécifique confirmée)."
    );
    signalsDetected.push("SPONTANEOUS_APPLICATION_CHANNEL");
    return {
      status: "unverified",
      statusReason:
        "Candidature spontanée — aucune offre spécifique confirmée",
      evidence: makeEvidence(
        "unverified",
        {
          urlReachable: true,
          httpStatusCode: httpStatus,
          isSpecificListing: false,
          employerCorroborated: Boolean(input.companyWebsite),
          deadlineVerified: false,
          noClosedOrExpiredSignals: true,
          noSuspiciousScamSignals: true,
        },
        input,
        resolvedPlatform,
        notes,
        signalsDetected,
        false
      ),
      isStale: false,
    };
  }

  const isSpecificListing = !isGenericSearch && input.title.trim().length >= 4;

  if (!isSpecificListing) {
    notes.push(
      "L'URL pointe vers une page de recherche générique ou un agrégateur d'index, non vers une offre spécifique."
    );
    signalsDetected.push("GENERIC_SEARCH_URL");
    return {
      status: "unverified",
      statusReason: "Piste de recherche non corroborée par une page d'offre univoque.",
      evidence: makeEvidence(
        "unverified",
        {
          urlReachable: true,
          httpStatusCode: httpStatus,
          isSpecificListing: false,
          employerCorroborated: false,
          datePostedVerified: false,
          deadlineVerified: false,
          applicationRouteVerified: false,
          noClosedOrExpiredSignals: true,
          noSuspiciousScamSignals: true,
        },
        input,
        resolvedPlatform,
        notes,
        signalsDetected,
        false
      ),
      isStale: false,
    };
  }

  // 3. Scam & Fraud Detection
  let noSuspiciousScamSignals = true;
  for (const scamPattern of SCAM_SIGNALS) {
    if (scamPattern.test(combinedContent)) {
      noSuspiciousScamSignals = false;
      signalsDetected.push(`SCAM_MATCH: ${scamPattern.source}`);
      notes.push("Signal suspect de frais ou de sollicitation financière non conforme détecté.");
    }
  }

  if (!noSuspiciousScamSignals) {
    return {
      status: "rejected",
      statusReason:
        "Offre rejetée : signaux suspects de fraude ou de demande de paiement détectés.",
      evidence: makeEvidence(
        "rejected",
        {
          urlReachable: true,
          httpStatusCode: httpStatus,
          isSpecificListing: true,
          employerCorroborated: false,
          datePostedVerified: false,
          deadlineVerified: false,
          applicationRouteVerified: false,
          noClosedOrExpiredSignals: false,
          noSuspiciousScamSignals: false,
        },
        input,
        resolvedPlatform,
        notes,
        signalsDetected,
        false
      ),
      isStale: false,
    };
  }

  // 4. Closed / Filled Job Detection
  let noClosedOrExpiredSignals = true;
  for (const closedPattern of CLOSED_SIGNALS) {
    if (closedPattern.test(combinedContent)) {
      noClosedOrExpiredSignals = false;
      signalsDetected.push(`CLOSED_MATCH: ${closedPattern.source}`);
      notes.push("Mention explicite indiquant que les candidatures sont closes ou le poste pourvu.");
    }
  }

  if (!noClosedOrExpiredSignals) {
    return {
      status: "closed",
      statusReason:
        "Offre clôturée : l'employeur ou la plateforme indique que le poste est pourvu ou les candidatures closes.",
      evidence: makeEvidence(
        "closed",
        {
          urlReachable: true,
          httpStatusCode: httpStatus,
          isSpecificListing: true,
          employerCorroborated: Boolean(input.companyWebsite),
          applicationRouteVerified: false,
          noClosedOrExpiredSignals: false,
          noSuspiciousScamSignals: true,
        },
        input,
        resolvedPlatform,
        notes,
        signalsDetected,
        true
      ),
      isStale: true,
    };
  }

  // 5. Expiration & Deadline Validation
  let deadlineVerified = false;
  if (input.validThrough) {
    try {
      const deadlineDate = new Date(input.validThrough);
      if (!isNaN(deadlineDate.getTime())) {
        deadlineVerified = true;
        if (deadlineDate.getTime() < Date.now()) {
          notes.push(`Date limite de candidature dépassée (${deadlineDate.toISOString().split("T")[0]}).`);
          signalsDetected.push("DEADLINE_EXPIRED");
          return {
            status: "expired",
            statusReason: `Date limite de candidature échue depuis le ${deadlineDate.toLocaleDateString("fr-FR")}.`,
            evidence: makeEvidence(
              "expired",
              {
                urlReachable: true,
                httpStatusCode: httpStatus,
                isSpecificListing: true,
                employerCorroborated: Boolean(input.companyWebsite),
                deadlineVerified: true,
                applicationRouteVerified: false,
                noClosedOrExpiredSignals: false,
                noSuspiciousScamSignals: true,
              },
              input,
              resolvedPlatform,
              notes,
              signalsDetected,
              true
            ),
            isStale: true,
          };
        }
      }
    } catch {
      // Ignored if date is unparseable
    }
  }

  // 6. Employer Corroboration
  let employerCorroborated = false;
  let corroborationMethod = "unconfirmed";

  if (input.isDirectApiFeed) {
    employerCorroborated = true;
    corroborationMethod = "direct_ats_api_partner";
    notes.push("Entreprise authentifiée via intégration API directe ATS.");
  } else if (input.companyWebsite && input.companyWebsite.startsWith("http")) {
    employerCorroborated = true;
    corroborationMethod = "official_website_provided";
    notes.push(`Entreprise corroborée par site web officiel : ${input.companyWebsite}`);
  }

  // 7. Application Route Verification
  const applicationRouteVerified = Boolean(
    (input.applicationUrl && input.applicationUrl.startsWith("http")) ||
    (input.sourceUrl && input.sourceUrl.startsWith("http"))
  );

  // 8. Posting Date Verification & Configurable Staleness Thresholds
  let datePostedVerified = false;
  let isStale = false;
  let staleReason: string | undefined = undefined;

  const isPfeProgram =
    (input.type || "").toUpperCase() === "PFE" ||
    /\bpfe\b/i.test(input.title) ||
    /\bstage\s+de\s+fin\s+d['’]études\b/i.test(input.title);

  const isLongRunningProgram =
    /\b(?:book|programme|campagne|promotion)\b/i.test(input.title) ||
    /\b(?:book|programme)\b/i.test(input.description || "");

  const rules = getFreshnessRules(input.freshnessRules);
  const staleDaysThreshold = isPfeProgram ? rules.staleDaysPfe : rules.staleDaysGeneral;

  if (input.datePosted) {
    try {
      const posted = new Date(input.datePosted);
      if (!isNaN(posted.getTime())) {
        datePostedVerified = true;
        const daysOld = (Date.now() - posted.getTime()) / (1000 * 60 * 60 * 24);
        if (daysOld > staleDaysThreshold) {
          isStale = true;
          staleReason = `Offre publiée il y a plus de ${staleDaysThreshold} jours (${Math.round(daysOld)} j).`;
          notes.push(`${staleReason} Vigilance sur la disponibilité.`);
          if (isLongRunningProgram) {
            notes.push(
              "Programme annuel / PFE Book de longue durée : l'offre reste répertoriée avec avertissement de fraîcheur."
            );
          }
        }
      }
    } catch {
      // Ignored
    }
  }

  // 9. Synthesize Final Verification Status
  // Rule: Never label "verified_open" merely because URL returned 200 or company website exists.
  // "verified_open" STRICTLY requires:
  // - Direct ATS API / official partner integration feed (isDirectApiFeed === true)
  // - Reached and active (HTTP 200)
  // - Specific listing
  // - No closed or expired signals
  // - Not stale (> 90/120 days)
  if (input.isDirectApiFeed && isSpecificListing && urlReachable && !isStale) {
    notes.push(
      "Vérification rigoureuse réussie : offre active confirmée directement par le flux API ATS officiel."
    );
    return {
      status: "verified_open",
      statusReason: "Offre vérifiée active en temps réel via l'API officielle de recrutement.",
      evidence: makeEvidence(
        "verified_open",
        {
          urlReachable: true,
          httpStatusCode: httpStatus,
          isSpecificListing: true,
          employerCorroborated: true,
          corroborationMethod: "direct_ats_api_partner",
          datePostedVerified,
          deadlineVerified,
          applicationRouteVerified: true,
          noClosedOrExpiredSignals: true,
          noSuspiciousScamSignals: true,
        },
        input,
        resolvedPlatform,
        notes,
        signalsDetected,
        false
      ),
      isStale: false,
    };
  }

  // Long-running recruitment programs (e.g. Medianet PFE Book) that are corroborated
  // remain likely_open even if published > 120 days ago, with stale flag
  if (
    isSpecificListing &&
    employerCorroborated &&
    applicationRouteVerified &&
    isLongRunningProgram &&
    isStale
  ) {
    notes.push(
      "Programme de recrutement annuel ou catalogue PFE : publication ancienne nécessitant une confirmation auprès de l'employeur."
    );
    signalsDetected.push("LONG_RUNNING_PROGRAM_STALE_SIGNAL");
    return {
      status: "likely_open",
      statusReason:
        "Programme de recrutement annuel / PFE Book de longue durée (date ancienne, vérification conseillée).",
      evidence: makeEvidence(
        "likely_open",
        {
          urlReachable: true,
          httpStatusCode: httpStatus,
          isSpecificListing: true,
          employerCorroborated: true,
          corroborationMethod,
          datePostedVerified,
          deadlineVerified,
          applicationRouteVerified,
          noClosedOrExpiredSignals: true,
          noSuspiciousScamSignals: true,
        },
        input,
        resolvedPlatform,
        notes,
        signalsDetected,
        true,
        staleReason
      ),
      isStale: true,
    };
  }

  // If reachable, specific listing, and employer website corroborated, but not a direct ATS API feed:
  if (isSpecificListing && employerCorroborated && applicationRouteVerified && !isStale) {
    notes.push(
      "Offre plausible et accessible avec site employeur officiel, sous réserve de confirmation d'ouverture par l'entreprise."
    );
    return {
      status: "likely_open",
      statusReason: "Offre accessible et en cours de diffusion sur le web (employeur corroboré).",
      evidence: makeEvidence(
        "likely_open",
        {
          urlReachable: true,
          httpStatusCode: httpStatus,
          isSpecificListing: true,
          employerCorroborated: true,
          corroborationMethod,
          datePostedVerified,
          deadlineVerified,
          applicationRouteVerified,
          noClosedOrExpiredSignals: true,
          noSuspiciousScamSignals: true,
        },
        input,
        resolvedPlatform,
        notes,
        signalsDetected,
        false
      ),
      isStale: false,
    };
  }

  // If employer is unconfirmed, generic, or stale
  notes.push("Offre non vérifiée : source externe non confirmée par une intégration directe.");
  if (isStale) signalsDetected.push(`OLDER_THAN_${staleDaysThreshold}_DAYS`);

  return {
    status: "unverified",
    statusReason:
      "Offre non vérifiée : informations à confirmer directement auprès de l'employeur.",
    evidence: makeEvidence(
      "unverified",
      {
        urlReachable: true,
        httpStatusCode: httpStatus,
        isSpecificListing,
        employerCorroborated,
        corroborationMethod,
        datePostedVerified,
        deadlineVerified,
        applicationRouteVerified,
        noClosedOrExpiredSignals: true,
        noSuspiciousScamSignals: true,
      },
      input,
      resolvedPlatform,
      notes,
      signalsDetected,
      isStale,
      staleReason
    ),
    isStale,
  };
}
