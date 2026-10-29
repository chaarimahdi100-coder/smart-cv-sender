import crypto from "crypto";

/**
 * URL and Metadata Normalization & Deduplication Engine for Job Postings.
 */

const TRACKING_QUERY_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
  "refid",
  "trackingid",
  "fbclid",
  "gclid",
  "gh_src",
  "source",
  "trk",
  "trkinfo",
  "sessionid",
  "origin",
  "context",
  "originalsubdomain",
  "currentjobid",
]);

/**
 * Cleans and normalizes any URL into a canonical format:
 * - Strips all tracking, affiliate, and analytics query parameters
 * - Strips URL fragments (#hash)
 * - Lowercases hostname and standardizes protocol
 * - Removes trailing slash (unless root path)
 */
export function normalizeCanonicalUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== "string") return "";

  try {
    const trimmed = rawUrl.trim();
    const parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);

    // Standardize protocol
    if (parsed.protocol === "http:" && !parsed.hostname.includes("localhost") && !parsed.hostname.includes("127.0.0.1")) {
      parsed.protocol = "https:";
    }

    // Lowercase hostname
    parsed.hostname = parsed.hostname.toLowerCase();

    // Remove tracking query parameters
    const keysToDelete: string[] = [];
    parsed.searchParams.forEach((_val, key) => {
      if (TRACKING_QUERY_PARAMS.has(key.toLowerCase())) {
        keysToDelete.push(key);
      }
    });
    for (const key of keysToDelete) {
      parsed.searchParams.delete(key);
    }

    // Sort remaining query params deterministically
    parsed.searchParams.sort();

    // Strip hash fragment
    parsed.hash = "";

    // Remove default ports
    if ((parsed.port === "80" && parsed.protocol === "http:") || (parsed.port === "443" && parsed.protocol === "https:")) {
      parsed.port = "";
    }

    let result = parsed.toString();

    // Strip trailing slash if path is longer than '/'
    if (result.endsWith("/") && parsed.pathname.length > 1 && !result.includes("?")) {
      result = result.slice(0, -1);
    }

    return result;
  } catch {
    // If URL parsing fails, return sanitized trimmed string
    return rawUrl.trim().replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
}

/**
 * Normalizes company names for deduplication across diverse source feeds.
 * Examples:
 * - "Sofrecom Tunisie SA" -> "sofrecom"
 * - "Vermeg Tunisia SARL" -> "vermeg"
 * - "InstaDeep Ltd." -> "instadeep"
 */
export function normalizeCompanyName(rawName: string): string {
  if (!rawName) return "";

  let name = rawName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  // Remove common corporate suffixes
  name = name.replace(/\b(s\.?a\.?r\.?l\.?|s\.?u\.?a\.?r\.?l\.?|s\.?a\.?s\.?|s\.?a\.?|ltd\.?|llc|inc\.?|corp\.?|gmbh)\b/gi, "");

  // Remove trailing geographic specifiers for core deduplication
  name = name.replace(/\b(tunisie|tunisia|tunis|north africa)\b/gi, "");

  // Remove punctuation and multiple spaces
  name = name.replace(/[^a-z0-9]/gi, " ").replace(/\s+/g, " ").trim();

  return name;
}

/**
 * Normalizes job titles to detect duplicate postings across multiple portals.
 * Removes common French/English noise tags: (H/F), [H/F], CDI, etc.
 */
export function normalizeJobTitle(rawTitle: string): string {
  if (!rawTitle) return "";

  let title = rawTitle
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  // Strip demo prefix if present
  title = title.replace(/^\[demo\]\s*/i, "");

  // Strip noise markers
  title = title
    .replace(/\([hm]\/[fe]\/?(?:[xd])?\)/gi, "")
    .replace(/\[[hm]\/[fe]\/?(?:[xd])?\]/gi, "")
    .replace(/\b(h\/f|f\/h|m\/f|m\/w\/d)\b/gi, "")
    .replace(/\b(cdi|cdd|freelance|stage|pfe)\b/gi, "")
    .replace(/\b(urgent|recrutement|hiring|opportunite)\b/gi, "")
    .replace(/[^a-z0-9]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return title;
}

/**
 * Generates a stable deterministic fingerprint string for cross-source deduplication.
 */
export function generateDeduplicationFingerprint(job: {
  title: string;
  companyName: string;
  location?: string;
  canonicalUrl?: string;
}): string {
  const normCompany = normalizeCompanyName(job.companyName);
  const normTitle = normalizeJobTitle(job.title);
  const baseKey = `${normCompany}::${normTitle}`;

  return crypto.createHash("sha256").update(baseKey, "utf8").digest("hex").substring(0, 16);
}

/**
 * Evaluates whether two job postings from different providers represent the exact same opening.
 */
export function isDuplicatePosting(
  a: { title: string; companyName: string; canonicalUrl?: string },
  b: { title: string; companyName: string; canonicalUrl?: string }
): boolean {
  // 1. Exact canonical URL match
  if (a.canonicalUrl && b.canonicalUrl && normalizeCanonicalUrl(a.canonicalUrl) === normalizeCanonicalUrl(b.canonicalUrl)) {
    return true;
  }

  // 2. Normalized company and title match
  const compA = normalizeCompanyName(a.companyName);
  const compB = normalizeCompanyName(b.companyName);
  if (!compA || !compB || compA !== compB) {
    return false;
  }

  const titleA = normalizeJobTitle(a.title);
  const titleB = normalizeJobTitle(b.title);

  if (titleA === titleB) {
    return true;
  }

  // Jaccard similarity between title word tokens
  const wordsA = new Set(titleA.split(" ").filter((w) => w.length > 2));
  const wordsB = new Set(titleB.split(" ").filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return false;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = new Set([...wordsA, ...wordsB]).size;
  const similarity = intersection / union;

  return similarity >= 0.75;
}

/**
 * Given multiple application links for the same position, selects the highest-quality
 * primary destination (preferring official employer portals over aggregators).
 */
export function selectPrimaryApplicationUrl(
  urls: Array<{ url: string; provider: string; isDirectEmployer: boolean }>
): string {
  if (urls.length === 0) return "";

  // 1. First priority: direct employer portal
  const direct = urls.find((u) => u.isDirectEmployer);
  if (direct) return normalizeCanonicalUrl(direct.url);

  // 2. Second priority: ATS systems (Greenhouse, Lever, SmartRecruiters)
  const ats = urls.find(
    (u) =>
      u.url.includes("greenhouse.io") ||
      u.url.includes("lever.co") ||
      u.url.includes("smartrecruiters.com") ||
      u.url.includes("workday.com")
  );
  if (ats) return normalizeCanonicalUrl(ats.url);

  // 3. Fallback: first normalized URL
  return normalizeCanonicalUrl(urls[0].url);
}
