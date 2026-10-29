"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { computeDraftHash } from "@/lib/draft-integrity.js";
import { buildDraftPayload, isPlaceholderOrUntrustedEmail, isTrustedRecruiterEmail } from "@/lib/draft-utils";
import { generateProfessionalEmailDraft, resolveExactProgramName, type CandidateData, type OpportunityData } from "@/lib/email-generator";
import { recordDraftProvenance } from "@/lib/draft-provenance";
import { extractRawPdfText } from "@/lib/cv-parser";
import { checkRateLimit } from "@/lib/rate-limiter";
import { validateApprovedEmailForSend } from "@/lib/send-validation";
import { sendEmailMock } from "@/lib/email-sender";
import {
  validateAndNormalizeSeniorityClaims,
  detectStaleDraftClaims,
} from "@/lib/seniority-detector";
import {
  detectAvailabilityConflict,
  extractCandidateAvailability,
  validateAndNormalizeAvailabilityClaims,
  validateAndNormalizeAvailabilitySubject,
} from "@/lib/availability-detector";
import {
  validateAndNormalizeDegreeClaims,
  validateAndNormalizeDegreeSubject,
} from "@/lib/email-generator";
import { getServiceRoleClient } from "@/lib/opportunities-manager";

export { computeDraftHash };

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

async function ownedApplication(
  supabase: Awaited<ReturnType<typeof createClient>>,
  appId: string,
  userId: string
) {
  const { data, error } = await supabase
    .from("applications")
    .select("id, resume_id, opportunity_id, company_id, status")
    .eq("id", appId)
    .eq("user_id", userId)
    .single();

  if (error || !data) throw new Error("Application not found or access denied");
  return data;
}

async function ownedResume(
  supabase: Awaited<ReturnType<typeof createClient>>,
  resumeId: string,
  userId: string
) {
  const { data, error } = await supabase
    .from("resumes")
    .select("id, storage_path, extracted_data")
    .eq("id", resumeId)
    .eq("user_id", userId)
    .single();

  if (error || !data) throw new Error("Resume not found or access denied");
  return data;
}

async function fetchCandidateAndOpportunity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  userEmail?: string | null,
  appOpportunityId?: string,
  resumeId?: string | null
): Promise<{ candidateData: CandidateData; opportunityData: OpportunityData }> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

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
  let ext: ExtractedPayload = {};
  let rawCvText: string | undefined = undefined;

  if (resumeId) {
    const { data: resume } = await supabase
      .from("resumes")
      .select("id, storage_path, extracted_data")
      .eq("id", resumeId)
      .eq("user_id", userId)
      .maybeSingle();

    if (resume?.extracted_data) {
      ext = resume.extracted_data as ExtractedPayload;
      rawCvText = ext.rawText;
    }

    if (!rawCvText && resume?.storage_path) {
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
  }

  const extData = ext.data || {};
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
    email: userEmail,
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

  let oppTitle = "";
  let oppDesc: string | null = null;
  let oppType: string | null = null;
  let compName: string | null = null;
  let datePosted: string | null = null;
  let validThrough: string | null = null;
  let sourceUrl: string | null = null;
  let sourceProvider: string | null = null;
  let applicationUrl: string | null = null;

  if (appOpportunityId) {
    const { data: opp } = await supabase
      .from("opportunities")
      .select("title, description, type, company_id, date_posted, valid_through, source_url, source_provider, application_url, companies(name)")
      .eq("id", appOpportunityId)
      .maybeSingle();

    if (opp) {
      oppTitle = opp.title;
      oppDesc = opp.description;
      oppType = opp.type;
      datePosted = opp.date_posted;
      validThrough = opp.valid_through;
      sourceUrl = opp.source_url;
      sourceProvider = opp.source_provider;
      applicationUrl = opp.application_url;
      type CompanyJoin = { name?: string };
      compName = (opp.companies as unknown as CompanyJoin)?.name || null;
    }
  }

  const opportunityData: OpportunityData = {
    title: oppTitle,
    companyName: compName,
    description: oppDesc,
    type: oppType,
    date_posted: datePosted,
    valid_through: validThrough,
    source_url: sourceUrl,
    source_provider: sourceProvider,
    application_url: applicationUrl,
  };

  return { candidateData, opportunityData };
}

/**
 * Saves edits to the email draft (recipient, subject, body, and attached CV).
 * Resets approval state since draft content changed.
 */
