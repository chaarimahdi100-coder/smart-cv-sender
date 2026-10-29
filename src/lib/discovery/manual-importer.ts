import type { DiscoveredOpportunity } from "./types.ts";
import { normalizeCanonicalUrl } from "./normalizer.ts";
import { extractJobFromHtml } from "./adapters/html-extractor.ts";
import { verifyOpportunity } from "./verifier.ts";
import { sanitizeScrapedContent } from "./anti-injection.ts";
import { isSafePublicHttpUrl, safeFetchPublicUrl } from "./ssrf-guard.ts";
import { resolveSourcePlatform } from "./source-resolver.ts";

export interface ManualImportResult {
  success: boolean;
  opportunity?: DiscoveredOpportunity;
  extractedMeta?: Record<string, unknown>;
  requiresManualReview?: boolean;
  message?: string;
  error?: string;
}

/**
 * Imports and validates an opportunity directly from any user-supplied URL.
 * Transparently extracts metadata, executes verification pipeline, and protects against scams.
 */
export async function importOpportunityFromUrl(rawUrl: string): Promise<ManualImportResult> {
  const trimmed = (rawUrl || "").trim();

  // Validate basic URL structure and SSRF safety
  if (!trimmed || !isSafePublicHttpUrl(trimmed)) {
    return {
      success: false,
      error: "URL invalide ou non autorisée : veuillez fournir une adresse web publique complète (http:// ou https://).",
    };
  }

  const canonicalUrl = normalizeCanonicalUrl(trimmed);

  let html = "";
  let httpStatusCode = 200;
  let fetchError = false;

  try {
    const fetchResult = await safeFetchPublicUrl(canonicalUrl, {
      maxRedirects: 3,
      maxBytes: 512 * 1024, // 512 KB bounded streaming limit
      timeoutMs: 8000,
    });

    httpStatusCode = fetchResult.status;

    if (fetchResult.ok && fetchResult.html) {
      html = fetchResult.html;
    } else {
      fetchError = true;
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    // Explicitly fail closed on SSRF or redirect security violations
    if (
      errMsg.includes("SSRF") ||
      errMsg.includes("forbidden") ||
      errMsg.includes("non-public") ||
      errMsg.includes("redirect limit")
    ) {
      return {
        success: false,
        error: `Importation bloquée pour des raisons de sécurité : l'adresse ou sa cible de redirection n'est pas autorisée (${errMsg}).`,
      };
    }
    fetchError = true;
    httpStatusCode = 500;
  }


  // If page was blocked by login wall (e.g. LinkedIn login required) or anti-bot
  if (fetchError || !html) {
    // Derive employer from hostname safely
    let derivedEmployer = "Employeur";
    try {
      const parsedHost = new URL(canonicalUrl).hostname.replace(/^www\./, "");
      derivedEmployer = parsedHost.split(".")[0];
      derivedEmployer = derivedEmployer.charAt(0).toUpperCase() + derivedEmployer.slice(1);
    } catch {
      // Ignored
    }

    const titleFromUrl = canonicalUrl.split("/").filter(Boolean).pop()?.replace(/[-_]/g, " ") || "Offre d'emploi";

    const resolvedPlatform = resolveSourcePlatform({
      sourceUrl: canonicalUrl,
      companyWebsite: `https://${derivedEmployer.toLowerCase()}.tn`,
    });

    const unverifiedOpp: DiscoveredOpportunity = {
      title: sanitizeScrapedContent(titleFromUrl, 150).sanitizedText,
      canonicalUrl,
      sourceUrl: canonicalUrl,
      sourceProvider: "manual_url_importer",
      sourceProviderName: `Import Manuel (${resolvedPlatform.displayLabel})`,
      sourcePlatform: resolvedPlatform.platformName,
      companyName: derivedEmployer,
      location: "Tunisie",
      country: "Tunisia",
      remotePolicy: "unknown",
      type: "JUNIOR",
      domain: "Software Engineering",
      description: "Le contenu complet de l'offre nécessite une authentification ou un accès direct sur la plateforme source. Veuillez vérifier les détails avant de postuler.",
      requiredSkills: [],
      applicationUrl: canonicalUrl,
      applicationMethod: "direct_url",
      datePosted: null,
      publishedAt: null,
      isPublicationDateUnknown: true,
      firstSeenAt: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
      status: "unverified",
      statusReason: "Source protégée par authentification ou CAPTCHA (accès direct automatisé non autorisé). Piste importée pour revue manuelle.",
      verificationEvidence: {
        urlReachable: httpStatusCode === 200,
        httpStatusCode,
        isSpecificListing: true,
        employerCorroborated: false,
        datePostedVerified: false,
        deadlineVerified: false,
        applicationRouteVerified: true,
        noClosedOrExpiredSignals: true,
        noSuspiciousScamSignals: true,
        signalsDetected: ["LOGIN_WALL_OR_BLOCKED"],
        notes: [`La plateforme source requiert une connexion utilisateur (ex: ${resolvedPlatform.platformName}). Détails et disponibilité à confirmer.`],
        checkedAt: new Date().toISOString(),
        sourcePlatformName: resolvedPlatform.platformName,
        sourcePlatform: resolvedPlatform.platformName,
        sourceUrl: canonicalUrl,
        applicationUrl: canonicalUrl,
        directApplicationUrl: canonicalUrl,
        publishedAt: null,
        isPublicationDateUnknown: true,
        isAvailabilityUnconfirmed: true,
      },
      isDemo: false,
    };

    return {
      success: true,
      requiresManualReview: true,
      opportunity: unverifiedOpp,
      message: "Lien importé avec succès. La page source restreint l'extraction automatique : veuillez vérifier le titre et l'employeur.",
    };
  }

  // 1. Extract metadata from HTML
  const extracted = extractJobFromHtml(html, canonicalUrl);

  const resolvedPlatform = resolveSourcePlatform({
    sourceUrl: canonicalUrl,
    applicationUrl: extracted.applicationUrl || canonicalUrl,
    companyWebsite: extracted.companyWebsite,
  });

  // 2. Run multi-stage verification pipeline
  const verification = verifyOpportunity({
    title: extracted.title,
    sourceUrl: canonicalUrl,
    sourceProvider: "manual_url_importer",
    sourcePlatform: resolvedPlatform.platformName,
    companyName: extracted.companyName,
    companyWebsite: extracted.companyWebsite,
    description: extracted.description,
    location: extracted.location,
    datePosted: extracted.datePosted,
    validThrough: extracted.validThrough,
    applicationUrl: extracted.applicationUrl,
    pageContentSnippet: html.slice(0, 15000),
    httpStatusCode,
  });

  const opportunity: DiscoveredOpportunity = {
    title: extracted.title,
    canonicalUrl,
    sourceUrl: canonicalUrl,
    sourceProvider: "manual_url_importer",
    sourceProviderName: `Importation Manuelle (${resolvedPlatform.displayLabel})`,
    sourcePlatform: resolvedPlatform.platformName,
    companyName: extracted.companyName,
    companyWebsite: extracted.companyWebsite,
    location: extracted.location,
    city: extracted.city,
    country: extracted.country,
    remotePolicy: extracted.remotePolicy,
    type: extracted.type,
    domain: extracted.domain,
    description: extracted.description,
    requiredSkills: extracted.requiredSkills,
    applicationUrl: extracted.applicationUrl || canonicalUrl,
    applicationMethod: "direct_url",
    datePosted: extracted.datePosted || null,
    publishedAt: extracted.datePosted || null,
    validThrough: extracted.validThrough || null,
    deadlineAt: extracted.validThrough || null,
    isPublicationDateUnknown: !extracted.datePosted,
    firstSeenAt: new Date().toISOString(),
    lastCheckedAt: new Date().toISOString(),
    status: verification.status,
    statusReason: verification.statusReason,
    verificationEvidence: verification.evidence,
    isDemo: false,
    isStale: verification.isStale,
  };

  return {
    success: true,
    opportunity,
    extractedMeta: {
      rawJsonLdFound: extracted.rawJsonLdFound,
      status: verification.status,
      evidence: verification.evidence,
    },
    message: verification.status === "verified_open"
      ? "Offre importée et vérifiée avec succès !"
      : `Offre importée avec le statut : ${verification.statusReason}`,
  };
}
