"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { discoveryEngine } from "@/lib/discovery/engine";
import { importOpportunityFromUrl } from "@/lib/discovery/manual-importer";
import { getRegisteredSources } from "@/lib/discovery/registry";
import { SyncReport, SourceRegistryItem, DiscoveredOpportunity } from "@/lib/discovery/types";
import { getServiceRoleClient } from "@/lib/opportunities-manager";

import { isAuthorizedOpportunityManager } from "@/lib/auth/admin-auth";

/**
 * Server Action: Triggers a multi-source real-time discovery and verification cycle.
 */
export async function runDiscoverySyncAction(): Promise<{
  success: boolean;
  report?: SyncReport;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: "Authentification requise pour lancer la découverte d'opportunités.",
    };
  }

  // The discovery engine syncs verified external leads (Greenhouse ATS, Curated Catalog, Search Leads)
  // into the public opportunities directory. Persisting to the catalog requires the service role client.
  const serviceClient = getServiceRoleClient();
  const isManager = isAuthorizedOpportunityManager(user).authorized;
  const clientToUse = serviceClient || (isManager ? supabase : null);

  try {
    const report = await discoveryEngine.runDiscoverySync(clientToUse);
    revalidatePath("/opportunities");

    const hasRlsError = report.errors.some(
      (e) => e.includes("42501") || e.toLowerCase().includes("row-level security") || e.toLowerCase().includes("service_role_key")
    );

    const hasSavedRecords = report.persistedCount > 0;
    const isSuccess = hasSavedRecords || (report.errors.length === 0 && report.totalLeadsDiscovered === 0);

    let errorMsg: string | undefined;
    if (!hasSavedRecords) {
      if (!serviceClient) {
        errorMsg = "Découverte effectuée en mémoire, mais l'enregistrement en base requiert la configuration de SUPABASE_SERVICE_ROLE_KEY.";
      } else if (hasRlsError) {
        errorMsg = "Échec d'enregistrement : politiques RLS restrictives (SUPABASE_SERVICE_ROLE_KEY requise).";
      } else if (report.errors.length > 0) {
        errorMsg = report.errors[0];
      }
    }

    return {
      success: isSuccess,
      report,
      error: errorMsg,
    };
  } catch (err) {
    return {
      success: false,
      error: `Échec du cycle de découverte : ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Server Action: Imports an opportunity from a user-supplied URL with automatic extraction.
 */
export async function importManualOpportunityAction(formData: FormData): Promise<{
  success: boolean;
  opportunity?: DiscoveredOpportunity;
  message?: string;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: "Authentification requise pour importer une offre.",
    };
  }

  const rawUrl = String(formData.get("url") || "").trim();
  if (!rawUrl) {
    return {
      success: false,
      error: "Veuillez saisir une URL valide.",
    };
  }

  try {
    const importRes = await importOpportunityFromUrl(rawUrl);
    if (!importRes.success || !importRes.opportunity) {
      return {
        success: false,
        error: importRes.error || "Impossible d'extraire les informations de cette page.",
      };
    }

    // Persist to database: privileged client takes precedence, otherwise manager client
    const serviceClient = getServiceRoleClient();
    const isManager = isAuthorizedOpportunityManager(user).authorized;
    const clientToPersist = serviceClient || (isManager ? supabase : null);

    if (!clientToPersist) {
      return {
        success: false,
        opportunity: importRes.opportunity,
        error: "L'enregistrement d'une opportunité dans le répertoire requiert un profil administrateur ou la clé SUPABASE_SERVICE_ROLE_KEY.",
      };
    }

    const persistResult = await discoveryEngine.persistOpportunity(clientToPersist, importRes.opportunity);
    revalidatePath("/opportunities");

    let message = importRes.message;
    if (persistResult.partialMetadata) {
      message = `${message || "Offre importée."} (Avertissement: persistance partielle en colonnes de base - appliquez les migrations 08 & 09 pour stocker les métadonnées complètes).`;
    }

    return {
      success: persistResult.success,
      opportunity: importRes.opportunity,
      message,
      error: persistResult.success ? undefined : persistResult.error,
    };
  } catch (err) {
    return {
      success: false,
      error: `Erreur lors de l'import : ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Server Action: Retrieves the current list of registered discovery sources.
 */
export async function getSourceRegistryAction(): Promise<{
  sources: SourceRegistryItem[];
}> {
  return {
    sources: getRegisteredSources(),
  };
}
