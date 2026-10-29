import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/opportunities-manager";
import { verifyOpportunity } from "@/lib/discovery/verifier";
import { isSafePublicHttpUrl } from "@/lib/discovery/ssrf-guard";

import { constantTimeSecretMatch } from "@/lib/auth/secret-auth";

export { constantTimeSecretMatch };

/**
 * Route Handler for Opportunity Freshness & Discovery Recheck.
 *
 * Can be triggered via external cron service, GitHub Actions, or curl.
 * Secured via DISCOVERY_CRON_SECRET bearer token.
 * Does NOT run as an unmanaged infinite loop in development or production.
 */
export async function GET(request: Request) {
  return handleRecheck(request);
}

export async function POST(request: Request) {
  return handleRecheck(request);
}

async function handleRecheck(request: Request) {
  const startTime = Date.now();

  // 1. Validate Secret Authorization
  const rawCronSecret = process.env.DISCOVERY_CRON_SECRET;
  const cronSecret = typeof rawCronSecret === "string" ? rawCronSecret.trim() : "";
  if (!cronSecret) {
    return NextResponse.json(
      { error: "DISCOVERY_CRON_SECRET is not configured on the server." },
      { status: 401 }
    );
  }

  const authHeader = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-discovery-secret");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  const isBearerAuthorized = constantTimeSecretMatch(bearerToken, cronSecret);
  const isHeaderAuthorized = constantTimeSecretMatch(headerSecret, cronSecret);

  if (!isBearerAuthorized && !isHeaderAuthorized) {
    return NextResponse.json(
      { error: "Unauthorized: Invalid or missing discovery secret token." },
      { status: 401 }
    );
  }


  // 2. Fetch Active Opportunities to recheck (or single opportunity if query param provided)
  const supabase = getServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({
      success: true,
      message: "Recheck authorization verified. Supabase service client not configured for remote writes.",
      totalRechecked: 0,
      brokenCount: 0,
      expiredCount: 0,
      activeCount: 0,
      durationMs: Date.now() - startTime,
    });
  }

  try {
    let specificId: string | null = null;
    try {
      const parsedUrl = new URL(request.url);
      specificId = parsedUrl.searchParams.get("id") || parsedUrl.searchParams.get("opportunity_id");
    } catch {
      // In testing environments request.url might be relative
    }

    let query = supabase
      .from("opportunities")
      .select(
        "id, title, source_url, description, is_active, type, date_posted, valid_through, application_url, source_provider, source_platform, verification_status, verification_evidence, companies(id, name, website)"
      );

    if (specificId) {
      query = query.eq("id", specificId);
    } else {
      query = query.eq("is_active", true).limit(50);
    }

    const { data: opportunities, error } = await query;

    if (error || !opportunities) {
      return NextResponse.json(
        { error: `Database query failed: ${error?.message || "Unknown error"}` },
        { status: 500 }
      );
    }

    let brokenCount = 0;
    let expiredCount = 0;
    let activeCount = 0;
    let transientErrorCount = 0;

    for (const opp of opportunities) {
      if (!opp.source_url) continue;

      // Helper for updating with column-level error fallback (code 42703)
      const safeUpdateOpportunity = async (updatePayload: Record<string, unknown>) => {
        const { error: updateErr } = await supabase
          .from("opportunities")
          .update(updatePayload)
          .eq("id", opp.id);

        if (updateErr && (updateErr.code === "42703" || updateErr.message?.toLowerCase().includes("does not exist"))) {
          // Fallback to basic columns if schema is unmigrated
          await supabase
            .from("opportunities")
            .update({ is_active: updatePayload.is_active })
            .eq("id", opp.id);
        }
      };

      // SSRF & Private Target Guard
      if (!isSafePublicHttpUrl(opp.source_url)) {
        brokenCount++;
        await safeUpdateOpportunity({
          is_active: false,
          verification_status: "broken_source",
          status_reason: "L'URL source a été rejetée par les contrôles de sécurité (adresse privée ou non publique).",
          last_checked_at: new Date().toISOString(),
          verification_evidence: {
            ...((opp.verification_evidence as Record<string, unknown>) || {}),
            urlReachable: false,
            checkedAt: new Date().toISOString(),
            notes: ["URL rejetée par les contrôles de sécurité (SSRF/adresse privée)."],
          },
        });
        continue;
      }

      let httpStatus = 200;
      let isTransientNetworkError = false;
      let pageSnippet = "";

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500);

        const res = await fetch(opp.source_url, {
          method: "GET",
          signal: controller.signal,
          redirect: "follow",
          headers: {
            "User-Agent": "SmartCVSender-FreshnessBot/1.0",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        });

        clearTimeout(timeoutId);
        httpStatus = res.status;

        if (res.ok) {
          const text = await res.text();
          pageSnippet = text.slice(0, 16384);
        } else {
          res.body?.cancel().catch(() => {});
        }
      } catch {
        // Timeout (AbortError) or network failure is transient; do NOT assume vacancy is closed
        isTransientNetworkError = true;
      }

      // 1. Transient network errors (timeouts, connection resets, 502/503/504)
      if (isTransientNetworkError || (httpStatus >= 500 && httpStatus <= 504)) {
        transientErrorCount++;
        // Maintain current active state conservatively — never deactivate on transient network hiccups
        // Record verification check attempt without altering date_posted or deactivating
        const existingEvidence = (opp.verification_evidence as Record<string, unknown>) || {};
        await safeUpdateOpportunity({
          last_checked_at: new Date().toISOString(),
          verification_evidence: {
            ...existingEvidence,
            checkedAt: new Date().toISOString(),
            notes: [
              `Re-vérification effectuée : incident réseau transitoire ou erreur serveur temporaire (${
                isTransientNetworkError ? "Délai dépassé / Non joignable" : `HTTP ${httpStatus}`
              }). Statut actif préservé.`,
            ],
          },
        });
        continue;
      }

      // 2. Definitive Not Found or Gone (HTTP 404 / 410)
      if (httpStatus === 404 || httpStatus === 410) {
        brokenCount++;
        await safeUpdateOpportunity({
          is_active: false,
          verification_status: "broken_source",
          status_reason: `L'URL source ne répond plus (code HTTP ${httpStatus}).`,
          last_checked_at: new Date().toISOString(),
          verification_evidence: {
            ...((opp.verification_evidence as Record<string, unknown>) || {}),
            urlReachable: false,
            httpStatusCode: httpStatus,
            checkedAt: new Date().toISOString(),
            notes: [`Lien source définitivement inaccessible (code HTTP ${httpStatus}).`],
          },
        });
        continue;
      }

      // 3. Reachable response: verify content signals (closed/expired wording)
      type CompanyJoin = { id?: string; name?: string; website?: string | null };
      const comp = opp.companies as unknown as CompanyJoin | null;
      const companyName = comp?.name || "Entreprise";
      const companyWebsite = comp?.website || undefined;

      const verification = verifyOpportunity({
        title: opp.title,
        sourceUrl: opp.source_url,
        sourceProvider: opp.source_provider || "recheck_cron",
        sourcePlatform: opp.source_platform || undefined,
        companyName,
        companyWebsite,
        description: opp.description || "",
        pageContentSnippet: pageSnippet,
        httpStatusCode: httpStatus,
        datePosted: opp.date_posted,
        validThrough: opp.valid_through,
        applicationUrl: opp.application_url,
        type: opp.type,
      });

      // CRITICAL LIFECYCLE RULE:
      // Never overwrite date_posted with recheck date. Preserve opp.date_posted.
      // Update last_checked_at, verification_status, status_reason, and verification_evidence.
      if (verification.status === "broken_source") {
        brokenCount++;
        await safeUpdateOpportunity({
          is_active: false,
          verification_status: "broken_source",
          status_reason: verification.statusReason,
          last_checked_at: new Date().toISOString(),
          verification_evidence: verification.evidence,
        });
      } else if (verification.status === "expired" || verification.status === "closed") {
        expiredCount++;
        await safeUpdateOpportunity({
          is_active: false,
          verification_status: verification.status,
          status_reason: verification.statusReason,
          closed_at: verification.evidence.closedAt || new Date().toISOString(),
          last_checked_at: new Date().toISOString(),
          verification_evidence: verification.evidence,
        });
      } else {
        activeCount++;
        await safeUpdateOpportunity({
          is_active: true,
          verification_status: verification.status,
          status_reason: verification.statusReason,
          last_checked_at: new Date().toISOString(),
          verification_evidence: verification.evidence,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: "Freshness recheck cycle completed successfully.",
      totalRechecked: opportunities.length,
      brokenCount,
      expiredCount,
      activeCount,
      transientErrorCount,
      durationMs: Date.now() - startTime,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected recheck error" },
      { status: 500 }
    );
  }
}
