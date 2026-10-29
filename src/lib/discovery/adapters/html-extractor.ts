import { sanitizeScrapedContent } from "../anti-injection.ts";
import type { OpportunityType, RemotePolicy } from "../types.ts";

export interface ExtractedJobMetadata {
  title: string;
  companyName: string;
  companyWebsite?: string;
  location: string;
  city?: string;
  country: string;
  remotePolicy: RemotePolicy;
  type: OpportunityType;
  domain: string;
  description: string;
  requiredSkills: string[];
  datePosted?: string | null;
  validThrough?: string | null;
  applicationUrl?: string;
  rawJsonLdFound: boolean;
}

/**
 * Extracts structured job posting metadata from raw HTML using:
 * 1. Schema.org JSON-LD (JobPosting)
 * 2. OpenGraph / Twitter meta tags
 * 3. Semantic HTML fallback (h1, title, meta description)
 */
export function extractJobFromHtml(html: string, pageUrl: string): ExtractedJobMetadata {
  let title = "";
  let companyName = "";
  let companyWebsite = "";
  let location = "Tunisie";
  let description = "";
  let datePosted: string | null = null;
  let validThrough: string | null = null;
  const applicationUrl = pageUrl;
  let rawJsonLdFound = false;

  // 1. Attempt to parse JSON-LD JobPosting
  const jsonLdMatches = html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of jsonLdMatches) {
    try {
      const parsed = JSON.parse(match[1]);
      const postings = Array.isArray(parsed) ? parsed : parsed["@graph"] ? parsed["@graph"] : [parsed];

      for (const item of postings) {
        if (item["@type"] === "JobPosting") {
          rawJsonLdFound = true;
          if (item.title) title = item.title;
          if (item.hiringOrganization?.name) companyName = item.hiringOrganization.name;
          if (item.hiringOrganization?.sameAs) companyWebsite = item.hiringOrganization.sameAs;
          if (item.description) description = item.description;
          if (item.datePosted) datePosted = item.datePosted;
          if (item.validThrough) validThrough = item.validThrough;

          // Address extraction
          const addr = item.jobLocation?.address;
          if (addr) {
            if (typeof addr === "string") {
              location = addr;
            } else {
              const parts = [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean);
              if (parts.length > 0) location = parts.join(", ");
            }
          }
          break;
        }
      }
    } catch {
      // Continue to next match if JSON parsing fails
    }
  }

  // 2. OpenGraph Fallbacks if fields are missing
  if (!title) {
    const ogTitleMatch = html.match(/<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
    if (ogTitleMatch) title = ogTitleMatch[1];
  }

  if (!description) {
    const ogDescMatch = html.match(/<meta\b[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    if (ogDescMatch) description = ogDescMatch[1];
  }

  // Check for common job board aggregator site names
  const KNOWN_AGGREGATORS = ["fabskill", "tanitjobs", "keejob", "linkedin", "indeed", "glassdoor", "welcome to the jungle"];

  if (!companyName) {
    const siteNameMatch = html.match(/<meta\b[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i);
    if (siteNameMatch) {
      const site = siteNameMatch[1].trim();
      const isAggregator = KNOWN_AGGREGATORS.some((agg) => site.toLowerCase().includes(agg));
      if (!isAggregator) {
        companyName = site;
      }
    }
  }

  // 3. HTML Tags Fallback
  if (!title) {
    const h1Match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match) title = h1Match[1].replace(/<[^>]+>/g, "").trim();
  }
  if (!title) {
    const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
  }

  // Dissect composite titles: e.g. "Stagiaires PFE | SPX" or "Business Analyst - Vermeg"
  if (title && (!companyName || KNOWN_AGGREGATORS.some((agg) => companyName.toLowerCase().includes(agg)))) {
    if (title.includes("|")) {
      const parts = title.split("|").map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const candidateEmployer = parts[parts.length - 1];
        if (!KNOWN_AGGREGATORS.some((agg) => candidateEmployer.toLowerCase().includes(agg))) {
          companyName = candidateEmployer;
          title = parts.slice(0, parts.length - 1).join(" | ").trim();
        } else if (parts.length > 2) {
          companyName = parts[1];
        }
      }
    } else if (title.includes(" - ")) {
      const parts = title.split(" - ").map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const lastPart = parts[parts.length - 1];
        if (!KNOWN_AGGREGATORS.some((agg) => lastPart.toLowerCase().includes(agg)) && lastPart.length < 40) {
          companyName = lastPart;
          title = parts.slice(0, parts.length - 1).join(" - ").trim();
        }
      }
    }
  }

  // If company name still missing, derive from domain
  if (!companyName && pageUrl) {
    try {
      const hostname = new URL(pageUrl).hostname;
      const domainParts = hostname.replace(/^www\./, "").split(".");
      companyName = domainParts[0].charAt(0).toUpperCase() + domainParts[0].slice(1);
    } catch {
      companyName = "Entreprise Recruteuse";
    }
  }

  // 4. Sanitize extracted text against prompt injections
  const cleanTitle = sanitizeScrapedContent(title, 200).sanitizedText;
  const cleanCompany = sanitizeScrapedContent(companyName, 150).sanitizedText;
  const cleanDesc = sanitizeScrapedContent(description, 3500).sanitizedText;

  // 5. Detect Opportunity Type (PFE, STAGE, JUNIOR)
  const combinedUpper = `${cleanTitle} ${cleanDesc}`.toUpperCase();
  let type: OpportunityType = "JUNIOR";

  if (combinedUpper.includes("PFE") || combinedUpper.includes("FIN D'ÉTUDES") || combinedUpper.includes("GRADUATION PROJECT")) {
    type = "PFE";
  } else if (combinedUpper.includes("STAGE") || combinedUpper.includes("INTERN") || combinedUpper.includes("STAGIAIRE")) {
    type = "STAGE";
  } else if (combinedUpper.includes("ALTERNANCE") || combinedUpper.includes("APPRENTI")) {
    type = "APPRENTICESHIP";
  } else if (combinedUpper.includes("JUNIOR") || combinedUpper.includes("DÉBUTANT") || combinedUpper.includes("ENTRY LEVEL")) {
    type = "JUNIOR";
  }

  // 6. Detect Remote Policy
  let remotePolicy: RemotePolicy = "unknown";
  if (combinedUpper.includes("TÉLÉTRAVAIL COMPLET") || combinedUpper.includes("FULL REMOTE") || combinedUpper.includes("100% REMOTE")) {
    remotePolicy = "remote";
  } else if (combinedUpper.includes("HYBRIDE") || combinedUpper.includes("HYBRID") || combinedUpper.includes("TÉLÉTRAVAIL PARTIEL")) {
    remotePolicy = "hybrid";
  } else if (combinedUpper.includes("SUR SITE") || combinedUpper.includes("ON-SITE") || combinedUpper.includes("PRÉSENTIEL")) {
    remotePolicy = "on_site";
  }

  // 7. Detect Tunisian Location Hubs
  let city: string | undefined;
  if (/tunis\b/i.test(location) || /tunis\b/i.test(combinedUpper)) city = "Tunis";
  else if (/ariana\b/i.test(location) || /ariana\b/i.test(combinedUpper) || /ghazala\b/i.test(combinedUpper)) city = "Ariana";
  else if (/sousse\b/i.test(location) || /sousse\b/i.test(combinedUpper)) city = "Sousse";
  else if (/sfax\b/i.test(location) || /sfax\b/i.test(combinedUpper)) city = "Sfax";
  else if (/monastir\b/i.test(location) || /monastir\b/i.test(combinedUpper)) city = "Monastir";

  // 8. Detect Tech Skills
  const knownTech = [
    "React", "Next.js", "TypeScript", "JavaScript", "Node.js", "Python",
    "SQL", "PostgreSQL", "Power BI", "PowerBI", "Docker", "Kubernetes",
    "Java", "Spring Boot", "PHP", "Symfony", "Angular", "Vue.js", "ERP", "CRM",
    "Microsoft Dynamics 365", "Dynamics 365", "Power Apps", "Power Automate",
    "ETL", "SQL Server", "Data Warehouse", "C#", ".NET"
  ];
  const requiredSkills: string[] = [];
  const combinedText = `${cleanTitle} ${cleanDesc}`;
  for (const tech of knownTech) {
    if (new RegExp(`\\b${tech.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(combinedText)) {
      requiredSkills.push(tech);
    }
  }

  // 9. Detect Domain
  let domain = "Software Engineering";
  if (/business intelligence|power\s*bi|décisionnel|data warehouse|etl/i.test(cleanTitle + " " + cleanDesc)) {
    domain = "Business Information Systems & BI";
  } else if (/erp|crm|dynamics 365|dynamics|systèmes d'information|informatique de gestion/i.test(cleanTitle + " " + cleanDesc)) {
    domain = "Business Information Systems";
  } else if (/intelligence artificielle|machine learning|ia|nlp|rag/i.test(cleanTitle + " " + cleanDesc)) {
    domain = "Artificial Intelligence";
  } else if (/react|next\.js|frontend|web|css|html/i.test(cleanTitle + " " + cleanDesc)) {
    domain = "Web Development";
  }

  return {
    title: cleanTitle || "Opportunité Professionnelle",
    companyName: cleanCompany || "Entreprise",
    companyWebsite,
    location: location || "Tunisie",
    city,
    country: "Tunisia",
    remotePolicy,
    type,
    domain,
    description: cleanDesc || "Description détaillée de l'offre à consulter sur le lien source.",
    requiredSkills,
    datePosted,
    validThrough,
    applicationUrl,
    rawJsonLdFound,
  };
}
