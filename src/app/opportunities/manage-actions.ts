"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { isAuthorizedOpportunityManager } from "@/lib/auth/admin-auth";
import {
  createOpportunityRecord,
  updateOpportunityRecord,
  toggleOpportunityActive,
  importOpportunitiesBatch,
  seedTunisianOpportunitiesCatalog,
  getServiceRoleClient,
  ImportResult,
} from "@/lib/opportunities-manager";

/**
 * Server Action: Seeds the curated 10 Tunisian tech opportunities catalog.
 * Protected: Requires authenticated user. In production, checks manager authorization.
 * In development / demo environments, permits any authenticated candidate to seed illustrative listings.
 */
export async function seedTunisianOpportunitiesAction(): Promise<{
  success: boolean;
  message?: string;
  result?: ImportResult;
  error?: string;
  rlsRestricted?: boolean;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: "Authentification requise : vous devez être connecté pour synchroniser le catalogue.",
    };
  }

  const authCheck = isAuthorizedOpportunityManager(user);
  if (!authCheck.authorized) {
    return {
      success: false,
      error: authCheck.reason || "Accès refusé : seuls les gestionnaires autorisés (ADMIN_EMAILS) peuvent modifier le catalogue d'opportunités.",
    };
  }

  const importResult = await seedTunisianOpportunitiesCatalog(supabase);
  revalidatePath("/opportunities");

  const hasRlsError = importResult.errors.some(
    (e) => e.includes("42501") || e.toLowerCase().includes("row-level security")
  );

  if (hasRlsError && importResult.imported === 0 && importResult.updated === 0) {
    return {
      success: false,
      rlsRestricted: true,
      error:
        "Insertion bloquée par les politiques RLS de Supabase (absence de clé SUPABASE_SERVICE_ROLE_KEY). Pour insérer les 10 offres en base sans clé de service, exécutez le script SQL idempotent 'supabase/seed_tunisian_opportunities.sql' dans l'éditeur SQL de Supabase.",
      result: importResult,
    };
  }

  return {
    success: importResult.success,
    message: `Catalogue synchronisé avec succès : ${importResult.imported} importée(s), ${importResult.updated} mise(s) à jour, ${importResult.skipped} ignorée(s).`,
    result: importResult,
  };
}

/**
 * Form action wrapper for seedTunisianOpportunitiesAction.
 */
export async function seedTunisianOpportunitiesFormAction(): Promise<void> {
  await seedTunisianOpportunitiesAction();
}

/**
 * Server Action: Creates a single opportunity manually.
 * Protected: Requires authorized manager.
 */
export async function createOpportunityAction(formData: FormData): Promise<{
  success: boolean;
  id?: string;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const authCheck = isAuthorizedOpportunityManager(user);
  if (!authCheck.authorized) {
    return { success: false, error: authCheck.reason || "Action non autorisée." };
  }

  const payload = {
    title: String(formData.get("title") || ""),
    companyName: String(formData.get("company_name") || ""),
    companySector: String(formData.get("company_sector") || "Technologies"),
    companyWebsite: String(formData.get("company_website") || "https://example.tn"),
    location: String(formData.get("location") || ""),
    type: String(formData.get("type") || "JUNIOR"),
    domain: String(formData.get("domain") || "Informatique"),
    description: String(formData.get("description") || ""),
    contactEmail: String(formData.get("contact_email") || ""),
    sourceUrl: String(formData.get("source_url") || ""),
    isDemo: formData.get("is_demo") === "true" || formData.get("is_demo") === "on",
  };

  const result = await createOpportunityRecord(supabase, payload);
  if (result.success) {
    revalidatePath("/opportunities");
  }

  return result;
}

/**
 * Server Action: Toggles opportunity active state (Activate / Deactivate).
 * Protected: Requires authorized manager.
 */
export async function toggleOpportunityActiveAction(
  opportunityId: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const authCheck = isAuthorizedOpportunityManager(user);
  if (!authCheck.authorized) {
    return { success: false, error: authCheck.reason || "Action non autorisée." };
  }

  const result = await toggleOpportunityActive(supabase, opportunityId, isActive);
  if (result.success) {
    revalidatePath("/opportunities");
  }

  return result;
}

/**
 * Server Action: Updates an existing opportunity.
 * Protected: Requires authorized manager.
 */
export async function editOpportunityAction(
  opportunityId: string,
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const authCheck = isAuthorizedOpportunityManager(user);
  if (!authCheck.authorized) {
    return { success: false, error: authCheck.reason || "Action non autorisée." };
  }

  const updates = {
    title: formData.get("title") ? String(formData.get("title")) : undefined,
    type: formData.get("type") ? String(formData.get("type")) : undefined,
    location: formData.get("location") ? String(formData.get("location")) : undefined,
    domain: formData.get("domain") ? String(formData.get("domain")) : undefined,
    description: formData.get("description") ? String(formData.get("description")) : undefined,
    sourceUrl: formData.get("source_url") ? String(formData.get("source_url")) : undefined,
  };

  const result = await updateOpportunityRecord(supabase, opportunityId, updates);
  if (result.success) {
    revalidatePath("/opportunities");
  }

  return result;
}

