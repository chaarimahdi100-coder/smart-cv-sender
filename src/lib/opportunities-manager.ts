import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";
import {
  TUNISIAN_OPPORTUNITIES_CATALOG,
  validateOpportunityPayload,
} from "./data/opportunities-catalog.ts";

if (typeof window !== "undefined") {
  throw new Error("opportunities-manager must only be imported in server-side context.");
}

/**
 * Returns a privileged Supabase client bypassing RLS if SUPABASE_SERVICE_ROLE_KEY is present in the environment.
 * Used exclusively for safe server-side catalog administration and seeding.
 */
export function getServiceRoleClient(): SupabaseClient | null {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (serviceKey && supabaseUrl) {
    return createSupabaseClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return null;
}

export interface ImportResult {
  success: boolean;
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/**
 * Ensures a company and its contact exist, returning the company ID.
 */
async function ensureCompanyAndContact(
  supabase: SupabaseClient,
  companyName: string,
  sector: string,
  website: string,
  contactEmail: string,
  sourceUrl?: string
): Promise<{ companyId: string | null; error?: string }> {
  // 1. Check if company already exists
  const { data: existingCompany } = await supabase
    .from("companies")
    .select("id")
    .ilike("name", companyName.trim())
    .maybeSingle();

  let companyId = existingCompany?.id;

  if (!companyId) {
    const { data: newCompany, error: createCompanyErr } = await supabase
      .from("companies")
      .insert({
        name: companyName.trim(),
        sector: sector || "Technologies",
        website: website || "https://example.tn",
        country: "Tunisia",
        source: "opportunities-manager",
      })
      .select("id")
      .single();

    if (createCompanyErr || !newCompany) {
      return { companyId: null, error: `Erreur création entreprise: ${createCompanyErr?.message || "inconnue"}` };
    }
    companyId = newCompany.id;
  }

  // 2. Ensure contact email exists
  if (contactEmail && companyId) {
    const { data: existingContact } = await supabase
      .from("company_contacts")
      .select("id")
      .eq("company_id", companyId)
      .ilike("email", contactEmail.trim())
      .maybeSingle();

    if (!existingContact) {
      await supabase.from("company_contacts").insert({
        company_id: companyId,
        email: contactEmail.trim().toLowerCase(),
        source_url: sourceUrl || website,
        is_verified: false, // Demo/simulation contacts default to false
      });
    }
  }

  return { companyId: companyId || null };
}

/**
 * Creates a single opportunity after strict payload validation.
 */
export async function createOpportunityRecord(
  supabase: SupabaseClient,
  rawPayload: unknown
): Promise<{ success: boolean; id?: string; error?: string }> {
  const validation = validateOpportunityPayload(rawPayload);
  if (!validation.valid || !validation.data) {
    return { success: false, error: validation.errors?.join("; ") || "Données d'opportunité invalides." };
  }

  const opp = validation.data;

  // Duplicate check by sourceUrl or identical title + company
  const { data: existingByUrl } = await supabase
    .from("opportunities")
    .select("id")
    .eq("source_url", opp.sourceUrl)
    .maybeSingle();

  if (existingByUrl) {
    return { success: false, error: `Une opportunité avec cette URL source existe déjà (ID: ${existingByUrl.id}).` };
  }

  const { companyId, error: compErr } = await ensureCompanyAndContact(
    supabase,
    opp.companyName,
    opp.companySector,
    opp.companyWebsite,
    opp.contactEmail,
    opp.sourceUrl
  );

  if (!companyId || compErr) {
    return { success: false, error: compErr || "Impossible d'associer l'entreprise." };
  }

  const { data: newOpp, error: oppErr } = await supabase
    .from("opportunities")
    .insert({
      company_id: companyId,
      title: opp.title,
      type: opp.type,
      domain: opp.domain,
      description: opp.description,
      location: opp.location,
      source_url: opp.sourceUrl,
      is_active: true,
    })
    .select("id")
    .single();

  if (oppErr || !newOpp) {
    return { success: false, error: oppErr?.message || "Échec d'insertion de l'opportunité." };
  }

  return { success: true, id: newOpp.id };
}

/**
 * Updates an existing opportunity's editable fields.
 */
export async function updateOpportunityRecord(
  supabase: SupabaseClient,
  opportunityId: string,
  updates: {
    title?: string;
    type?: string;
    location?: string;
    domain?: string;
    description?: string;
    sourceUrl?: string;
    isActive?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  if (!opportunityId) {
    return { success: false, error: "Identifiant d'opportunité requis." };
  }

  const payloadToUpdate: Record<string, unknown> = {};
  if (updates.title !== undefined) payloadToUpdate.title = updates.title.trim();
  if (updates.type !== undefined) payloadToUpdate.type = updates.type.trim().toUpperCase();
  if (updates.location !== undefined) payloadToUpdate.location = updates.location.trim();
  if (updates.domain !== undefined) payloadToUpdate.domain = updates.domain.trim();
  if (updates.description !== undefined) payloadToUpdate.description = updates.description.trim();
  if (updates.sourceUrl !== undefined) payloadToUpdate.source_url = updates.sourceUrl.trim();
  if (updates.isActive !== undefined) payloadToUpdate.is_active = updates.isActive;

  const { error } = await supabase
    .from("opportunities")
    .update(payloadToUpdate)
    .eq("id", opportunityId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Toggles the active status of an opportunity (activate or deactivate).
 */
export async function toggleOpportunityActive(
  supabase: SupabaseClient,
  opportunityId: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  return updateOpportunityRecord(supabase, opportunityId, { isActive });
}

/**
 * Batch imports an array of opportunities from JSON or validated object array.
 * Deduplicates by source_url and updates or skips existing items.
 */
export async function importOpportunitiesBatch(
  supabase: SupabaseClient,
  items: unknown[]
): Promise<ImportResult> {
  const result: ImportResult = {
    success: true,
    total: items.length,
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  for (let i = 0; i < items.length; i++) {
    const rawItem = items[i];
    const validation = validateOpportunityPayload(rawItem);

    if (!validation.valid || !validation.data) {
      result.errors.push(`Ligne #${i + 1}: ${validation.errors?.join(", ")}`);
      result.skipped++;
      continue;
    }

    const opp = validation.data;

    // Check if duplicate exists by source_url
    const { data: existing } = await supabase
      .from("opportunities")
      .select("id, title")
      .eq("source_url", opp.sourceUrl)
      .maybeSingle();

    if (existing) {
      // Update existing record
      const updateRes = await updateOpportunityRecord(supabase, existing.id, {
        title: opp.title,
        type: opp.type,
        location: opp.location,
        domain: opp.domain,
        description: opp.description,
        isActive: true,
      });

      if (updateRes.success) {
        result.updated++;
      } else {
        result.errors.push(`Ligne #${i + 1} (${opp.title}): Échec de mise à jour: ${updateRes.error}`);
        result.skipped++;
      }
      continue;
    }

    // Insert new
    const createRes = await createOpportunityRecord(supabase, opp);
    if (createRes.success) {
      result.imported++;
    } else {
      result.errors.push(`Ligne #${i + 1} (${opp.title}): ${createRes.error}`);
      result.skipped++;
    }
  }

  result.success = result.errors.length === 0 || result.imported > 0 || result.updated > 0;
  return result;
}

/**
 * Idempotently seeds the curated 10 Tunisian tech opportunities into the database.
 * If SUPABASE_SERVICE_ROLE_KEY is present in the environment, it uses the privileged client
 * to bypass RLS; otherwise falls back to the provided authenticated client.
 */
export async function seedTunisianOpportunitiesCatalog(
  supabase: SupabaseClient
): Promise<ImportResult> {
  const privilegedClient = getServiceRoleClient();
  const clientToUse = privilegedClient || supabase;
  return importOpportunitiesBatch(clientToUse, TUNISIAN_OPPORTUNITIES_CATALOG);
}
