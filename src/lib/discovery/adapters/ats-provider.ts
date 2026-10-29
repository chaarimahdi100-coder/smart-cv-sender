import { BaseDiscoveryProvider } from "./base.ts";
import type { DiscoveryLead, OpportunityType } from "../types.ts";
import { cleanHtmlToPlainText } from "../../text-sanitizer.ts";
import { detectOpportunitySeniority } from "../../seniority-detector.ts";

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name: string };
  updated_at?: string;
  content?: string;
}

/**
 * Public ATS Provider (Greenhouse & Lever).
 *
 * Integrates official public career APIs for technology companies offering
 * positions accessible to Tunisian candidates or remote EMEA positions.
 */
export class AtsDiscoveryProvider extends BaseDiscoveryProvider {
  public readonly id = "greenhouse_ats";
  public readonly name = "Greenhouse ATS (Boards Publics)";
  public readonly rateLimitPerMinute = 30;

  // Verified working public Greenhouse boards that support remote EMEA / North Africa / Worldwide
  private readonly targetBoards = ["canonical", "wikimedia", "gitlab", "elastic", "mozilla"];

  public async discoverLeads(): Promise<DiscoveryLead[]> {
    const leads: DiscoveryLead[] = [];

    for (const board of this.targetBoards) {
      try {
        const url = `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`;
        const res = await this.fetchWithRetry(url, {}, 1);

        if (!res.ok) continue;

        const data = (await res.json()) as { jobs?: GreenhouseJob[] };
        const jobs = data.jobs || [];

        for (const job of jobs) {
          const loc = (job.location?.name || "").toLowerCase();
          const title = job.title.toLowerCase();

          // Strict filter for Tunisia-eligible, EMEA, worldwide, or anywhere roles
          // Explicitly excludes country-locked positions (US only, Americas only, APAC only, UK only)
          const isTunisiaOrEmea =
            (loc.includes("tunisia") ||
              loc.includes("tunis") ||
              loc.includes("emea") ||
              loc.includes("worldwide") ||
              loc.includes("anywhere")) &&
            !loc.includes("us only") &&
            !loc.includes("americas only") &&
            !loc.includes("apac only") &&
            !loc.includes("uk only") &&
            !loc.includes("canada only");

          const isTargetRole =
            title.includes("junior") ||
            /\b(?:intern|internship|trainee|apprentice|stagiaire)\b/i.test(title) ||
            title.includes("graduate") ||
            title.includes("associate") ||
            title.includes("software engineer") ||
            title.includes("web") ||
            title.includes("frontend") ||
            title.includes("backend") ||
            title.includes("data");

          if (isTunisiaOrEmea && isTargetRole) {
            const seniority = detectOpportunitySeniority({ title: job.title, description: job.content });
            let oppType: OpportunityType = "OTHER";
            if (seniority.level === "pfe") oppType = "PFE";
            else if (seniority.level === "intern") oppType = "STAGE";
            else if (seniority.level === "junior") oppType = "JUNIOR";
            else if (seniority.level === "manager" || seniority.level === "executive") oppType = "MANAGER";
            else if (seniority.level === "senior") oppType = "SENIOR";

            const cleanedContent = cleanHtmlToPlainText(job.content, { maxLength: 8000 });

            leads.push({
              title: job.title,
              sourceUrl: job.absolute_url,
              sourceProvider: this.id,
              sourcePlatform: "Greenhouse ATS",
              companyName: board.charAt(0).toUpperCase() + board.slice(1),
              companyWebsite: `https://${board}.com`,
              location: job.location?.name || "Télétravail (Éligible Tunisie / EMEA)",
              snippet: cleanedContent.slice(0, 500),
              datePosted: job.updated_at || null,
              updatedAtSource: job.updated_at || null,
              type: oppType,
              domain: title.includes("data") ? "Data & Analytics" : "Software Engineering",
              rawPayload: {
                board,
                greenhouseId: job.id,
                applicationUrl: job.absolute_url,
                directApplicationUrl: job.absolute_url,
                sourcePlatform: "Greenhouse ATS",
                fullContent: cleanedContent,
              },
            });
          }
        }
      } catch {
        // Network isolation tolerance
        continue;
      }
    }

    return leads;
  }
}