/**
 * Server Action: Batch imports opportunities from a JSON string payload.
 * Protected: Requires authorized manager.
 */
export async function importOpportunitiesJsonAction(jsonString: string): Promise<ImportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const authCheck = isAuthorizedOpportunityManager(user);
  if (!authCheck.authorized) {
    return {
      success: false,
      total: 0,
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: [authCheck.reason || "Action non autorisée."],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    return {
      success: false,
      total: 0,
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: [`Format JSON invalide: ${err instanceof Error ? err.message : "Erreur de syntaxe"}`],
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      success: false,
      total: 0,
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: ["Le contenu JSON doit être un tableau d'opportunités [ {...}, {...} ]."],
    };
  }

  const result = await importOpportunitiesBatch(supabase, parsed);
  revalidatePath("/opportunities");
  return result;
}


export interface OpportunityApplicant {
  id: string;
  applicationId: string;
  userId: string;
  candidateName: string;
  email?: string;
  school?: string;
  degree?: string;
  specialty?: string;
  status: string;
  appliedAt: string;
  resumeDownloadUrl?: string;
  resumeFilename?: string;
}

/**
 * Server Action: Fetches all candidates who applied to a specific opportunity.
 * Protected: Requires authorized manager (ADMIN_EMAILS).
 * Generates signed URLs for candidates' CVs so managers can review them.
 */
export async function getOpportunityApplicantsAction(
  opportunityId: string
): Promise<{ success: boolean; applicants?: OpportunityApplicant[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const authCheck = isAuthorizedOpportunityManager(user);
  if (!authCheck.authorized) {
    return { success: false, error: authCheck.reason || "Action non autorisée." };
  }

  const adminClient = getServiceRoleClient() || supabase;

  const { data: applications, error: appError } = await adminClient
    .from("applications")
    .select(`
      id,
      user_id,
      resume_id,
      status,
      created_at,
      profiles:user_id (id, first_name, last_name, school, degree, specialty),
      resumes:resume_id (id, storage_path)
    `)
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: false });

  if (appError) {
    return { success: false, error: "Erreur lors de la récupération des candidatures : " + appError.message };
  }

  type RawApp = {
    id: string;
    user_id: string;
    resume_id: string | null;
    status: string;
    created_at: string;
    profiles: {
      id?: string;
      first_name?: string | null;
      last_name?: string | null;
      school?: string | null;
      degree?: string | null;
      specialty?: string | null;
    } | null;
    resumes: {
      id?: string;
      storage_path?: string | null;
    } | null;
  };

  const rawList = (applications || []) as unknown as RawApp[];
  const applicants: OpportunityApplicant[] = [];

  for (const app of rawList) {
    let resumeUrl: string | undefined = undefined;
    let resumeFilename: string | undefined = undefined;

    if (app.resumes?.storage_path) {
      try {
        const { data: signed } = await adminClient.storage
          .from("resumes")
          .createSignedUrl(app.resumes.storage_path, 300);
        if (signed?.signedUrl) {
          resumeUrl = signed.signedUrl;
          resumeFilename = app.resumes.storage_path.split("/").pop() || "CV.pdf";
        }
      } catch {
        // Continue if signed URL generation fails for an individual CV
      }
    }

    const prof = app.profiles;
    const nameParts = [prof?.first_name, prof?.last_name].filter(Boolean);
    const candidateName = nameParts.length > 0 ? nameParts.join(" ") : "Candidat Anonyme";

    applicants.push({
      id: app.id,
      applicationId: app.id,
      userId: app.user_id,
      candidateName,
      school: prof?.school || undefined,
      degree: prof?.degree || undefined,
      specialty: prof?.specialty || undefined,
      status: app.status,
      appliedAt: app.created_at,
      resumeDownloadUrl: resumeUrl,
      resumeFilename,
    });
  }

  return { success: true, applicants };
}

/**
 * Server Action: Updates candidate review status (e.g. 'approved', 'replied', 'closed').
 * Protected: Requires authorized manager.
 */
export async function updateApplicantReviewStatusAction(
  applicationId: string,
  newStatus: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const authCheck = isAuthorizedOpportunityManager(user);
  if (!authCheck.authorized) {
    return { success: false, error: authCheck.reason || "Action non autorisée." };
  }

  const adminClient = getServiceRoleClient() || supabase;

  const { error } = await adminClient
    .from("applications")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", applicationId);

  if (error) {
    return { success: false, error: "Échec de mise à jour du statut : " + error.message };
  }

  revalidatePath("/opportunities");
  return { success: true };
}
