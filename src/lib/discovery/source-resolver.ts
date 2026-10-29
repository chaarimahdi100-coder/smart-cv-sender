/**
 * Source Platform & Origin Attribution Resolver.
 *
 * Accurately determines the true originating platform of an opportunity announcement
 * and cleanly distinguishes source origin from application destination.
 *
 * Rules:
 * - Found in LinkedIn -> Source: LinkedIn (with original post URL).
 * - Found in Tanitjobs -> Source: Tanitjobs (with original listing URL).
 * - Found in Keejob -> Source: Keejob (with original listing URL).
 * - Found in Fabskill -> Source: Fabskill (with original listing URL).
 * - Found in Facebook -> Source: Facebook (with original post/page URL).
 * - Found on employer careers page -> Source: Site officiel de l'employeur.
 * - An opportunity pointing to an employer site for application (e.g. rh.medianet.tn)
 *   that was announced on LinkedIn MUST retain "LinkedIn" as its source platform!
 * - If the source cannot be determined, label "Source d'origine inconnue" (never guess).
 */

export interface SourcePlatformInfo {
  platformName: string;
  platformKey: string;
  displayLabel: string;
  isOfficialEmployerSite: boolean;
  isAggregator: boolean;
  isSocialOrProfessionalNetwork: boolean;
  sourceUrl: string;
  applicationUrl: string;
}

export interface ResolveSourcePlatformParams {
  sourceUrl?: string | null;
  applicationUrl?: string | null;
  sourceProvider?: string | null;
  declaredPlatform?: string | null;
  sourcePlatform?: string | null;
  companyWebsite?: string | null;
  companyName?: string | null;
  isSpontaneousLead?: boolean;
}

const KNOWN_PLATFORMS: Array<{
  key: string;
  name: string;
  displayLabel: string;
  domains: string[];
  isSocialOrNetwork: boolean;
  isAggregator: boolean;
  isAts: boolean;
}> = [
  {
    key: "linkedin",
    name: "LinkedIn",
    displayLabel: "LinkedIn",
    domains: ["linkedin.com", "lnkd.in"],
    isSocialOrNetwork: true,
    isAggregator: false,
    isAts: false,
  },
  {
    key: "tanitjobs",
    name: "Tanitjobs",
    displayLabel: "Tanitjobs",
    domains: ["tanitjobs.com"],
    isSocialOrNetwork: false,
    isAggregator: true,
    isAts: false,
  },
  {
    key: "keejob",
    name: "Keejob",
    displayLabel: "Keejob",
    domains: ["keejob.com"],
    isSocialOrNetwork: false,
    isAggregator: true,
    isAts: false,
  },
  {
    key: "fabskill",
    name: "Fabskill",
    displayLabel: "Fabskill",
    domains: ["fabskill.com"],
    isSocialOrNetwork: false,
    isAggregator: true,
    isAts: false,
  },
  {
    key: "facebook",
    name: "Facebook",
    displayLabel: "Facebook",
    domains: ["facebook.com", "fb.com", "fb.watch"],
    isSocialOrNetwork: true,
    isAggregator: false,
    isAts: false,
  },
  {
    key: "greenhouse",
    name: "Greenhouse ATS",
    displayLabel: "Greenhouse ATS (Board officiel)",
    domains: ["boards.greenhouse.io", "greenhouse.io", "boards-api.greenhouse.io"],
    isSocialOrNetwork: false,
    isAggregator: false,
    isAts: true,
  },
  {
    key: "lever",
    name: "Lever ATS",
    displayLabel: "Lever ATS",
    domains: ["jobs.lever.co", "lever.co"],
    isSocialOrNetwork: false,
    isAggregator: false,
    isAts: true,
  },
  {
    key: "workable",
    name: "Workable ATS",
    displayLabel: "Workable ATS",
    domains: ["apply.workable.com", "workable.com"],
    isSocialOrNetwork: false,
    isAggregator: false,
    isAts: true,
  },
  {
    key: "smartrecruiters",
    name: "SmartRecruiters ATS",
    displayLabel: "SmartRecruiters ATS",
    domains: ["smartrecruiters.com", "jobs.smartrecruiters.com"],
    isSocialOrNetwork: false,
    isAggregator: false,
    isAts: true,
  },
  {
    key: "optioncarriere",
    name: "Optioncarriere",
    displayLabel: "Optioncarriere",
    domains: ["optioncarriere.tn", "optioncarriere.com"],
    isSocialOrNetwork: false,
    isAggregator: true,
    isAts: false,
  },
  {
    key: "emploitunisie",
    name: "Emploi Tunisie",
    displayLabel: "Emploi Tunisie",
    domains: ["emploitunisie.com"],
    isSocialOrNetwork: false,
    isAggregator: true,
    isAts: false,
  },
  {
    key: "farojob",
    name: "Farojob",
    displayLabel: "Farojob",
    domains: ["farojob.net"],
    isSocialOrNetwork: false,
    isAggregator: true,
    isAts: false,
  },
  {
    key: "google_search",
    name: "Recherche Google",
    displayLabel: "Recherche Google (Piste externe)",
    domains: ["google.com", "google.tn"],
    isSocialOrNetwork: false,
    isAggregator: false,
    isAts: false,
  },
];