export async function saveDraft(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?error=" + encodeURIComponent("Please log in to save your draft."));
  }

  const appId = text(formData, "application_id").trim();
  const recipient = text(formData, "recipient_email").trim();
  const subject = text(formData, "subject").trim();
  const body = text(formData, "body");
  const resumeId = text(formData, "resume_id").trim();

  if (!appId) {
    redirect("/dashboard?error=" + encodeURIComponent("Missing application ID."));
  }

  // Recipient email validation
  if (recipient) {
    if (!validEmail(recipient)) {
      redirect(`/applications/${appId}/draft?error=${encodeURIComponent("Please enter a valid recipient email address.")}`);
    }
    if (isPlaceholderOrUntrustedEmail(recipient)) {
      redirect(`/applications/${appId}/draft?error=${encodeURIComponent("Placeholder or synthetic email addresses (such as recruiter@example.com) cannot be used as recipients. Please provide a verified recruiter address or leave blank.")}`);
    }
  }

  if (!subject) {
    redirect(`/applications/${appId}/draft?error=${encodeURIComponent("Subject line cannot be empty.")}`);
  }

  if (!body.trim()) {
    redirect(`/applications/${appId}/draft?error=${encodeURIComponent("Message body cannot be empty.")}`);
  }

  try {
    const app = await ownedApplication(supabase, appId, user.id);
    if (app.status === "sending" || app.status === "sent") {
      redirect(`/applications/${appId}/draft?error=${encodeURIComponent(`This application is currently ${app.status} and cannot be edited.`)}`);
    }

    const { candidateData, opportunityData } = await fetchCandidateAndOpportunity(
      supabase,
      user.id,
      user.email,
      app.opportunity_id,
      resumeId || app.resume_id
    );

    const { data: existingDraft } = await supabase
      .from("email_drafts")
      .select("conflict_resolution")
      .eq("application_id", appId)
      .maybeSingle();

    const activeConflictStrategy =
      (existingDraft?.conflict_resolution as "compatible_confirmed" | "spontaneous_converted" | undefined) ||
      (detectAvailabilityConflict(candidateData, opportunityData).hasConflict ? "unresolved" : undefined);

    const normalizedSubject = validateAndNormalizeAvailabilitySubject(
      validateAndNormalizeDegreeSubject(subject, candidateData),
      candidateData,
      opportunityData,
      activeConflictStrategy
    );

    const normalizedBody = validateAndNormalizeAvailabilityClaims(
      validateAndNormalizeSeniorityClaims(
        validateAndNormalizeDegreeClaims(body, candidateData),
        candidateData,
        opportunityData
      ),
      candidateData,
      opportunityData,
      activeConflictStrategy
    );

    // Attempt atomic RPC save first ONLY if recipient email is valid and migration 20240107000000 is active
    let savedViaRpc = false;
    type SaveRpcResult = { data: { success?: boolean; error?: string } | null; error: { code?: string; message: string } | null };
    if (recipient && isTrustedRecruiterEmail(recipient)) {
      try {
        const { data: rpcData, error: rpcError } = (await supabase.rpc("save_email_draft_atomic", {
          p_application_id: appId,
          p_recipient: recipient,
          p_subject: normalizedSubject,
          p_body: normalizedBody,
          p_resume_id: resumeId || null,
        })) as unknown as SaveRpcResult;

        if (!rpcError && rpcData?.success) {
          savedViaRpc = true;
        } else if (rpcError && rpcError.code !== "PGRST202") {
          redirect(`/applications/${appId}/draft?error=${encodeURIComponent(rpcData?.error || rpcError.message)}`);
        }
      } catch (innerErr: unknown) {
        if (innerErr instanceof Error && "digest" in innerErr && typeof (innerErr as { digest: unknown }).digest === "string" && (innerErr as { digest: string }).digest.startsWith("NEXT_REDIRECT")) {
          throw innerErr;
        }
        // Fallback for unmigrated instances
      }
    }

    if (!savedViaRpc) {
      // If candidate selected a resume different from current, verify ownership and update application record
      if (resumeId && resumeId !== app.resume_id) {
        await ownedResume(supabase, resumeId, user.id);
        const adminClient = getServiceRoleClient();
        if (adminClient) {
          const { error: appUpdateError } = await adminClient
            .from("applications")
            .update({
              resume_id: resumeId,
              status: "draft",
              updated_at: new Date().toISOString(),
            })
            .eq("id", appId);

          if (appUpdateError) {
            redirect(`/applications/${appId}/draft?error=${encodeURIComponent("Failed to update attached CV: " + appUpdateError.message)}`);
          }
        }
      }

      // Update draft row matching this application
      const adminClient = getServiceRoleClient();
      if (adminClient) {
        const { error: draftUpdateError } = await adminClient
          .from("email_drafts")
          .update({
            recipient_email: recipient || "",
            subject: normalizedSubject,
            body: normalizedBody,
            approved_at: null,
            approved_hash: null,
            approved_attachment_hash: null,
            updated_at: new Date().toISOString(),
          })
          .eq("application_id", appId);

        if (draftUpdateError) {
          await adminClient.from("email_drafts").delete().eq("application_id", appId);
          const { error: insertError } = await adminClient
            .from("email_drafts")
            .insert({
              application_id: appId,
              recipient_email: recipient || "",
              subject: normalizedSubject,
              body: normalizedBody,
              approved_at: null,
              approved_hash: null,
              approved_attachment_hash: null,
              updated_at: new Date().toISOString(),
            });

          if (insertError) {
            redirect(`/applications/${appId}/draft?error=${encodeURIComponent("Failed to save email draft: " + insertError.message)}`);
          }
        }
      } else {
        await supabase.from("email_drafts").delete().eq("application_id", appId);
        const { error: insertError } = await supabase
          .from("email_drafts")
          .insert({
            application_id: appId,
            recipient_email: recipient || "",
            subject: normalizedSubject,
            body: normalizedBody,
            approved_at: null,
            approved_hash: null,
            approved_attachment_hash: null,
            updated_at: new Date().toISOString(),
          });

        if (insertError) {
          redirect(`/applications/${appId}/draft?error=${encodeURIComponent("Failed to save email draft: " + insertError.message)}`);
        }
      }
    }
  } catch (err: unknown) {
    // Re-throw redirect exceptions from Next.js
    if (err instanceof Error && "digest" in err && typeof (err as { digest: unknown }).digest === "string" && (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    const message = err instanceof Error ? err.message : "Unexpected database error";
    redirect(`/applications/${appId}/draft?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/applications/${appId}/draft`);
  redirect(`/applications/${appId}/draft?success=${encodeURIComponent("Draft saved successfully.")}`);
}

/**
 * Validates and cryptographically stamps the draft for sending.
 */
export async function approveDraft(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?error=" + encodeURIComponent("Please log in to approve your draft."));
  }

  const appId = text(formData, "application_id").trim();
  const recipient = text(formData, "recipient_email").trim();
  const subject = text(formData, "subject").trim();
  const body = text(formData, "body");
  const resumeId = text(formData, "resume_id").trim();

  if (!appId) {
    redirect("/dashboard?error=" + encodeURIComponent("Missing application ID."));
  }

  if (!recipient || !validEmail(recipient)) {
    redirect(`/applications/${appId}/draft?error=${encodeURIComponent("A verified recipient email is required to approve an email for sending. If the employer only accepts applications on their website, please use the official portal link instead.")}`);
  }

  if (isPlaceholderOrUntrustedEmail(recipient)) {
    redirect(`/applications/${appId}/draft?error=${encodeURIComponent("Placeholder or demo email addresses (such as recruiter@example.com) cannot be approved for dispatch. Please provide a verified recruiter address or apply directly via the employer's official portal.")}`);
  }

  if (!subject || !body.trim() || !resumeId) {
    redirect(`/applications/${appId}/draft?error=${encodeURIComponent("Please ensure subject, body, and attached CV are all completed before approving.")}`);
  }

  try {
    const application = await ownedApplication(supabase, appId, user.id);
    if (application.status === "sending" || application.status === "sent") {
      redirect(`/applications/${appId}/draft?error=${encodeURIComponent(`This application is currently ${application.status} and cannot be re-approved.`)}`);
    }

    // Opportunity lifecycle check: Block approval if vacancy is closed, expired, inactive, or past deadline
    if (application.opportunity_id) {
      const { data: oppRecord } = await supabase
        .from("opportunities")
        .select("id, title, verification_status, is_active, valid_through")
        .eq("id", application.opportunity_id)
        .maybeSingle();

      if (oppRecord) {
        const isPastDeadline = oppRecord.valid_through
          ? new Date(oppRecord.valid_through).getTime() < Date.now()
          : false;
        if (
          oppRecord.verification_status === "closed" ||
          oppRecord.verification_status === "expired" ||
          oppRecord.is_active === false ||
          isPastDeadline
        ) {
          redirect(
            `/applications/${appId}/draft?error=${encodeURIComponent(
              "Cette offre est clôturée ou expirée. L'approbation est bloquée."
            )}`
          );
        }
      }
    }

    if (application.resume_id !== resumeId) {
      redirect(`/applications/${appId}/draft?error=${encodeURIComponent("The selected CV has not been saved yet. Click 'Save Draft' before approving.")}`);
    }

    const resume = await ownedResume(supabase, resumeId, user.id);

    const { data: currentDraft, error: draftReadError } = await supabase
      .from("email_drafts")
      .select("id, recipient_email, subject, body, conflict_resolution")
      .eq("application_id", appId)
      .maybeSingle();

    if (draftReadError || !currentDraft) {
      redirect(`/applications/${appId}/draft?error=${encodeURIComponent("Draft not found. Please click 'Save Draft' first.")}`);
    }

    const { candidateData, opportunityData } = await fetchCandidateAndOpportunity(
      supabase,
      user.id,
      user.email,
      application.opportunity_id,
      resumeId
    );

    // Availability Conflict check: Block approval if conflict is unresolved
    const conflictCheck = detectAvailabilityConflict(candidateData, opportunityData);
    if (conflictCheck.hasConflict) {
      if (
        !currentDraft.conflict_resolution ||
        currentDraft.conflict_resolution === "unresolved"
      ) {
        redirect(
          `/applications/${appId}/draft?error=${encodeURIComponent(
            "Impossible d'approuver : un conflit de calendrier non résolu a été détecté entre votre disponibilité CV et l'opportunité. Veuillez choisir une option dans le panneau de décision ci-dessus avant d'approuver."
          )}`
        );
      }
    }

    const staleClaims = detectStaleDraftClaims(body, candidateData, opportunityData);
    if (staleClaims.hasStaleClaims) {
      redirect(
        `/applications/${appId}/draft?error=${encodeURIComponent(
          `Ce brouillon ne peut pas être approuvé car il contient des affirmations non vérifiées : ${staleClaims.unsupportedClaimsFound.join(
            ", "
          )}. Veuillez régénérer avec votre CV ou corriger le message.`
        )}`
      );
    }

    if (
      currentDraft.recipient_email !== recipient ||
      currentDraft.subject !== subject ||
      currentDraft.body !== body
    ) {
      redirect(`/applications/${appId}/draft?error=${encodeURIComponent("You made changes that have not been saved. Click 'Save Draft' and review again before approving.")}`);
    }

    const hash = computeDraftHash(recipient, subject, body, resumeId, resume.storage_path);
    const attachmentHash = computeDraftHash("", "", "", resumeId, resume.storage_path);

    // Attempt atomic RPC approval first if migration 20240107000000 is active
    let rpcSucceeded = false;
    try {
      type RpcResult = { data: { success?: boolean; error?: string } | null; error: { code?: string; message: string } | null };
      const { data: rpcData, error: rpcError } = (await supabase.rpc("approve_email_draft_atomic", {
        p_application_id: appId,
        p_hash: hash,
        p_attachment_hash: attachmentHash,
      })) as unknown as RpcResult;

      if (!rpcError && rpcData?.success) {
        rpcSucceeded = true;
      } else if (rpcError && rpcError.code !== "PGRST202") {
        redirect(`/applications/${appId}/draft?error=${encodeURIComponent(rpcData?.error || rpcError.message)}`);
      }
    } catch {
      // Fallback for unmigrated instances
    }

    if (!rpcSucceeded) {
      const { error: approveError } = await supabase
        .from("email_drafts")
        .update({
          approved_at: new Date().toISOString(),
          approved_hash: hash,
          approved_attachment_hash: attachmentHash,
          updated_at: new Date().toISOString(),
        })
        .eq("application_id", appId);

      if (approveError) {
        redirect(`/applications/${appId}/draft?error=${encodeURIComponent("Failed to lock draft approval: " + approveError.message)}`);
      }

      const { error: statusError } = await supabase
        .from("applications")
        .update({ status: "approved", updated_at: new Date().toISOString() })
        .eq("id", appId)
        .eq("user_id", user.id);

      if (statusError) {
        redirect(`/applications/${appId}/draft?error=${encodeURIComponent("Failed to update application status: " + statusError.message)}`);
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && "digest" in err && typeof (err as { digest: unknown }).digest === "string" && (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    const message = err instanceof Error ? err.message : "Approval failed";
    redirect(`/applications/${appId}/draft?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/applications/${appId}/draft`);
  redirect(`/applications/${appId}/draft?success=${encodeURIComponent("Draft approved and cryptographically stamped.")}`);
}

/**
 * Regenerates the outreach email draft based on the candidate's latest profile and CV.
 */
export async function regenerateDraft(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?error=" + encodeURIComponent("Please log in to regenerate draft."));
  }

  const appId = text(formData, "application_id").trim();
  if (!appId) {
    redirect("/dashboard?error=" + encodeURIComponent("Missing application ID."));
  }

  try {
    const app = await ownedApplication(supabase, appId, user.id);
    if (app.status === "sending" || app.status === "sent") {
      redirect(`/applications/${appId}/draft?error=${encodeURIComponent(`This application is currently ${app.status} and cannot be regenerated.`)}`);
    }

    // Rate limit: max 10 draft regenerations per 5 minutes per candidate
    const rateLimit = await checkRateLimit(supabase, `draft_regen:${user.id}`, 10, 300);
    if (!rateLimit.allowed) {
      redirect(`/applications/${appId}/draft?error=${encodeURIComponent(rateLimit.reason || "Draft regeneration rate limit reached. Please wait before regenerating again.")}`);
    }

    const { candidateData, opportunityData } = await fetchCandidateAndOpportunity(
      supabase,
      user.id,
      user.email,
      app.opportunity_id,
      app.resume_id
    );

    const { data: existingDraft } = await supabase
      .from("email_drafts")
      .select("recipient_email, conflict_resolution")
      .eq("application_id", appId)
      .maybeSingle();

    const conflictStrategy =
      (existingDraft?.conflict_resolution as "compatible_confirmed" | "spontaneous_converted" | undefined) ||
      (detectAvailabilityConflict(candidateData, opportunityData).hasConflict ? "unresolved" : undefined);

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
    console.log(`[regenerateDraft] Regenerated draft for application ${appId}: isAiGenerated=${generated.isAiGenerated}, provider=${generated.provider}, model=${generated.model || "none"}, fallbackReason=${generated.fallbackReason || "none"}`);

    recordDraftProvenance(appId, {
      provider: generated.provider,
      model: generated.model,
      isAiGenerated: generated.isAiGenerated,
      fallbackReason: generated.fallbackReason,
    });

    const recipient =
      existingDraft?.recipient_email && isTrustedRecruiterEmail(existingDraft.recipient_email)
        ? existingDraft.recipient_email.trim()
        : "";

    let regeneratedViaRpc = false;
    type SaveRpcResult = { data: { success?: boolean; error?: string } | null; error: { code?: string; message: string } | null };
    if (recipient && isTrustedRecruiterEmail(recipient)) {
      try {
        const { data: rpcData, error: rpcError } = (await supabase.rpc("save_email_draft_atomic", {
          p_application_id: appId,
          p_recipient: recipient,
          p_subject: normalizedSubject,
          p_body: normalizedBody,
          p_resume_id: app.resume_id || null,
        })) as unknown as SaveRpcResult;

        if (!rpcError && rpcData?.success) {
          regeneratedViaRpc = true;
        } else if (rpcError && rpcError.code !== "PGRST202") {
          redirect(`/applications/${appId}/draft?error=${encodeURIComponent(rpcData?.error || rpcError.message)}`);
        }
      } catch {
        // Fallback
      }
    }

    if (!regeneratedViaRpc) {
      const { data: updatedDrafts, error: updateError } = await supabase
        .from("email_drafts")
        .update({
          recipient_email: recipient,
          subject: normalizedSubject,
          body: normalizedBody,
          conflict_resolution: existingDraft?.conflict_resolution || null,
          approved_at: null,
          approved_hash: null,
          approved_attachment_hash: null,
          updated_at: new Date().toISOString(),
        })
        .eq("application_id", appId)
        .select("id");

      if (updateError || !updatedDrafts || updatedDrafts.length === 0) {
        await supabase.from("email_drafts").delete().eq("application_id", appId);
        const { error: insertError } = await supabase
          .from("email_drafts")
          .insert({
            application_id: appId,
            recipient_email: recipient,
            subject: normalizedSubject,
            body: normalizedBody,
            conflict_resolution: existingDraft?.conflict_resolution || null,
            approved_at: null,
            approved_hash: null,
            approved_attachment_hash: null,
            updated_at: new Date().toISOString(),
          });

        if (insertError) {
          redirect(`/applications/${appId}/draft?error=${encodeURIComponent("Failed to update draft: " + insertError.message)}`);
        }
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && "digest" in err && typeof (err as { digest: unknown }).digest === "string" && (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    const message = err instanceof Error ? err.message : "Regeneration failed";
    redirect(`/applications/${appId}/draft?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/applications/${appId}/draft`);
  redirect(`/applications/${appId}/draft?success=${encodeURIComponent("Draft successfully regenerated using your verified CV and profile details.")}`);
}

/**
 * Creates initial draft if missing.
 */
export async function createDraftForApplication(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?error=" + encodeURIComponent("Please log in to generate draft."));
  }

  const appId = text(formData, "application_id").trim();
  if (!appId) {
    redirect("/dashboard?error=" + encodeURIComponent("Missing application ID."));
  }

  try {
    const app = await ownedApplication(supabase, appId, user.id);

    const { data: existingDraft } = await supabase
      .from("email_drafts")
      .select("id")
      .eq("application_id", app.id)
      .maybeSingle();

    if (existingDraft) {
      revalidatePath(`/applications/${appId}/draft`);
      return;
    }

    const { data: contact } = await supabase
      .from("company_contacts")
      .select("email, is_verified")
      .eq("company_id", app.company_id)
      .eq("is_verified", true)
      .limit(1)
      .maybeSingle();

    const verifiedContactEmail =
      contact?.is_verified && isTrustedRecruiterEmail(contact.email)
        ? contact.email.trim()
        : null;

    const { candidateData, opportunityData } = await fetchCandidateAndOpportunity(
      supabase,
      user.id,
      user.email,
      app.opportunity_id,
      app.resume_id
    );

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
    console.log(`[createDraftForApplication] Generated draft for application ${app.id}: isAiGenerated=${generated.isAiGenerated}, provider=${generated.provider}, model=${generated.model || "none"}, fallbackReason=${generated.fallbackReason || "none"}`);

    const draftPayload = buildDraftPayload({
      applicationId: app.id,
      opportunityTitle: opportunityData.title,
      userEmail: user.email || "",
      contactEmail: verifiedContactEmail,
      subject: normalizedSubject,
      body: normalizedBody,
      conflict_resolution: null,
    });

    const { data: insertedDraft, error: draftError } = await supabase
      .from("email_drafts")
      .insert(draftPayload)
      .select("id")
      .maybeSingle();

    if (draftError) {
      redirect(`/applications/${appId}/draft?error=${encodeURIComponent("Failed to create draft: " + draftError.message)}`);
    }

    recordDraftProvenance(app.id, {
      draftId: insertedDraft?.id,
      provider: generated.provider,
      model: generated.model,
      isAiGenerated: generated.isAiGenerated,
      fallbackReason: generated.fallbackReason,
    });
  } catch (err: unknown) {
    if (err instanceof Error && "digest" in err && typeof (err as { digest: unknown }).digest === "string" && (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    const message = err instanceof Error ? err.message : "Draft generation failed";
    redirect(`/applications/${appId}/draft?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/applications/${appId}/draft`);
  redirect(`/applications/${appId}/draft?success=${encodeURIComponent("Email draft generated successfully.")}`);
}

/**
 * Safely simulates sending an approved email application in Demo Mode.
 * Enforces cryptographic approval validation and idempotency keys.
 * Real email sending remains disabled.
 */
export async function sendApprovedApplicationEmail(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?error=" + encodeURIComponent("Please log in to send your application."));
  }

  const appId = text(formData, "application_id").trim();
  if (!appId) {
    redirect("/dashboard?error=" + encodeURIComponent("Missing application ID."));
  }

  try {
    const app = await ownedApplication(supabase, appId, user.id);

    if (app.status === "sent") {
      redirect(`/applications/${appId}/draft?error=${encodeURIComponent("This application has already been sent.")}`);
    }

    // Opportunity lifecycle check: Block send if vacancy is closed, expired, inactive, or past deadline
    if (app.opportunity_id) {
      const { data: oppRecord } = await supabase
        .from("opportunities")
        .select("id, title, verification_status, is_active, valid_through")
        .eq("id", app.opportunity_id)
        .maybeSingle();

      if (oppRecord) {
        const isPastDeadline = oppRecord.valid_through
          ? new Date(oppRecord.valid_through).getTime() < Date.now()
          : false;
        if (
          oppRecord.verification_status === "closed" ||
          oppRecord.verification_status === "expired" ||
          oppRecord.is_active === false ||
          isPastDeadline
        ) {
          redirect(
            `/applications/${appId}/draft?error=${encodeURIComponent(
              "Cette offre est clôturée ou expirée. L'envoi est bloqué."
            )}`
          );
        }
      }
    }

    if (!app.resume_id) {
      redirect(`/applications/${appId}/draft?error=${encodeURIComponent("No resume attached to this application.")}`);
    }

    const resume = await ownedResume(supabase, app.resume_id, user.id);

    const { data: draft, error: draftError } = await supabase
      .from("email_drafts")
      .select("*")
      .eq("application_id", appId)
      .maybeSingle();

    if (draftError || !draft) {
      redirect(`/applications/${appId}/draft?error=${encodeURIComponent("Draft could not be found.")}`);
    }

    const idempotencyKey = `idemp_${app.id}_${Date.now()}`;

    // Cryptographic validation of approval signatures, hashes, and ownership
    const validation = validateApprovedEmailForSend({
      candidateUserId: user.id,
      application: {
        id: app.id,
        user_id: user.id,
        resume_id: app.resume_id,
        status: app.status,
        send_idempotency_key: idempotencyKey,
      },
      draft: {
        id: draft.id,
        application_id: draft.application_id,
        recipient_email: draft.recipient_email,
        subject: draft.subject,
        body: draft.body,
        approved_at: draft.approved_at,
        approved_hash: draft.approved_hash,
        approved_attachment_hash: draft.approved_attachment_hash,
      },
      resume: {
        id: resume.id,
        user_id: user.id,
        storage_path: resume.storage_path,
      },
      idempotencyKey,
    });

    if (!validation.valid) {
      redirect(`/applications/${appId}/draft?error=${encodeURIComponent(validation.reason)}`);
    }

    // Set status to sending
    let sendingTransitioned = false;
    type StatusRpcResult = { data: { success?: boolean; error?: string } | null; error: { code?: string; message: string } | null };
    try {
      const { data: rpcData, error: rpcError } = (await supabase.rpc("transition_application_status_atomic", {
        p_application_id: appId,
        p_new_status: "sending",
        p_idempotency_key: idempotencyKey,
      })) as unknown as StatusRpcResult;
      if (!rpcError && rpcData?.success) {
        sendingTransitioned = true;
      }
    } catch {
      // Fallback
    }

    if (!sendingTransitioned) {
      await supabase
        .from("applications")
        .update({
          status: "sending",
          send_idempotency_key: idempotencyKey,
          updated_at: new Date().toISOString(),
        })
        .eq("id", appId)
        .eq("user_id", user.id);
    }

    // Execute mock send
    const sendResult = await sendEmailMock({
      to: validation.approvedEmail.to,
      subject: validation.approvedEmail.subject,
      body: validation.approvedEmail.body,
      attachments: [{
        filename: "CV.pdf",
        path: validation.approvedEmail.attachmentPath,
      }],
    });

    if (sendResult.success) {
      // Mark as sent
      let sentTransitioned = false;
      try {
        const { data: rpcData, error: rpcError } = (await supabase.rpc("transition_application_status_atomic", {
          p_application_id: appId,
          p_new_status: "sent",
        })) as unknown as StatusRpcResult;
        if (!rpcError && rpcData?.success) {
          sentTransitioned = true;
        }
      } catch {
        // Fallback
      }

      if (!sentTransitioned) {
        await supabase
          .from("applications")
          .update({
            status: "sent",
            updated_at: new Date().toISOString(),
          })
          .eq("id", appId)
          .eq("user_id", user.id);
      }

      // Record event if table exists
      try {
        await supabase
          .from("email_events")
          .insert({
            application_id: appId,
            event_type: "sent",
            provider_id: sendResult.messageId || "mock_provider_sent",
          });
      } catch (eventErr) {
        console.warn("Could not insert email_event:", eventErr);
      }

      revalidatePath(`/applications/${appId}/draft`);
      revalidatePath("/dashboard");
      redirect(`/applications/${appId}/draft?success=${encodeURIComponent("Application email successfully sent (Simulated Demo Mode).")}`);
    } else {
      // Mark as failed
      let failedTransitioned = false;
      try {
        const { data: rpcData, error: rpcError } = (await supabase.rpc("transition_application_status_atomic", {
          p_application_id: appId,
          p_new_status: "failed",
        })) as unknown as StatusRpcResult;
        if (!rpcError && rpcData?.success) {
          failedTransitioned = true;
        }
      } catch {
        // Fallback
      }

      if (!failedTransitioned) {
        await supabase
          .from("applications")
          .update({
            status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", appId)
          .eq("user_id", user.id);
      }

      try {
        await supabase
          .from("email_events")
          .insert({
            application_id: appId,
            event_type: "failed",
            error_message: sendResult.error || "Mock transmission failed",
          });
      } catch (eventErr) {
        console.warn("Could not insert email_event:", eventErr);
      }

      redirect(`/applications/${appId}/draft?error=${encodeURIComponent("Send simulation failed: " + (sendResult.error || "Unknown error"))}`);
    }
  } catch (err: unknown) {
    if (err instanceof Error && "digest" in err && typeof (err as { digest: unknown }).digest === "string" && (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    const message = err instanceof Error ? err.message : "Send operation failed";
    redirect(`/applications/${appId}/draft?error=${encodeURIComponent(message)}`);
  }
}

/**
 * Resolves an availability conflict according to candidate choice:
 * 1. "compatible_confirmed": confirms candidate availability is compatible, adapts draft.
 * 2. "spontaneous_converted": converts to spontaneous inquiry for candidate's actual session year.
 * 3. "cancel_postpone": postpones application.
 * 4. "unresolved": resets resolution to show decision panel again.
 */
export async function resolveDraftConflict(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?error=" + encodeURIComponent("Veuillez vous connecter pour gérer votre candidature."));
  }

  const appId = text(formData, "application_id").trim();
  const resolution = text(formData, "resolution").trim();

  if (!appId) {
    redirect("/dashboard?error=" + encodeURIComponent("ID de candidature manquant."));
  }

  try {
    const app = await ownedApplication(supabase, appId, user.id);

    if (resolution === "cancel_postpone") {
      const adminClient = getServiceRoleClient();
      const clientToUse = adminClient || supabase;
      await clientToUse
        .from("applications")
        .update({
          status: "postponed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", appId);

      revalidatePath(`/applications/${appId}/draft`);
      revalidatePath("/applications");
      revalidatePath("/dashboard");
      redirect("/opportunities?success=" + encodeURIComponent("Candidature reportée en raison de l'incompatibilité de calendrier."));
    }

    const { candidateData, opportunityData } = await fetchCandidateAndOpportunity(
      supabase,
      user.id,
      user.email,
      app.opportunity_id,
      app.resume_id
    );

    let newConflictResolution: string | null = null;
    let conflictStrategy: "unresolved" | "compatible_confirmed" | "spontaneous_converted" = "unresolved";
    let resolutionNote: string | null = null;

    if (resolution === "compatible_confirmed") {
      newConflictResolution = "compatible_confirmed";
      conflictStrategy = "compatible_confirmed";
      resolutionNote = "Compatibilité de calendrier confirmée par le candidat";
    } else if (resolution === "spontaneous_converted") {
      const officialChannel = opportunityData.application_url || opportunityData.source_url;
      if (!officialChannel) {
        redirect(`/applications/${appId}/draft?error=${encodeURIComponent("Aucun portail de recrutement officiel n'est disponible pour orienter une candidature spontanée.")}`);
      }
      newConflictResolution = "spontaneous_converted";
      conflictStrategy = "spontaneous_converted";
      resolutionNote = `Convertie en candidature spontanée (${candidateData.rawCvText ? extractCandidateAvailability(candidateData)?.statedText || "validée" : "validée"})`;
    } else if (resolution === "unresolved") {
      newConflictResolution = null;
      conflictStrategy = "unresolved";
      resolutionNote = null;
    } else {
      redirect(`/applications/${appId}/draft?error=${encodeURIComponent("Option de résolution non reconnue.")}`);
    }

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

    const adminClient = getServiceRoleClient();
    const clientToUse = adminClient || supabase;

    const { error: updateError } = await clientToUse
      .from("email_drafts")
      .update({
        subject: normalizedSubject,
        body: normalizedBody,
        conflict_resolution: newConflictResolution,
        conflict_resolution_note: resolutionNote,
        approved_at: null,
        approved_hash: null,
        approved_attachment_hash: null,
        updated_at: new Date().toISOString(),
      })
      .eq("application_id", appId);

    if (updateError) {
      redirect(`/applications/${appId}/draft?error=${encodeURIComponent("Échec de la mise à jour du brouillon : " + updateError.message)}`);
    }

    recordDraftProvenance(appId, {
      provider: generated.provider,
      model: generated.model,
      isAiGenerated: generated.isAiGenerated,
      fallbackReason: generated.fallbackReason,
    });
  } catch (err: unknown) {
    if (err instanceof Error && "digest" in err && typeof (err as { digest: unknown }).digest === "string" && (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    const message = err instanceof Error ? err.message : "Erreur inattendue";
    redirect(`/applications/${appId}/draft?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/applications/${appId}/draft`);
  redirect(`/applications/${appId}/draft?success=${encodeURIComponent(
    resolution === "compatible_confirmed"
      ? "Compatibilité de calendrier confirmée. Le brouillon a été adapté."
      : resolution === "spontaneous_converted"
      ? "Candidature convertie en candidature spontanée avec succès."
      : "Le panneau de décision a été réinitialisé."
  )}`);
}


