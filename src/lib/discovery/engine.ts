import { SupabaseClient } from "@supabase/supabase-js";
import type {
  DiscoveredOpportunity,
  SyncReport,
  PersistOpportunityResult,
} from "./types.ts";
import { CuratedTunisianProvider } from "./adapters/curated-tunisian.ts";
import { TunisianPfeDiscoveryProvider } from "./adapters/tunisian-pfe-provider.ts";
import { TunisianVacanciesDiscoveryProvider } from "./adapters/tunisian-vacancies-provider.ts";
import { AtsDiscoveryProvider } from "./adapters/ats-provider.ts";
import { SearchEngineLeadsProvider } from "./adapters/search-engine-leads.ts";
import { normalizeCanonicalUrl, isDuplicatePosting } from "./normalizer.ts";
import { verifyOpportunity } from "./verifier.ts";
import { getServiceRoleClient } from "../opportunities-manager.ts";
import { cleanHtmlToPlainText } from "../text-sanitizer.ts";

interface FlexibleFilterBuilder {
  limit?: (count: number) => {
    maybeSingle: () => Promise<{ data: { id: string; is_active?: boolean } | null; error?: { message?: string; code?: string } | null }>;
  };
  maybeSingle: () => Promise<{ data: { id: string; is_active?: boolean } | null; error?: { message?: string; code?: string } | null }>;
  in?: (column: string, values: string[]) => FlexibleFilterBuilder;
  or?: (conditions: string) => FlexibleFilterBuilder;
  eq?: (column: string, value: string) => FlexibleFilterBuilder;
}

/**
 * Orchestrator for Multi-Source Opportunity Discovery, Verification,
 * Deduplication, and Database Synchronization.
 */
export class DiscoveryEngine {
  private providers = [
    new TunisianVacanciesDiscoveryProvider(),
    new TunisianPfeDiscoveryProvider(),
    new CuratedTunisianProvider(),
    new AtsDiscoveryProvider(),
    new SearchEngineLeadsProvider(),
  ];