function extractHostname(urlStr?: string | null): string {
  if (!urlStr) return "";
  try {
    const parsed = new URL(urlStr.startsWith("http") ? urlStr : `https://${urlStr}`);
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Resolves truthful source platform identity and attribution details.
 */
export function resolveSourcePlatform(params: ResolveSourcePlatformParams): SourcePlatformInfo {
  const {
    sourceUrl,
    applicationUrl,
    sourceProvider,
    declaredPlatform,
    sourcePlatform,
    companyWebsite,
    companyName,
    isSpontaneousLead,
  } = params;

  const effectiveDeclared = (sourcePlatform || declaredPlatform || "").trim();
  const effectiveSourceUrl = (sourceUrl || "").trim();
  const effectiveAppUrl = (applicationUrl || sourceUrl || "").trim();
  const sourceHost = extractHostname(effectiveSourceUrl);
  const companyHost = extractHostname(companyWebsite);
  const companyCleanSlug = (companyName || "")
    .toLowerCase()
    .replace(/\b(?:group|groupe|technologies|solutions|sarl|sa|inc|corp|ltd)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();

  // 1. Explicit declared platform override (if verified by evidence)
  if (effectiveDeclared.length > 0) {
    const norm = effectiveDeclared.toLowerCase();
    for (const known of KNOWN_PLATFORMS) {
      if (known.key === norm || known.name.toLowerCase() === norm) {
        return {
          platformName: known.name,
          platformKey: known.key,
          displayLabel: known.displayLabel,
          isOfficialEmployerSite: false,
          isAggregator: known.isAggregator,
          isSocialOrProfessionalNetwork: known.isSocialOrNetwork,
          sourceUrl: effectiveSourceUrl,
          applicationUrl: effectiveAppUrl,
        };
      }
    }
    if (norm.includes("officiel") || norm.includes("employeur")) {
      return {
        platformName: "Site officiel de l'employeur",
        platformKey: "employer_website",
        displayLabel: "Site officiel de l'employeur",
        isOfficialEmployerSite: true,
        isAggregator: false,
        isSocialOrProfessionalNetwork: false,
        sourceUrl: effectiveSourceUrl,
        applicationUrl: effectiveAppUrl,
      };
    }
  }

  // 2. Check source URL against known aggregator/social/network platforms
  for (const known of KNOWN_PLATFORMS) {
    if (known.domains.some((d) => sourceHost === d || sourceHost.endsWith(`.${d}`))) {
      return {
        platformName: known.name,
        platformKey: known.key,
        displayLabel: known.displayLabel,
        isOfficialEmployerSite: false,
        isAggregator: known.isAggregator,
        isSocialOrProfessionalNetwork: known.isSocialOrNetwork,
        sourceUrl: effectiveSourceUrl,
        applicationUrl: effectiveAppUrl,
      };
    }
  }

  // 3. Provider-specific provenance
  if (sourceProvider === "greenhouse_ats") {
    return {
      platformName: "Greenhouse ATS",
      platformKey: "greenhouse",
      displayLabel: "Greenhouse ATS (Board officiel)",
      isOfficialEmployerSite: false,
      isAggregator: false,
      isSocialOrProfessionalNetwork: false,
      sourceUrl: effectiveSourceUrl,
      applicationUrl: effectiveAppUrl,
    };
  }

  if (sourceProvider === "search_engine_leads") {
    return {
      platformName: "Recherche Google",
      platformKey: "google_search",
      displayLabel: "Recherche Google (Piste externe)",
      isOfficialEmployerSite: false,
      isAggregator: false,
      isSocialOrProfessionalNetwork: false,
      sourceUrl: effectiveSourceUrl,
      applicationUrl: effectiveAppUrl,
    };
  }

  // 4. Tunisian spontaneous employer track (tunisian_pfe_live)
  if (sourceProvider === "tunisian_pfe_live" || isSpontaneousLead) {
    return {
      platformName: "Site officiel de l'employeur",
      platformKey: "employer_website",
      displayLabel: "Site officiel de l'employeur",
      isOfficialEmployerSite: true,
      isAggregator: false,
      isSocialOrProfessionalNetwork: false,
      sourceUrl: effectiveSourceUrl,
      applicationUrl: effectiveAppUrl,
    };
  }

  // 5. Hostname matching employer website
  if (
    companyHost &&
    (sourceHost === companyHost ||
      sourceHost.endsWith(`.${companyHost}`) ||
      companyHost.endsWith(`.${sourceHost}`))
  ) {
    return {
      platformName: "Site officiel de l'employeur",
      platformKey: "employer_website",
      displayLabel: "Site officiel de l'employeur",
      isOfficialEmployerSite: true,
      isAggregator: false,
      isSocialOrProfessionalNetwork: false,
      sourceUrl: effectiveSourceUrl,
      applicationUrl: effectiveAppUrl,
    };
  }

  // 6. Direct company career subdomains, company brand match, or verified employer domains
  const isDirectEmployerDomain =
    Boolean(sourceHost) &&
    !sourceHost.includes("google.") &&
    !sourceHost.includes("bing.") &&
    !sourceHost.includes("yahoo.") &&
    (
      (companyHost && (sourceHost.includes(companyHost) || companyHost.includes(sourceHost))) ||
      (companyCleanSlug.length >= 3 && sourceHost.replace(/\.[a-z]{2,}$/, "").includes(companyCleanSlug)) ||
      sourceHost.startsWith("rh.") ||
      sourceHost.startsWith("recrutement.") ||
      sourceHost.startsWith("carrieres.") ||
      sourceHost.startsWith("careers.") ||
      sourceHost.startsWith("jobs.")
    );

  if (isDirectEmployerDomain) {
    return {
      platformName: "Site officiel de l'employeur",
      platformKey: "employer_website",
      displayLabel: "Site officiel de l'employeur",
      isOfficialEmployerSite: true,
      isAggregator: false,
      isSocialOrProfessionalNetwork: false,
      sourceUrl: effectiveSourceUrl,
      applicationUrl: effectiveAppUrl,
    };
  }

  // 7. Unknown source origin (Never assume official employer site without verified evidence)
  return {
    platformName: "Source d'origine inconnue",
    platformKey: "unknown",
    displayLabel: "Source d'origine inconnue",
    isOfficialEmployerSite: false,
    isAggregator: false,
    isSocialOrProfessionalNetwork: false,
    sourceUrl: effectiveSourceUrl,
    applicationUrl: effectiveAppUrl,
  };
}
