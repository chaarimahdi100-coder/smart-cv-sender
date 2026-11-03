"use server";

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { buildDraftPayload, isTrustedRecruiterEmail } from "@/lib/draft-utils";
import {
  generateProfessionalEmailDraft,
  resolveExactProgramName,
  validateAndNormalizeDegreeClaims,
  validateAndNormalizeDegreeSubject,
  type CandidateData,
  type OpportunityData,
} from "@/lib/email-generator";
import {
  detectOpportunitySeniority,
  detectCandidateSeniority,
  validateAndNormalizeSeniorityClaims,
} from "@/lib/seniority-detector";
import {
  detectAvailabilityConflict,
  validateAndNormalizeAvailabilityClaims,
  validateAndNormalizeAvailabilitySubject,
} from "@/lib/availability-detector";
import { recordDraftProvenance } from "@/lib/draft-provenance";
import { extractRawPdfText } from "@/lib/cv-parser";

export async function createApplicationDraft(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const opportunityId = String(formData.get("opportunity_id") || "");
  const resumeId = String(formData.get("resume_id") || "");
  if (!opportunityId || !resumeId) throw new Error("Missing required fields");

  const { data: opportunity, error: opportunityError } = await supabase
    .from("opportunities")
    .select("id, company_id, title, description, type, date_posted, valid_through, source_url, source_provider, application_url, is_active, verification_status, companies(name)")
    .eq("id", opportunityId)
    .single();
  if (opportunityError || !opportunity) throw new Error("Opportunity not found");

  const isPastDeadline = opportunity.valid_through
    ? new Date(opportunity.valid_through).getTime() < Date.now()
    : false;
  if (
    opportunity.verification_status === "closed" ||
    opportunity.verification_status === "expired" ||
    opportunity.is_active === false ||
    isPastDeadline
  ) {
    throw new Error(
      "Cette opportunité est clôturée ou expirée. Il est impossible de générer un brouillon pour une offre fermée."
    );
  }

  const { data: resume } = await supabase
    .from("resumes")
    .select("id, storage_path, extracted_data")
    .eq("id", resumeId)
    .eq("user_id", user.id)
    .single();
  if (!resume) throw new Error("Resume not found or access denied");

  // Fetch candidate profile for verified facts
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  // Check if an application already exists for this opportunity
  const { data: existingApp } = await supabase
    .from("applications")
    .select("id, resume_id")
    .eq("user_id", user.id)
    .eq("opportunity_id", opportunityId)
    .maybeSingle();

  let targetAppId = existingApp?.id;

  if (existingApp) {
    targetAppId = existingApp.id;
    if (existingApp.resume_id !== resumeId) {
      // Route resume update through save_email_draft_atomic to invalidate any stale approval
      let updatedViaRpc = false;
      try {
        type SaveRpcResult = { data: { success?: boolean; error?: string } | null; error: { code?: string; message: string } | null };
        const { data: rpcData, error: rpcError } = (await supabase.rpc("save_email_draft_atomic", {
          p_application_id: existingApp.id,
          p_recipient: null,
          p_subject: null,
          p_body: null,
          p_resume_id: resumeId,
        })) as unknown as SaveRpcResult;

        if (!rpcError && rpcData?.success) {
          updatedViaRpc = true;
        }
      } catch {
        // Fallback for unmigrated environments
      }

      if (!updatedViaRpc) {
        try {
          await supabase
            .from("applications")
            .update({ resume_id: resumeId, status: "draft", updated_at: new Date().toISOString() })
            .eq("id", existingApp.id)
            .eq("user_id", user.id);
        } catch {
          // Direct update revoked when migration is active
        }
      }
    }
  } else {
    const { data: app, error: appError } = await supabase
      .from("applications")
      .insert({
        user_id: user.id,
        company_id: opportunity.company_id,
        opportunity_id: opportunityId,
        resume_id: resumeId,
        status: "draft",
      })
      .select("id")
      .single();

    if (appError || !app) {
      throw new Error("Failed to create application: " + (appError?.message || "Unknown error"));
    }
    targetAppId = app.id;
  }

  // Check whether an email draft already exists for this application
  const { data: existingDraft } = await supabase
    .from("email_drafts")
    .select("id")
    .eq("application_id", targetAppId)
    .maybeSingle();

  if (!existingDraft) {
    const { data: contact } = await supabase
      .from("company_contacts")
      .select("email, is_verified")
      .eq("company_id", opportunity.company_id)
      .eq("is_verified", true)
      .limit(1)
      .maybeSingle();

    const verifiedContactEmail =
      contact?.is_verified && isTrustedRecruiterEmail(contact.email)
        ? contact.email.trim()
        : null;

    type ExtractedPayload = {
      data?: {
        first_name?: string;
        last_name?: string;
        school?: string;
        degree?: string;
        specialty?: string;
        languages?: string[];
        skills?: string[];
      };
      rawText?: string;
    };
    const ext = (resume.extracted_data || {}) as ExtractedPayload;
    const extData = ext.data || {};

    let rawCvText = ext.rawText;
    if (!rawCvText && resume.storage_path) {
      try {
        const { data: fileBlob } = await supabase.storage.from("resumes").download(resume.storage_path);
        if (fileBlob) {
          const arrayBuffer = await fileBlob.arrayBuffer();
          const extracted = await extractRawPdfText(new Uint8Array(arrayBuffer));
          rawCvText = extracted.text;
          if (rawCvText) {
            await supabase
              .from("resumes")
              .update({
                extracted_data: { ...ext, rawText: rawCvText },
              })
              .eq("id", resume.id);
          }
        }
      } catch (err) {
        console.warn("Could not download resume from storage for raw text extraction:", err);
      }
    }

    const effectiveCvText = rawCvText || ext.rawText;
    const cvCandidateForDegree: CandidateData = {
      school: extData.school || profile?.school,
      degree: extData.degree,
      specialty: extData.specialty || profile?.specialty,
      rawCvText: effectiveCvText,
    };

    const accurateDegree = resolveExactProgramName(cvCandidateForDegree) || extData.degree || profile?.degree;

    const candidateData: CandidateData = {
      first_name: profile?.first_name || extData.first_name,
      last_name: profile?.last_name || extData.last_name,
      email: user.email,
      phone: profile?.phone,
      school: profile?.school || extData.school,
      degree: accurateDegree,
      specialty: extData.specialty || profile?.specialty,
      languages: profile?.languages || extData.languages,
      city: profile?.city,
      country: profile?.country,
      rawCvText: effectiveCvText,
      skills: extData.skills,
    };

    type CompanyJoin = { name?: string };
    const comp = opportunity.companies as unknown as CompanyJoin | null;

    const opportunityData: OpportunityData = {
      title: opportunity.title,
      companyName: comp?.name,
      description: opportunity.description,
      type: opportunity.type,
      date_posted: opportunity.date_posted,
      valid_through: opportunity.valid_through,
      source_url: opportunity.source_url,
      source_provider: opportunity.source_provider,
      application_url: opportunity.application_url,
    };

    const roleSen = detectOpportunitySeniority(opportunityData);
    const candSen = detectCandidateSeniority(candidateData);
    const hasSeniorityMismatch =
      (roleSen.level === "manager" || roleSen.level === "executive" || roleSen.level === "senior") &&
      (candSen.level === "student" || candSen.level === "entry_level");

    if (hasSeniorityMismatch) {
      const confirmed = formData.get("confirm_seniority_gap") === "true";
      if (!confirmed) {
        throw new Error(
          `Confirmation requise : Veuillez confirmer que vous avez pris connaissance de l'écart de séniorité pour ce poste (${roleSen.label}) avant de générer le brouillon.`
        );
      }
    }

    const conflictCheck = detectAvailabilityConflict(candidateData, opportunityData);
    const conflictStrategy = conflictCheck.hasConflict ? "unresolved" : undefined;

    const generated = await generateProfessionalEmailDraft(candidateData, opportunityData, {
      conflictStrategy,
    });
    const normalizedSubject = validateAndNormalizeAvailabilitySubject(
      validateAndNormalizeDegreeSubject(generated.subject, candidateData),
      candidateData,
      opportunityData,
      conflictStrategy
    );
    const normalizedBody = validateAndNormalizeAvailabilityClaims(
      validateAndNormalizeSeniorityClaims(
        validateAndNormalizeDegreeClaims(generated.body, candidateData),
        candidateData,
        opportunityData
      ),
      candidateData,
      opportunityData,
      conflictStrategy
    );
    console.log(`[createApplicationDraft] Generated draft for application ${targetAppId}: isAiGenerated=${generated.isAiGenerated}, provider=${generated.provider}, model=${generated.model || "none"}, fallbackReason=${generated.fallbackReason || "none"}`);

    const draftPayload = buildDraftPayload({
      applicationId: targetAppId,
      opportunityTitle: opportunity.title,
      userEmail: user.email || "",
      contactEmail: verifiedContactEmail,
      subject: normalizedSubject,
      body: normalizedBody,
      conflict_resolution: null,
    });

    const { data: draft, error: draftError } = await supabase
      .from("email_drafts")
      .insert(draftPayload)
      .select("id")
      .single();

    if (draftError || !draft) {
      throw new Error("Failed to create email draft: " + (draftError?.message || "Unknown error"));
    }

    recordDraftProvenance(targetAppId, {
      draftId: draft.id,
      provider: generated.provider,
      model: generated.model,
      isAiGenerated: generated.isAiGenerated,
      fallbackReason: generated.fallbackReason,
    });
  }

  redirect(`/applications/${targetAppId}/draft`);
}


