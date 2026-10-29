import { BaseDiscoveryProvider } from "./base.ts";
import type { DiscoveryLead } from "../types.ts";

/**
 * Multi-lingual Search Engine Lead Provider (French, English, Arabic).
 *
 * Generates targeted search leads for Tunisian tech centers and candidate profile skills.
 * Respects terms of service: uses Google Custom Search API if configured,
 * or generates structured verified search lead templates for the candidate.
 */
export class SearchEngineLeadsProvider extends BaseDiscoveryProvider {
  public readonly id = "search_engine_leads";
  public readonly name = "Générateur de Pistes de Recherche Multi-Sources";
  public readonly rateLimitPerMinute = 15;

  // Search queries covering Tunisian tech hubs and candidate BIS/BI/Web skills
  private readonly searchQueries = [
    {
      lang: "fr",
      query: "PFE Informatique de Gestion Business Intelligence Tunis",
      hub: "Tunis, Tunisie",
      domain: "Business Information Systems & BI",
      type: "PFE" as const,
    },
    {
      lang: "fr",
      query: "Stage PFE Développeur Next.js React Technopole El Ghazala",
      hub: "Ariana, Tunisie",
      domain: "Web Development",
      type: "PFE" as const,
    },
    {
      lang: "en",
      query: "Junior Power BI Data Analyst jobs Tunis",
      hub: "Tunis, Tunisie",
      domain: "Business Information Systems & BI",
      type: "JUNIOR" as const,
    },
    {
      lang: "fr",
      query: "Stage d'été Développement Web Front-end Sousse",
      hub: "Sousse, Tunisie",
      domain: "Web Development",
      type: "STAGE" as const,
    },
    {
      lang: "ar",
      query: "فرص تدريب PFE إعلامية وتطوير ويب تونس",
      hub: "Tunis, Tunisie",
      domain: "Software Engineering",
      type: "PFE" as const,
    },
  ];

  public async discoverLeads(): Promise<DiscoveryLead[]> {
    const leads: DiscoveryLead[] = [];
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const cx = process.env.GOOGLE_SEARCH_ENGINE_ID;

    if (apiKey && cx) {
      // Direct official Google Custom Search API call
      for (const q of this.searchQueries.slice(0, 2)) {
        try {
          const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(q.query)}`;
          const res = await this.fetchWithRetry(searchUrl, {}, 1);
          if (!res.ok) continue;

          interface SearchItem {
            title?: string;
            link?: string;
            snippet?: string;
            displayLink?: string;
          }

          const data = (await res.json()) as { items?: SearchItem[] };
          for (const item of (data.items || []).slice(0, 3)) {
            if (item.link && item.title) {
              leads.push({
                title: item.title,
                sourceUrl: item.link,
                sourceProvider: this.id,
                sourcePlatform: "Recherche Google",
                companyName: item.displayLink || "Employeur (Piste Google Search)",
                location: q.hub,
                snippet: item.snippet || "",
                type: q.type,
                domain: q.domain,
                datePosted: null,
                rawPayload: {
                  searchQuery: q.query,
                  language: q.lang,
                  sourcePlatform: "Recherche Google",
                  applicationUrl: item.link,
                  directApplicationUrl: item.link,
                },
              });
            }
          }
        } catch {
          continue;
        }
      }
    }

    // Default structured leads with targeted queries for Tunisian ecosystem
    if (leads.length === 0) {
      for (const q of this.searchQueries) {
        const encoded = encodeURIComponent(q.query);
        leads.push({
          title: `Piste Ciblée : ${q.query}`,
          sourceUrl: `https://www.google.com/search?q=${encoded}`,
          sourceProvider: this.id,
          sourcePlatform: "Recherche Google",
          companyName: `Veille Écosystème (${q.hub.split(",")[0]})`,
          location: q.hub,
          snippet: `Piste de recherche externe (Recherche manuelle) : Requête de veille ciblée en ${q.lang.toUpperCase()} pour déceler les offres émergentes dans le domaine ${q.domain}.`,
          type: q.type,
          domain: q.domain,
          datePosted: null,
          rawPayload: {
            searchQuery: q.query,
            language: q.lang,
            isSearchLead: true,
            sourceType: "search_engine",
            sourcePlatform: "Recherche Google",
            applicationUrl: `https://www.google.com/search?q=${encoded}`,
            directApplicationUrl: `https://www.google.com/search?q=${encoded}`,
            disclaimer: "Piste de recherche externe (Recherche manuelle)",
          },
        });
      }
    }

    return leads;
  }
}