  /**
   * Executes a complete discovery and verification cycle across all active providers.
   */
  public async runDiscoverySync(client?: SupabaseClient | null): Promise<SyncReport> {
    const startTime = Date.now();
    // In-memory simulation when client is explicitly null; otherwise prefer service role client or supplied client
    const targetSupabase = client === null ? null : (client || getServiceRoleClient());

    const report: SyncReport = {
      timestamp: new Date().toISOString(),
      totalLeadsDiscovered: 0,
      verifiedOpenCount: 0,
      likelyOpenCount: 0,
      unverifiedCount: 0,
      expiredCount: 0,
      closedCount: 0,
      rejectedCount: 0,
      brokenSourceCount: 0,
      duplicateCount: 0,
      persistedCount: 0,
      durationMs: 0,
      providerResults: [],
      errors: [],
    };

    const discoveredPool: DiscoveredOpportunity[] = [];

    // 1. Gather leads from each provider with error isolation
    for (const provider of this.providers) {
      try {
        const leads = await provider.discoverLeads();
        report.totalLeadsDiscovered += leads.length;
        report.providerResults.push({
          providerId: provider.id,
          leadsCount: leads.length,
          success: true,
        });

        // 2. Process and verify each lead
        for (const lead of leads) {
          const canonical = normalizeCanonicalUrl(lead.sourceUrl);

          const verification = verifyOpportunity({
            title: lead.title,
            sourceUrl: canonical,
            sourceProvider: provider.id,
            sourceProviderName: provider.name,
            sourcePlatform: lead.sourcePlatform,
            companyName: lead.companyName || "Entreprise",
            companyWebsite: lead.companyWebsite,
            description: lead.snippet || "",
            location: lead.location,
            datePosted: lead.datePosted || null,
            validThrough: lead.validThrough || null,
            updatedAtSource: lead.updatedAtSource || null,
            closedAt: lead.closedAt || null,
            applicationUrl: (lead.rawPayload?.applicationUrl as string) || undefined,
            directApplicationUrl:
              (lead.rawPayload?.directApplicationUrl as string) ||
              (lead.rawPayload?.applicationUrl as string) ||
              undefined,
            pageContentSnippet: (lead.rawPayload?.pageContentSnippet as string) || undefined,
            isDirectApiFeed: provider.id === "greenhouse_ats",
            isSpontaneousLead: Boolean(lead.rawPayload?.isSpontaneousLead),
            isSpecificVacancyAnnouncement: lead.rawPayload?.isSpecificVacancyAnnouncement !== false,
          });

          const isSearchLead = Boolean(lead.rawPayload?.isSearchLead || provider.id === "search_engine_leads");
          const effectiveStatus = isSearchLead ? "unverified" : verification.status;
          const effectiveReason = isSearchLead
            ? "Piste de recherche externe (Recherche manuelle)."
            : verification.statusReason;

          // Tally statuses
          if (effectiveStatus === "verified_open") report.verifiedOpenCount++;
          else if (effectiveStatus === "likely_open") report.likelyOpenCount++;
          else if (effectiveStatus === "unverified") report.unverifiedCount++;
          else if (effectiveStatus === "expired") report.expiredCount++;
          else if (effectiveStatus === "closed") report.closedCount++;
          else if (effectiveStatus === "rejected") report.rejectedCount++;
          else if (effectiveStatus === "broken_source") report.brokenSourceCount++;

          // Skip rejected/scam listings
          if (effectiveStatus === "rejected") continue;

          const isLeadDemo = Boolean(
            lead.rawPayload?.isDemo ||
            lead.title.startsWith("[DEMO]") ||
            lead.sourceUrl.includes("demo")
          );

          const opp: DiscoveredOpportunity = {
            title: lead.title,
            canonicalUrl: canonical,
            sourceUrl: lead.sourceUrl,
            sourceProvider: provider.id,
            sourceProviderName: provider.name,
            sourcePlatform:
              verification.evidence.sourcePlatformName ||
              lead.sourcePlatform ||
              provider.name,
            companyName: lead.companyName || "Entreprise Partenaire",
            companyWebsite: lead.companyWebsite,
            location: lead.location || "Tunisie",
            country: "Tunisia",
            remotePolicy: "unknown",
            type: lead.type || "JUNIOR",
            domain: lead.domain || "Software Engineering",
            description: (lead.rawPayload?.fullContent as string) || lead.snippet || "Détails complets de l'offre à consulter sur la source officielle.",
            requiredSkills: [],
            applicationUrl:
              (lead.rawPayload?.applicationUrl as string) ||
              verification.evidence.directApplicationUrl ||
              canonical,
            applicationMethod: "direct_url",
            datePosted: lead.datePosted || null,
            publishedAt: lead.datePosted || null,
            validThrough: lead.validThrough || null,
            deadlineAt: lead.validThrough || null,
            updatedAtSource: lead.updatedAtSource || null,
            closedAt: lead.closedAt || null,
            firstSeenAt: new Date().toISOString(),
            lastCheckedAt: new Date().toISOString(),
            status: effectiveStatus,
            statusReason: effectiveReason,
            verificationEvidence: verification.evidence,
            isDemo: isLeadDemo,
            isStale: verification.isStale,
            isPublicationDateUnknown: !lead.datePosted,
          };

          // 3. In-memory Deduplication across current batch
          const duplicateInBatch = discoveredPool.some((existing) => isDuplicatePosting(existing, opp));
          if (duplicateInBatch) {
            report.duplicateCount++;
          } else {
            discoveredPool.push(opp);
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        report.errors.push(`Erreur fournisseur [${provider.id}]: ${errorMsg}`);
        report.providerResults.push({
          providerId: provider.id,
          leadsCount: 0,
          success: false,
          error: errorMsg,
        });
      }
    }

    // 4. Persist discovered opportunities into Supabase if client is available
    if (targetSupabase) {
      for (const opp of discoveredPool) {
        try {
          const persistResult = await this.persistOpportunity(targetSupabase, opp);
          if (persistResult.success) {
            report.persistedCount++;
            if (persistResult.partialMetadata) {
              report.errors.push(
                `Avertissement persistance partielle [${opp.title}]: ${persistResult.warning}`
              );
            }
          } else if (persistResult.error) {
            report.errors.push(`Erreur enregistrement [${opp.title}]: ${persistResult.error}`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          report.errors.push(`Erreur enregistrement [${opp.title}]: ${msg}`);
        }
      }
    } else {
      report.errors.push(
        "Persistance ignorée : aucun client Supabase avec droits d'écriture configuré (SUPABASE_SERVICE_ROLE_KEY manquante). Les opportunités ont été découvertes et vérifiées en mémoire uniquement."
      );
    }

    report.durationMs = Date.now() - startTime;
    return report;
  }

  /**
   * Idempotently persists a single verified discovered opportunity to Supabase.
   * Reports complete metadata persistence, explicit fallback warnings on code 42703,
   * update confirmations, or explicit error diagnostics.
   */
  public async persistOpportunity(
    supabase: SupabaseClient,
    opp: DiscoveredOpportunity
  ): Promise<PersistOpportunityResult> {
    // 1. Resolve or insert company
    let companyId: string | null = null;
    const companyQuery = supabase
      .from("companies")
      .select("id")
      .ilike("name", opp.companyName.trim()) as unknown as FlexibleFilterBuilder;

    const { data: existingCompany } =
      typeof companyQuery.limit === "function"
        ? await companyQuery.limit(1).maybeSingle()
        : await companyQuery.maybeSingle();

    if (existingCompany?.id) {
      companyId = existingCompany.id;
    } else {
      const { data: newCompany, error: compErr } = await supabase
        .from("companies")
        .insert({
          name: opp.companyName.trim(),
          sector: opp.domain || "Technologies",
          website: opp.companyWebsite || "https://example.tn",
          country: "Tunisia",
          source: `discovery:${opp.sourceProvider}`,
        })
        .select("id")
        .single();

      if (compErr || !newCompany) {
        const isRls = compErr?.code === "42501" || compErr?.message?.toLowerCase().includes("row-level security");
        return {
          success: false,
          mode: "failed",
          partialMetadata: false,
          error: isRls
            ? "Échec d'association de l'entreprise : écriture bloquée par les politiques RLS (SUPABASE_SERVICE_ROLE_KEY requise)."
            : `Échec d'association de l'entreprise : ${compErr?.message || "Inconnue"}`,
        };
      }
      companyId = newCompany.id;
    }

    if (!companyId) {
      return {
        success: false,
        mode: "failed",
        partialMetadata: false,
        error: "Identifiant d'entreprise introuvable.",
      };
    }

    // 2. Check if opportunity already exists (by canonical URL, source URL, or company + title)
    // Avoid PostgREST .or() logic tree parse failures with titles containing commas/parentheses
    let existingOpp: { id: string; is_active?: boolean } | null = null;

    const urlsToCheck = Array.from(
      new Set(
        [opp.canonicalUrl, opp.sourceUrl].filter(
          (u): u is string => typeof u === "string" && u.trim().length > 0
        )
      )
    );

    try {
      const selectBuilder = supabase.from("opportunities").select("id, is_active") as unknown as FlexibleFilterBuilder;
      if (typeof selectBuilder.in === "function" && urlsToCheck.length > 0) {
        const inBuilder = selectBuilder.in("source_url", urlsToCheck);
        const { data: byUrl } =
          typeof inBuilder.limit === "function"
            ? await inBuilder.limit(1).maybeSingle()
            : await inBuilder.maybeSingle();
        if (byUrl) {
          existingOpp = byUrl;
        }
      } else if (typeof selectBuilder.or === "function") {
        const orConditions = urlsToCheck.map((u) => `source_url.eq."${u}"`).join(",");
        const orBuilder = selectBuilder.or(orConditions || `source_url.eq."${opp.sourceUrl}"`);
        const { data: byOr } =
          typeof orBuilder.limit === "function"
            ? await orBuilder.limit(1).maybeSingle()
            : await orBuilder.maybeSingle();
        if (byOr) {
          existingOpp = byOr;
        }
      }
    } catch {
      // Query error tolerance
    }

    if (!existingOpp && companyId && opp.title) {
      try {
        const titleSelect = supabase
          .from("opportunities")
          .select("id, is_active") as unknown as FlexibleFilterBuilder;
        let titleBuilder = titleSelect;
        if (typeof titleBuilder.eq === "function") {
          const step1 = titleBuilder.eq("company_id", companyId);
          if (typeof step1.eq === "function") {
            titleBuilder = step1.eq("title", opp.title.trim());
          } else {
            titleBuilder = step1;
          }
        }
        const { data: byTitle } =
          typeof titleBuilder.limit === "function"
            ? await titleBuilder.limit(1).maybeSingle()
            : await titleBuilder.maybeSingle();
        if (byTitle) {
          existingOpp = byTitle;
        }
      } catch {
        // Query error tolerance
      }
    }

    const isOppActive =
      opp.status !== "closed" &&
      opp.status !== "expired" &&
      opp.status !== "broken_source" &&
      opp.status !== "rejected";

    if (existingOpp) {
      // If already exists, update activity status and metadata
      const updatePayload: Record<string, unknown> = {
        is_active: isOppActive,
        description: cleanHtmlToPlainText(opp.description),
        verification_status: opp.status,
        status_reason: opp.statusReason,
        verification_evidence: opp.verificationEvidence,
        last_checked_at: new Date().toISOString(),
      };
      if (opp.sourcePlatform) updatePayload.source_platform = opp.sourcePlatform;
      if (opp.applicationUrl) updatePayload.application_url = opp.applicationUrl;
      if (opp.updatedAtSource) updatePayload.updated_at_source = opp.updatedAtSource;
      if (opp.closedAt) updatePayload.closed_at = opp.closedAt;
      if (opp.type) updatePayload.type = opp.type;
      if (typeof opp.isDemo === "boolean") updatePayload.is_demo = opp.isDemo;

      // CRITICAL: Re-verification or re-crawl MUST NEVER overwrite existing publication date
      // Only set if opp.datePosted is explicitly non-null and provided
      if (opp.datePosted) {
        updatePayload.date_posted = opp.datePosted;
      }
      if (opp.validThrough) {
        updatePayload.valid_through = opp.validThrough;
      }

      const { error: updateErr } = await supabase
        .from("opportunities")
        .update(updatePayload)
        .eq("id", existingOpp.id);

      if (updateErr && (updateErr.code === "42703" || updateErr.message?.toLowerCase().includes("does not exist"))) {
        // Fallback to base columns only if enriched metadata columns don't exist
        const baseUpdate: Record<string, unknown> = {
          is_active: isOppActive,
          description: cleanHtmlToPlainText(opp.description),
        };
        if (opp.type) baseUpdate.type = opp.type;
        const { error: baseUpdateErr } = await supabase
          .from("opportunities")
          .update(baseUpdate)
          .eq("id", existingOpp.id);

        if (baseUpdateErr) {
          return {
            success: false,
            mode: "failed",
            partialMetadata: false,
            error: `Échec de mise à jour de l'opportunité existante : ${baseUpdateErr.message}`,
          };
        }
      } else if (updateErr) {
        return {
          success: false,
          mode: "failed",
          partialMetadata: false,
          error: `Échec de mise à jour de l'opportunité existante : ${updateErr.message}`,
        };
      }

      return {
        success: true,
        mode: "updated",
        partialMetadata: false,
        opportunityId: existingOpp.id,
      };
    }

    // 3. Insert new opportunity using reconciled schema with backward-compatible fallback
    const fullPayload: Record<string, unknown> = {
      company_id: companyId,
      title: opp.title,
      type: opp.type,
      domain: opp.domain,
      description: cleanHtmlToPlainText(opp.description),
      location: opp.location,
      source_url: opp.canonicalUrl || opp.sourceUrl,
      is_active: isOppActive,
      canonical_url: opp.canonicalUrl || opp.sourceUrl,
      source_provider: opp.sourceProvider,
      source_platform: opp.sourcePlatform || opp.verificationEvidence?.sourcePlatformName,
      application_url: opp.applicationUrl || opp.canonicalUrl || opp.sourceUrl,
      updated_at_source: opp.updatedAtSource || null,
      closed_at: opp.closedAt || null,
      verification_status: opp.status,
      status_reason: opp.statusReason,
      verification_evidence: opp.verificationEvidence,
      date_posted: opp.datePosted || null,
      valid_through: opp.validThrough || null,
      first_seen_at: opp.firstSeenAt,
      last_checked_at: opp.lastCheckedAt,
      remote_policy: opp.remotePolicy,
      application_method: opp.applicationMethod,
      required_skills: opp.requiredSkills || [],
      is_demo: opp.isDemo,
    };

    const { data: fullData, error: fullInsertErr } = await supabase
      .from("opportunities")
      .insert(fullPayload)
      .select("id")
      .maybeSingle();

    if (!fullInsertErr) {
      return {
        success: true,
        mode: "full",
        partialMetadata: false,
        opportunityId: fullData?.id,
      };
    }

    // Explicitly detect undefined column (code 42703) when remote database lacks migrations 08 & 09
    const isUndefinedColumn =
      fullInsertErr.code === "42703" ||
      fullInsertErr.message?.toLowerCase().includes("does not exist");

    if (isUndefinedColumn) {
      const basePayload = {
        company_id: companyId,
        title: opp.title,
        type: opp.type,
        domain: opp.domain,
        description: cleanHtmlToPlainText(opp.description),
        location: opp.location,
        source_url: opp.canonicalUrl || opp.sourceUrl,
        is_active: isOppActive,
      };
      const { data: baseData, error: baseInsertErr } = await supabase
        .from("opportunities")
        .insert(basePayload)
        .select("id")
        .maybeSingle();

      if (!baseInsertErr) {
        return {
          success: true,
          mode: "fallback_base",
          partialMetadata: true,
          opportunityId: baseData?.id,
          warning:
            "Persistance partielle en colonnes de base uniquement : les colonnes de métadonnées enrichies (verification_status, canonical_url, etc.) n'existent pas dans la base de données distante (code 42703). Appliquez les migrations 20240108000000 et 20240109000000 pour conserver l'intégralité des métadonnées d'audit.",
        };
      }

      return {
        success: false,
        mode: "failed",
        partialMetadata: false,
        error: `Échec d'insertion de secours en colonnes de base : ${baseInsertErr.message}`,
      };
    }

    const isRls =
      fullInsertErr.code === "42501" ||
      fullInsertErr.message?.toLowerCase().includes("row-level security");

    return {
      success: false,
      mode: "failed",
      partialMetadata: false,
      error: isRls
        ? "Échec d'insertion : écriture bloquée par les politiques RLS sur la table opportunities (SUPABASE_SERVICE_ROLE_KEY requise)."
        : `Échec d'insertion : ${fullInsertErr.message} (Code: ${fullInsertErr.code || "inconnu"})`,
    };
  }
}

export const discoveryEngine = new DiscoveryEngine();