/**
 * Direct platform application submission without customized email generation.
 * Links the applicant's verified CV to the opportunity with status 'approved' (ready/submitted).
 */
export async function submitDirectApplication(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const opportunityId = String(formData.get("opportunity_id") || "");
  const resumeId = String(formData.get("resume_id") || "");
  if (!opportunityId || !resumeId) throw new Error("Missing required fields");

  const { data: opportunity, error: opportunityError } = await supabase
    .from("opportunities")
    .select("id, company_id, title, is_active, verification_status, valid_through")
    .eq("id", opportunityId)
    .single();

  if (opportunityError || !opportunity) throw new Error("Opportunity not found");

  const isPastDeadline = opportunity.valid_through
    ? new Date(opportunity.valid_through).getTime() < Date.now()
    : false;
  if (
    opportunity.verification_status === "closed" ||
    opportunity.verification_status === "expired" ||
    opportunity.is_active === false ||
    isPastDeadline
  ) {
    throw new Error("Cette opportunité est clôturée ou expirée.");
  }

  const { data: resume } = await supabase
    .from("resumes")
    .select("id")
    .eq("id", resumeId)
    .eq("user_id", user.id)
    .single();
  if (!resume) throw new Error("Resume not found or access denied");

  const { data: existingApp } = await supabase
    .from("applications")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("opportunity_id", opportunityId)
    .maybeSingle();

  if (existingApp) {
    await supabase
      .from("applications")
      .update({
        resume_id: resumeId,
        status: "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingApp.id)
      .eq("user_id", user.id);
  } else {
    const { error: appError } = await supabase
      .from("applications")
      .insert({
        user_id: user.id,
        company_id: opportunity.company_id,
        opportunity_id: opportunityId,
        resume_id: resumeId,
        status: "approved",
      });

    if (appError) {
      throw new Error("Failed to submit application: " + appError.message);
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/opportunities");
  redirect("/dashboard?success=" + encodeURIComponent("Votre candidature a été enregistrée avec succès !"));
}
