import { connection } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  saveDraft,
  approveDraft,
  createDraftForApplication,
  regenerateDraft,
  sendApprovedApplicationEmail,
  resolveDraftConflict,
} from "./actions";
import {
  normalizeDraftData,
  type EmailDraftRecord,
  isTrustedRecruiterEmail,
} from "@/lib/draft-utils";
import { getDraftProvenance } from "@/lib/draft-provenance";
import { calculateOpportunityMatchScore } from "@/lib/opportunity-matcher";
import {
  detectStaleDraftClaims,
  validateAndNormalizeSeniorityClaims,
} from "@/lib/seniority-detector";
import {
  resolveExactProgramName,
  validateAndNormalizeDegreeClaims,
  validateAndNormalizeDegreeSubject,
  type CandidateData,
  type OpportunityData,
} from "@/lib/email-generator";
import {
  validateAndNormalizeAvailabilityClaims,
  validateAndNormalizeAvailabilitySubject,
} from "@/lib/availability-detector";
import { getServiceRoleClient } from "@/lib/opportunities-manager";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { AppFooter } from "@/components/layout/AppFooter";
import { formatDisplayDate, isDateInPast } from "@/lib/date-utils";
import { resolveSourcePlatform } from "@/lib/discovery/source-resolver";

export const instant = false;

export default async function DraftPage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string; success?: string }>;
}) {
  // Indicate to Next.js 16 that rendering must wait for an incoming user request,
  // preventing Date.now() / dynamic credential checks during static prerender
  await connection();

  const params = await props.params;
  const searchParams = props.searchParams ? await props.searchParams : {};
  const error = searchParams?.error;
  const success = searchParams?.success;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch application, draft, and resumes with complete opportunity metadata
  const { data: app, error: appError } = await supabase
    .from("applications")
    .select("*, email_drafts(*), opportunities(title, description, type, source_url, canonical_url, verification_status, is_active, date_posted, valid_through, last_checked_at, source_provider, source_platform, application_url, closed_at, updated_at_source, verification_evidence, companies(name, website))")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (appError || !app) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-zinc-950">
        <AppNavbar userEmail={user.email} />
        <main className="flex-1 max-w-xl mx-auto px-4 py-16 text-center">
          <div className="p-6 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 rounded-2xl text-rose-700 dark:text-rose-400">
            <h2 className="text-lg font-semibold mb-2">Application Not Found</h2>
            <p className="text-sm">This application draft does not exist or you do not have permission to view it.</p>
            <Link href="/dashboard" className="mt-4 inline-block text-xs font-semibold text-blue-600 hover:underline">
              ← Return to Dashboard
            </Link>
          </div>
        </main>
        <AppFooter />
      </div>
    );
  }

  const { data: resumes } = await supabase
    .from("resumes")
    .select("id, created_at, storage_path, extracted_data")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  // Direct query for the newest draft row for this application
  const { data: directDraft } = await supabase
    .from("email_drafts")
    .select("*")
    .eq("application_id", app.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Fallback to relational join output normalized with updated_at descending sort
  const draft: EmailDraftRecord | null =
    (directDraft as EmailDraftRecord | null) ||
    normalizeDraftData((app as Record<string, unknown>).email_drafts);

  console.log(`[DraftPage] Rendering draft for app ${app.id}: status=${app.status}, draftId=${draft?.id || "none"}, subject="${draft?.subject || ""}"`);

  if (!draft) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100">
        <AppNavbar userEmail={user.email} />
        <main className="flex-1 max-w-xl mx-auto px-4 py-16 text-center">
          <div className="p-8 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-xs space-y-4">
            <div className="mx-auto h-12 w-12 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Draft Not Yet Generated</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
                This application exists, but its personalized email outreach draft has not been generated yet.
              </p>
            </div>
            <form action={createDraftForApplication} className="pt-2">
              <input type="hidden" name="application_id" value={app.id} />
              <button
                type="submit"
                className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-sm rounded-xl transition-all shadow-md shadow-blue-500/20 cursor-pointer"
              >
                Generate Email Draft Now →
              </button>
            </form>
            <div className="pt-2">
              <Link href="/dashboard" className="text-xs font-semibold text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200">
                ← Return to Dashboard
              </Link>
            </div>
          </div>
        </main>
        <AppFooter />
      </div>
    );
  }

  type OpportunityWithMeta = {
    title?: string;
    description?: string;
    type?: string;
    source_url?: string | null;
    canonical_url?: string | null;
    verification_status?: string | null;
    is_active?: boolean;
    date_posted?: string | null;
    valid_through?: string | null;
    last_checked_at?: string | null;
    source_provider?: string | null;
    source_platform?: string | null;
    application_url?: string | null;
    closed_at?: string | null;
    updated_at_source?: string | null;
    verification_evidence?: Record<string, unknown> | null;
    companies?: { name?: string; website?: string | null } | null;
  };
  const opp = (app.opportunities as unknown as OpportunityWithMeta) || null;

  const resolvedPlatform = resolveSourcePlatform({
    sourcePlatform: opp?.source_platform,
    sourceUrl: opp?.source_url,
    applicationUrl: opp?.application_url,
    sourceProvider: opp?.source_provider,
  });
  const displaySourcePlatform = opp?.source_platform || resolvedPlatform.platformName;
  const sourceAnnouncementUrl = resolvedPlatform.sourceUrl || opp?.source_url || null;
  const applicationPortalUrl = resolvedPlatform.applicationUrl || opp?.application_url || opp?.canonical_url || null;
  const officialApplyUrl = applicationPortalUrl || sourceAnnouncementUrl || null;
  const isPublicationDateUnknown = !opp?.date_posted;

  const isPastDeadline = isDateInPast(opp?.valid_through);
  const isVacancyClosedOrExpired = Boolean(
    opp?.verification_status === "closed" ||
    opp?.verification_status === "expired" ||
    opp?.is_active === false ||
    isPastDeadline
  );
  const isSpontaneousDraft = Boolean(
    opp?.title?.toLowerCase().includes("piste") ||
    opp?.title?.toLowerCase().includes("spontanée") ||
    opp?.source_url?.toLowerCase().includes("carriere")
  );

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

  const selectedResume = resumes?.find((resume) => resume.id === app.resume_id) || resumes?.[0];
  const ext = (selectedResume?.extracted_data as ExtractedPayload) || {};
  const extData = ext.data || {};
  const effectiveCvText = ext.rawText || "";

  const cvCandidateForDegree: CandidateData = {
    school: extData.school || profile?.school,
    degree: extData.degree,
    specialty: extData.specialty || profile?.specialty,
    rawCvText: effectiveCvText,
  };
  const verifiedDegreeName = resolveExactProgramName(cvCandidateForDegree) || extData.degree || profile?.degree;

  const candidateData: CandidateData = {
    first_name: profile?.first_name || extData.first_name,
    last_name: profile?.last_name || extData.last_name,
    email: user.email,
    phone: profile?.phone,
    school: profile?.school || extData.school,
    degree: verifiedDegreeName,
    specialty: extData.specialty || profile?.specialty,
    languages: profile?.languages || extData.languages,
    city: profile?.city,
    country: profile?.country,
    rawCvText: effectiveCvText,
    skills: extData.skills,
  };

  const oppData: OpportunityData & {
    date_posted?: string | null;
    valid_through?: string | null;
    source_url?: string | null;
    source_provider?: string | null;
  } = {
    title: opp?.title || "",
    companyName: opp?.companies?.name,
    description: opp?.description,
    type: opp?.type,
    date_posted: opp?.date_posted,
    valid_through: opp?.valid_through,
    source_url: opp?.source_url,
    source_provider: opp?.source_provider,
  };

  const matchBreakdown = calculateOpportunityMatchScore(candidateData, oppData);

  const activeConflictStrategy =
    (draft.conflict_resolution as "compatible_confirmed" | "spontaneous_converted" | undefined) ||
    (matchBreakdown.availabilityConflict ? "unresolved" : undefined);

  const sanitizedSubject = validateAndNormalizeAvailabilitySubject(
    validateAndNormalizeDegreeSubject(draft.subject, candidateData),
    candidateData,
    oppData,
    activeConflictStrategy
  );

  const sanitizedBody = validateAndNormalizeAvailabilityClaims(
    validateAndNormalizeSeniorityClaims(
      validateAndNormalizeDegreeClaims(draft.body, candidateData),
      candidateData,
      oppData
    ),
    candidateData,
    oppData,
    activeConflictStrategy
  );

  if (!draft.approved_at && (draft.subject !== sanitizedSubject || draft.body !== sanitizedBody)) {
    draft.subject = sanitizedSubject;
    draft.body = sanitizedBody;
    const adminClient = getServiceRoleClient();
    const clientToUse = adminClient || supabase;
    await clientToUse
      .from("email_drafts")
      .update({
        subject: sanitizedSubject,
        body: sanitizedBody,
        updated_at: new Date().toISOString(),
      })
      .eq("id", draft.id);
  }

  const staleDraftCheck = detectStaleDraftClaims(draft.body, candidateData, oppData);

  const scoreBadgeColor =
    matchBreakdown.score >= 70
      ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
      : matchBreakdown.score >= 50
      ? "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800"
      : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800";

  const hasVerifiedRecipient = Boolean(
    draft.recipient_email && isTrustedRecruiterEmail(draft.recipient_email)
  );
  const displayRecipientEmail = hasVerifiedRecipient ? draft.recipient_email : "";
  const isApproved = Boolean(draft.approved_at && hasVerifiedRecipient);

  let signedResumeUrl: string | null = null;
  if (selectedResume?.storage_path) {
    try {
      const { data: signedData } = await supabase.storage
        .from("resumes")
        .createSignedUrl(selectedResume.storage_path, 300);
      signedResumeUrl = signedData?.signedUrl || null;
    } catch {
      signedResumeUrl = null;
    }
  }

  const aiProvider = (process.env.AI_PROVIDER_TYPE || "mock").toLowerCase();
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY || process.env.AI_API_KEY);
  const provenance = getDraftProvenance(app.id, draft.id);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100">
      <AppNavbar userEmail={user.email} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1">
              <span>Application Outreach Editor</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Personalized Email Draft
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
              {app.opportunities?.title} • <span className="font-semibold text-slate-800 dark:text-zinc-200">{app.opportunities?.companies?.name}</span>
            </p>
          </div>

          <div className="shrink-0 flex flex-wrap items-center gap-2">
            <span className={`px-3 py-1.5 rounded-full text-xs font-bold border shadow-2xs ${scoreBadgeColor}`}>
              {matchBreakdown.score}% • {matchBreakdown.relevanceLabel}
            </span>
            {isApproved ? (
              <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shadow-2xs">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>Approved & Locked</span>
              </span>
            ) : (
              <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shadow-2xs">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span>Pending Your Review</span>
              </span>
            )}
          </div>
        </div>

        {/* Success Notification */}
        {success && (
          <div className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80 rounded-xl flex items-center shadow-xs">
            <svg
              className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mr-3 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-sm font-medium text-emerald-900 dark:text-emerald-300">{success}</p>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/80 rounded-xl flex items-center shadow-xs">
            <svg
              className="h-5 w-5 text-rose-600 dark:text-rose-400 mr-3 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <p className="text-sm font-medium text-rose-900 dark:text-rose-300">{error}</p>
          </div>
        )}

        {/* Blocker Banner: Closed or Expired Vacancy */}
        {isVacancyClosedOrExpired && (
          <div className="mb-6 p-5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border-2 border-rose-300 dark:border-rose-800 shadow-xs space-y-3">
            <div className="flex items-start space-x-3">
              <span className="text-2xl shrink-0 mt-0.5">🚫</span>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-rose-950 dark:text-rose-200 uppercase tracking-wider">
                  Candidature Bloquée — Offre Clôturée ou Expirée
                </h3>
                <p className="text-xs text-rose-900/90 dark:text-rose-300/90 leading-relaxed">
                  Cette opportunité n&apos;est plus active ou sa date limite ({opp?.valid_through ? formatDisplayDate(opp.valid_through) : "passée"}) est dépassée. Pour préserver votre crédibilité professionnelle auprès de {opp?.companies?.name || "l'employeur"}, l&apos;approbation et l&apos;envoi d&apos;emails pour cette offre sont bloqués.
                </p>
              </div>
            </div>
            {officialApplyUrl && (
              <div className="pt-2 border-t border-rose-200 dark:border-rose-900/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span className="text-xs text-rose-800 dark:text-rose-400">
                  Vous pouvez vérifier les nouvelles ouvertures directement sur le portail de l&apos;employeur :
                </span>
                <a
                  href={officialApplyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-rose-900 dark:text-rose-200 underline hover:no-underline"
                >
                  Consulter le portail officiel ↗
                </a>
              </div>
            )}
          </div>
        )}

        {/* Interactive Availability Conflict Decision Panel / Status Banners */}
        {matchBreakdown.availabilityConflict && (
          <>
            {/* Case A: Unresolved Conflict -> Interactive Decision Panel */}
            {(!draft.conflict_resolution || draft.conflict_resolution === "unresolved") && (
              <div className="mb-6 p-6 rounded-2xl bg-amber-50/90 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-700/80 shadow-xs space-y-5">
                <div className="flex items-start space-x-3.5">
                  <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 shrink-0 mt-0.5">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                      <h3 className="text-base font-bold text-amber-950 dark:text-amber-100 tracking-tight">
                        Panneau de Décision : Incohérence de Calendrier Détectée
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-200/80 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                        Action requise avant approbation
                      </span>
                    </div>
                    <p className="text-xs text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
                      Votre CV atteste d&apos;une disponibilité <strong>{matchBreakdown.candidateAvailability}</strong>, tandis que cette annonce cible la <strong>{matchBreakdown.opportunityTargetPeriod}</strong>.
                    </p>
                    <div className="p-3 rounded-xl bg-amber-100/70 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                      <strong>Statut d&apos;acceptation de la session :</strong> la date limite effective de cette session n&apos;est pas précisée par la source officielle. Le statut d&apos;admission actuel doit être confirmé directement auprès de {opp?.companies?.name || "l'employeur"} (les sessions antérieures peuvent être pourvues ou reconduites).
                    </div>
                    <p className="text-[11px] text-amber-800 dark:text-amber-300 italic pt-0.5">
                      Afin de protéger la crédibilité de votre candidature, l&apos;approbation de ce brouillon est suspendue. Veuillez choisir comment orienter cette démarche :
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-2 border-t border-amber-200/80 dark:border-amber-800/70">
                  {/* Option 1: Confirmer la compatibilité */}
                  <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-amber-200 dark:border-amber-800/80 flex flex-col justify-between space-y-3 shadow-2xs">
                    <div className="space-y-1.5">
                      <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-900 dark:text-white">
                        <span className="text-emerald-600 dark:text-emerald-400">Option 1</span>
                        <span>•</span>
                        <span>Compatibilité Confirmée</span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-normal">
                        Si votre établissement autorise un aménagement de calendrier (stage anticipé ou décalé) ou si vous proposez ces dates à l&apos;employeur sous votre responsabilité.
                      </p>
                    </div>
                    <form action={resolveDraftConflict}>
                      <input type="hidden" name="application_id" value={app.id} />
                      <input type="hidden" name="resolution" value="compatible_confirmed" />
                      <button
                        type="submit"
                        className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg transition-colors shadow-2xs cursor-pointer text-center"
                      >
                        Confirmer la compatibilité & Adapter →
                      </button>
                    </form>
                  </div>

                  {/* Option 2: Basculer en candidature spontanée */}
                  <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-800/80 flex flex-col justify-between space-y-3 shadow-2xs">
                    <div className="space-y-1.5">
                      <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-900 dark:text-white">
                        <span className="text-blue-600 dark:text-blue-400">Option 2</span>
                        <span>•</span>
                        <span>Candidature Spontanée (Recommandé)</span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-normal">
                        {officialApplyUrl
                          ? "Ne postulez pas à la session 2026. Réorientez ce brouillon vers une candidature spontanée pour votre session réelle via le portail carrières officiel."
                          : "Aucun canal carrières officiel vérifié n'est répertorié pour cette entreprise. Cette option est indisponible."}
                      </p>
                    </div>
                    {officialApplyUrl ? (
                      <form action={resolveDraftConflict}>
                        <input type="hidden" name="application_id" value={app.id} />
                        <input type="hidden" name="resolution" value="spontaneous_converted" />
                        <button
                          type="submit"
                          className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg transition-colors shadow-2xs cursor-pointer text-center"
                        >
                          Basculer en candidature spontanée →
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="w-full px-3 py-2 bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-500 font-semibold text-xs rounded-lg cursor-not-allowed text-center"
                      >
                        Canal officiel non répertorié
                      </button>
                    )}
                  </div>

                  {/* Option 3: Reporter ou annuler */}
                  <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex flex-col justify-between space-y-3 shadow-2xs">
                    <div className="space-y-1.5">
                      <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-900 dark:text-white">
                        <span className="text-slate-500 dark:text-zinc-400">Option 3</span>
                        <span>•</span>
                        <span>Reporter ou Annuler</span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-normal">
                        Si les dates ne correspondent pas et que vous ne souhaitez pas contacter l&apos;entreprise, mettez cette candidature de côté.
                      </p>
                    </div>
                    <form action={resolveDraftConflict}>
                      <input type="hidden" name="application_id" value={app.id} />
                      <input type="hidden" name="resolution" value="cancel_postpone" />
                      <button
                        type="submit"
                        className="w-full px-3 py-2 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-750 text-slate-700 dark:text-zinc-300 font-semibold text-xs rounded-lg transition-colors shadow-2xs cursor-pointer text-center"
                      >
                        Reporter cette candidature ⏸
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}

            {/* Case B: Compatible Confirmed Banner */}
            {draft.conflict_resolution === "compatible_confirmed" && (
              <div className="mb-6 p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-300 dark:border-emerald-800 shadow-xs space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start space-x-3">
                    <span className="text-xl shrink-0 mt-0.5">✅</span>
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <h3 className="text-sm font-bold text-emerald-950 dark:text-emerald-100 uppercase tracking-wider">
                          Compatibilité de Calendrier Confirmée par le Candidat
                        </h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-200 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-200">
                          Poursuite autorisée
                        </span>
                      </div>
                      <p className="text-xs text-emerald-900/90 dark:text-emerald-200/90 leading-relaxed">
                        Vous avez confirmé que votre disponibilité (<strong>{matchBreakdown.candidateAvailability}</strong>) est compatible avec cette opportunité. Le brouillon ci-dessous mentionne fidèlement votre période réelle en toute transparence.
                      </p>
                      <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
                        ⚠️ <em>Avertissement :</em> Assurez-vous d&apos;avoir obtenu l&apos;accord de votre responsable pédagogique avant toute validation définitive.
                      </p>
                    </div>
                  </div>
                  <form action={resolveDraftConflict} className="shrink-0">
                    <input type="hidden" name="application_id" value={app.id} />
                    <input type="hidden" name="resolution" value="unresolved" />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200 bg-white dark:bg-zinc-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-xs font-semibold cursor-pointer shadow-2xs"
                    >
                      Changer d&apos;option ↺
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* Case C: Spontaneous Converted Banner */}
            {draft.conflict_resolution === "spontaneous_converted" && (
              <div className="mb-6 p-5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border-2 border-blue-300 dark:border-blue-800 shadow-xs space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start space-x-3">
                    <span className="text-xl shrink-0 mt-0.5">🚀</span>
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <h3 className="text-sm font-bold text-blue-950 dark:text-blue-100 uppercase tracking-wider">
                          Candidature Convertie en Candidature Spontanée
                        </h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-200 text-blue-900 dark:bg-blue-900/60 dark:text-blue-200">
                          Disponibilité : {matchBreakdown.candidateAvailability || "confirmée"}
                        </span>
                      </div>
                      <p className="text-xs text-blue-900/90 dark:text-blue-200/90 leading-relaxed">
                        À votre demande, ce message a été réorienté vers une candidature spontanée pour votre période de disponibilité réelle ({matchBreakdown.candidateAvailability}). Toute référence au programme antérieur 2026 a été retirée et aucun programme futur non annoncé n&apos;est présumé.
                      </p>
                      {officialApplyUrl && (
                        <div className="pt-1 flex items-center space-x-2 text-xs">
                          <span className="text-blue-800 dark:text-blue-300 font-semibold">Portail officiel à privilégier :</span>
                          <a
                            href={officialApplyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-700 dark:text-blue-300 font-bold underline hover:no-underline"
                          >
                            Accéder au portail carrières ↗
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                  <form action={resolveDraftConflict} className="shrink-0">
                    <input type="hidden" name="application_id" value={app.id} />
                    <input type="hidden" name="resolution" value="unresolved" />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg border border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-200 bg-white dark:bg-zinc-900 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-xs font-semibold cursor-pointer shadow-2xs"
                    >
                      Changer d&apos;option ↺
                    </button>
                  </form>
                </div>
              </div>
            )}
          </>
        )}

        {/* Evidence-Based Match Analysis Card */}
        <div className="mb-6 bg-white dark:bg-zinc-900 shadow-xs rounded-2xl border border-slate-200 dark:border-zinc-800 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Évaluation d&apos;Adéquation & Intégrité du Profil
            </span>
            <span className="text-xs font-medium text-slate-600 dark:text-zinc-300">
              🎓 {verifiedDegreeName || "Cursus étudiant"}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/60 dark:border-zinc-800/60">
              <span className="text-slate-500 dark:text-zinc-400 block text-[11px]">Niveau du poste :</span>
              <span className="font-bold text-slate-900 dark:text-white">{matchBreakdown.roleSeniorityLabel}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/60 dark:border-zinc-800/60">
              <span className="text-slate-500 dark:text-zinc-400 block text-[11px]">Votre niveau attesté :</span>
              <span className="font-bold text-slate-900 dark:text-white">{matchBreakdown.candidateSeniorityLabel}</span>
            </div>
          </div>

          {/* Matched & Missing Skills */}
          <div className="space-y-2 pt-1">
            {matchBreakdown.matchedSkills.length > 0 && (
              <div>
                <span className="text-[11px] font-semibold text-slate-600 dark:text-zinc-400 block mb-1">
                  Compétences techniques vérifiées correspondantes :
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {matchBreakdown.matchedSkills.map((s: string) => (
                    <span
                      key={s}
                      className="px-2 py-0.5 text-xs font-medium rounded-md bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                    >
                      ✓ {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {matchBreakdown.missingSkills.length > 0 && (
              <div>
                <span className="text-[11px] font-semibold text-slate-600 dark:text-zinc-400 block mb-1">
                  Compétences de l&apos;offre non détectées dans votre CV :
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {matchBreakdown.missingSkills.map((s: string) => (
                    <span
                      key={s}
                      className="px-2 py-0.5 text-xs font-medium rounded-md bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400"
                    >
                      • {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {matchBreakdown.unsupportedRequirements.length > 0 && (
              <div className="pt-2">
                <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-400 block mb-1">
                  Exigences clés non attestées par votre CV :
                </span>
                <div className="space-y-1">
                  {matchBreakdown.unsupportedRequirements.map((u: string) => (
                    <div
                      key={u}
                      className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-800 dark:text-rose-300 flex items-center space-x-1.5"
                    >
                      <span>✕</span>
                      <span>{u}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Lifecycle Dates & Provenance */}
          <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 space-y-3">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 block uppercase tracking-wider">
              Cycle de vie & Provenance de l&apos;offre :
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/60 dark:border-zinc-800/60">
                <span className="text-slate-400 dark:text-zinc-500 block text-[10px] uppercase font-semibold">Publié le</span>
                <span className="font-medium text-slate-800 dark:text-zinc-200 text-xs">
                  {opp?.date_posted ? (
                    formatDisplayDate(opp.date_posted)
                  ) : (
                    <span className="text-slate-500 dark:text-zinc-400 italic">Inconnue</span>
                  )}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/60 dark:border-zinc-800/60">
                <span className="text-slate-400 dark:text-zinc-500 block text-[10px] uppercase font-semibold">Date limite</span>
                <span className="font-medium text-slate-800 dark:text-zinc-200 text-xs">
                  {opp?.valid_through ? (
                    formatDisplayDate(opp.valid_through)
                  ) : (
                    <span className="text-slate-400 dark:text-zinc-500">Non précisée</span>
                  )}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/60 dark:border-zinc-800/60">
                <span className="text-slate-400 dark:text-zinc-500 block text-[10px] uppercase font-semibold">Dernière vérification</span>
                <span className="font-medium text-slate-800 dark:text-zinc-200 text-xs">
                  {opp?.last_checked_at ? formatDisplayDate(opp.last_checked_at) : "Récemment"}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/60 dark:border-zinc-800/60">
                <span className="text-slate-400 dark:text-zinc-500 block text-[10px] uppercase font-semibold">Plateforme source</span>
                <span className="font-medium text-slate-800 dark:text-zinc-200 text-xs truncate block" title={displaySourcePlatform}>
                  {displaySourcePlatform}
                </span>
              </div>
            </div>

            {/* Unknown Date Warning Banner */}
            {isPublicationDateUnknown && (
              <div className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-800 dark:text-amber-300 flex items-start space-x-2">
                <span className="shrink-0 mt-0.5">⚠️</span>
                <span>
                  <strong>Date de publication originale non établie :</strong> cette opportunité ne comporte pas de date de publication certifiée par une annonce d&apos;origine vérifiable. Veuillez vérifier que l&apos;offre est toujours ouverte avant de postuler.
                </span>
              </div>
            )}

            {/* Verifiable source announcement and portal links */}
            <div className="pt-1 space-y-1.5 text-xs text-slate-500 dark:text-zinc-400">
              {sourceAnnouncementUrl && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <span>Annonce d&apos;origine ({displaySourcePlatform}) :</span>
                  <a
                    href={sourceAnnouncementUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1"
                  >
                    <span className="truncate max-w-[280px] sm:max-w-md">{sourceAnnouncementUrl}</span>
                    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              )}
              {applicationPortalUrl && applicationPortalUrl !== sourceAnnouncementUrl && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <span>Portail de candidature direct :</span>
                  <a
                    href={applicationPortalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-emerald-600 dark:text-emerald-400 hover:underline flex items-center space-x-1"
                  >
                    <span className="truncate max-w-[280px] sm:max-w-md">{applicationPortalUrl}</span>
                    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Explicit Seniority Warning Banner when Mismatch Exists */}
          {matchBreakdown.seniorityMismatch && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 space-y-3">
              <div className="flex items-start space-x-2.5">
                <span className="text-lg">⚠️</span>
                <div>
                  <h3 className="text-xs font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wider">
                    Écart de séniorité majeur détecté
                  </h3>
                  <p className="text-xs text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
                    {matchBreakdown.seniorityWarning}
                  </p>
                </div>
              </div>
              <div className="pt-2 border-t border-amber-200 dark:border-amber-800/60 flex flex-wrap items-center justify-between gap-2">
                <Link
                  href="/opportunities"
                  className="text-xs font-bold text-amber-900 dark:text-amber-200 underline hover:no-underline"
                >
                  ← Voir les opportunités Junior / Stage / PFE adaptées
                </Link>
                <span className="text-[11px] text-amber-700 dark:text-amber-400">
                  Le message ci-dessous est adapté avec réserve et humilité
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Outdated / Stale Draft Alert Banner */}
        {staleDraftCheck.hasStaleClaims && (
          <div className="mb-6 p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-400 dark:border-amber-700 shadow-xs space-y-3">
            <div className="flex items-start space-x-3">
              <span className="text-xl">⚠️</span>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-amber-950 dark:text-amber-200">
                  Formulations non vérifiées détectées dans ce brouillon sauvegardé
                </h3>
                <p className="text-xs text-amber-900/90 dark:text-amber-300/90 leading-relaxed">
                  Ce message a été sauvegardé antérieurement aux contrôles d&apos;intégrité stricts. Des affirmations non documentées dans votre CV ont été identifiées :
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-xs text-amber-950 dark:text-amber-200 font-medium pt-1">
                  {staleDraftCheck.unsupportedClaimsFound.map((claim, idx) => (
                    <li key={idx}>{claim}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="pt-2 border-t border-amber-300/80 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-amber-900 dark:text-amber-300">
              <span>
                💡 Cliquez sur <strong>« Regenerate with CV »</strong> ci-dessous pour actualiser automatiquement ce brouillon avec vos faits réels.
              </span>
            </div>
          </div>
        )}

        {/* Draft Provenance Banner */}
        {provenance && provenance.provider === "gemini" && provenance.isAiGenerated ? (
          <div className="mb-6 p-4 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/80 rounded-xl flex items-start text-xs text-emerald-800 dark:text-emerald-300 space-x-3 shadow-2xs">
            <svg className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <div className="space-y-0.5">
              <div className="flex items-center space-x-2">
                <span className="font-semibold block">
                  Génération IA Confirmée (Google Gemini)
                </span>
                {provenance.model && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-200/60 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200">
                    {provenance.model}
                  </span>
                )}
              </div>
              <p className="text-emerald-700/90 dark:text-emerald-300/90">
                Ce brouillon a été formulé avec succès par le modèle IA Google Gemini à partir de vos compétences vérifiées et des exigences du poste.
              </p>
            </div>
          </div>
        ) : provenance && (!provenance.isAiGenerated || provenance.provider === "mock") ? (
          <div className="mb-6 p-4 bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 rounded-xl flex items-start text-xs text-slate-600 dark:text-zinc-400 space-x-3 shadow-2xs">
            <svg className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="space-y-0.5">
              <span className="font-semibold text-slate-800 dark:text-zinc-200 block">
                Mode Démo / Synthèse CV Déterministe
              </span>
              <p>
                Ce brouillon a été rédigé de façon déterministe à partir de vos compétences et détails réels extraits de votre CV
                {provenance.fallbackReason ? ` (${provenance.fallbackReason})` : ""}.
              </p>
            </div>
          </div>
        ) : (
          <div className="mb-6 p-4 bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 rounded-xl flex items-start text-xs text-slate-600 dark:text-zinc-400 space-x-3 shadow-2xs">
            <svg className="h-5 w-5 text-slate-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
            </svg>
            <div className="space-y-0.5">
              <span className="font-semibold text-slate-800 dark:text-zinc-200 block">
                Brouillon Sauvegardé en Base
              </span>
              <p>
                Ce brouillon est enregistré dans votre base de données. Vous pouvez le personnaliser manuellement ou utiliser le bouton &quot;Regenerate with AI&quot; pour le formuler à nouveau via {aiProvider === "gemini" && hasGeminiKey ? "Google Gemini" : "le moteur d'analyse de CV"}.
              </p>
            </div>
          </div>
        )}

        {/* Application Sent Banner */}
        {app.status === "sent" && (
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/80 rounded-2xl flex items-start shadow-xs">
            <svg
              className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 mr-3 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <div>
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300">
                Application Sent (Simulated Demo Mode)
              </h3>
              <p className="text-sm text-blue-800 dark:text-blue-400 mt-1 leading-relaxed">
                This application has been successfully transmitted in simulated demo mode. To ensure candidate auditability and integrity, this draft is permanently locked against further edits.
              </p>
            </div>
          </div>
        )}

        {/* Approved Warning */}
        {isApproved && app.status !== "sent" && (
          <div className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80 rounded-2xl flex items-start shadow-xs">
            <svg
              className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 mr-3 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-300">
                Draft Approved & Locked
              </h3>
              <p className="text-sm text-emerald-800 dark:text-emerald-400 mt-1 leading-relaxed">
                This draft has been validated and cryptographically stamped. Any subsequent modifications to recipient email, subject, body, or attached CV will invalidate the approval to protect you from unintended sends.
              </p>
            </div>
          </div>
        )}

        {/* Missing Recipient / Official Portal Application Banner */}
        {!hasVerifiedRecipient && (
          <div className="mb-6 p-5 rounded-2xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 shadow-xs space-y-3">
            <div className="flex items-start space-x-3">
              <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                    Mode Candidature Directe
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200/80 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200 border border-amber-300 dark:border-amber-700/60">
                    Aucun email de recruteur vérifié disponible
                  </span>
                </div>
                <p className="text-xs text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
                  Cette opportunité provient d&apos;un portail de recrutement officiel ou d&apos;un ATS d&apos;entreprise qui privilégie les candidatures en ligne directes. Pour préserver l&apos;intégrité de vos démarches, aucune adresse email générique ou fictive n&apos;a été devinée.
                </p>
              </div>
            </div>

            {officialApplyUrl && (
              <div className="pt-3 border-t border-amber-200/60 dark:border-amber-800/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="text-xs text-amber-900 dark:text-amber-300">
                  <span className="font-semibold block sm:inline">Portail officiel de candidature : </span>
                  <span className="text-slate-600 dark:text-zinc-400 text-[11px] font-mono break-all sm:ml-1">
                    {officialApplyUrl}
                  </span>
                </div>
                <a
                  href={officialApplyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center space-x-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors shrink-0"
                >
                  <span>
                    {isSpontaneousDraft
                      ? "Accéder au portail carrières officiel / formulaire ↗"
                      : "Postuler sur le site officiel de l'employeur ↗"}
                  </span>
                </a>
              </div>
            )}
          </div>
        )}

        {/* Editor Form */}
        <div className="bg-white dark:bg-zinc-900 shadow-xs rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
          <form action={saveDraft} className="p-6 sm:p-8 space-y-6">
            <input type="hidden" name="draft_id" value={draft.id} />
            <input type="hidden" name="application_id" value={app.id} />

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300">
                  Recipient Email Address
                </label>
                {!hasVerifiedRecipient ? (
                  <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                    Aucun email vérifié disponible
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    ✓ Adresse vérifiée
                  </span>
                )}
              </div>
              <input
                key={`recipient-${draft.id}-${displayRecipientEmail}`}
                name="recipient_email"
                defaultValue={displayRecipientEmail}
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 shadow-xs"
                placeholder={
                  hasVerifiedRecipient
                    ? "recruiter@company.com"
                    : "Laisser vide si candidature sur portail (ou saisir un email vérifié)"
                }
              />
              {!hasVerifiedRecipient && (
                <p className="mt-1.5 text-[11px] text-slate-500 dark:text-zinc-400 leading-normal">
                  💡 Si vous avez un contact direct vérifié, saisissez-le ici pour activer l&apos;approbation d&apos;envoi d&apos;email. Sinon, copiez le message ci-dessous pour postuler sur le portail officiel de l&apos;employeur.
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300">
                  Subject Line
                </label>
                <span className="text-[11px] text-slate-400 dark:text-zinc-500">
                  CV-tailored header
                </span>
              </div>
              <input
                key={`subject-${draft.id}-${draft.subject}`}
                name="subject"
                defaultValue={draft.subject || ""}
                required
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 shadow-xs"
                placeholder="Application for [Role] - [Your Name]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300">
                  Email Message Body
                </label>
                <span className="text-xs text-slate-400 dark:text-zinc-500">
                  Plain text formatted • Editable
                </span>
              </div>
              <textarea
                key={`body-${draft.id}-${draft.body?.slice(0, 20)}`}
                name="body"
                defaultValue={draft.body || ""}
                rows={15}
                required
                className="w-full px-3.5 py-3 text-sm bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 shadow-xs font-mono leading-relaxed"
                placeholder="Cher recruteur..."
              />
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/60 dark:border-zinc-800/60 space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300">
                Attached Curriculum Vitae
              </label>
              <select
                name="resume_id"
                defaultValue={app.resume_id || ""}
                required
                className="w-full px-3.5 py-2 text-sm bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 rounded-lg text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 shadow-xs"
              >
                {resumes?.map((r) => (
                  <option key={r.id} value={r.id}>
                    CV uploaded on {formatDisplayDate(r.created_at)} {r.id === app.resume_id ? "(Currently Attached)" : ""}
                  </option>
                ))}
              </select>

              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400 pt-1">
                <span>The PDF document hash is locked with the approval snapshot.</span>
                {signedResumeUrl && (
                  <a
                    className="font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1"
                    href={signedResumeUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>Preview Attached PDF</span>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              {app.status === "sent" || app.status === "sending" ? (
                <div className="w-full flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center space-x-1.5">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>
                      {app.status === "sent" ? "Application Sent & Logged (Simulated Demo)" : "Transmission In Progress..."}
                    </span>
                  </span>
                  <Link
                    href="/dashboard"
                    className="px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 font-medium text-xs rounded-xl transition-all shadow-xs"
                  >
                    Return to Dashboard
                  </Link>
                </div>
              ) : (
                <>
                  <div className="flex items-center space-x-2 w-full sm:w-auto">
                    <button
                      type="submit"
                      formAction={saveDraft}
                      className="w-full sm:w-auto px-5 py-2.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-700 font-medium text-sm rounded-xl transition-colors shadow-2xs cursor-pointer text-center"
                    >
                      Save Draft
                    </button>

                    <button
                      type="submit"
                      formAction={regenerateDraft}
                      title="Re-generate email using latest profile and CV data"
                      className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-750 text-slate-700 dark:text-zinc-300 font-medium text-xs rounded-xl transition-colors cursor-pointer text-center flex items-center justify-center space-x-1.5"
                    >
                      <svg className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Regenerate with CV</span>
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row items-end sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
                    {isVacancyClosedOrExpired ? (
                      <button
                        type="button"
                        disabled
                        className="w-full sm:w-auto px-5 py-2.5 bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 font-medium text-sm rounded-xl cursor-not-allowed border border-rose-200 dark:border-rose-900/60 shadow-2xs"
                        title="Cette offre est clôturée ou expirée. L'approbation est bloquée."
                      >
                        Candidature Bloquée (Offre Clôturée/Expirée)
                      </button>
                    ) : matchBreakdown.availabilityConflict && (!draft.conflict_resolution || draft.conflict_resolution === "unresolved") ? (
                      <button
                        type="button"
                        disabled
                        className="w-full sm:w-auto px-5 py-2.5 bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 font-medium text-sm rounded-xl cursor-not-allowed border border-amber-300 dark:border-amber-800 shadow-2xs"
                        title="Veuillez choisir une option dans le panneau de décision ci-dessus pour débloquer l'approbation."
                      >
                        Approbation bloquée (Conflit de calendrier non résolu)
                      </button>
                    ) : !hasVerifiedRecipient ? (
                      <div className="flex flex-col sm:flex-row items-center gap-2">
                        {officialApplyUrl && (
                          <a
                            href={officialApplyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-sm rounded-xl transition-all shadow-md shadow-blue-500/20 cursor-pointer text-center flex items-center justify-center space-x-1.5"
                          >
                            <span>Postuler via le portail officiel ↗</span>
                          </a>
                        )}
                        <button
                          type="button"
                          disabled
                          className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 font-medium text-xs rounded-xl cursor-not-allowed border border-slate-200 dark:border-zinc-700"
                          title="Aucun email recruteur vérifié n'est associé à cette offre. Postulez directement via le portail carrières officiel de l'employeur."
                        >
                          Envoi email indisponible (Email requis)
                        </button>
                      </div>
                    ) : (
                      <button
                        type="submit"
                        formAction={approveDraft}
                        className={`w-full sm:w-auto px-5 py-2.5 font-medium text-sm rounded-xl transition-all shadow-md cursor-pointer ${
                          isApproved
                            ? "bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-200"
                            : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-blue-500/20"
                        }`}
                      >
                        {isApproved ? "Re-Approve Draft" : "Approve & Ready"}
                      </button>
                    )}

                    {isApproved && !isVacancyClosedOrExpired && (
                      <button
                        type="submit"
                        formAction={sendApprovedApplicationEmail}
                        className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-medium text-sm rounded-xl transition-all shadow-md shadow-emerald-500/20 cursor-pointer flex items-center justify-center space-x-1.5"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                        <span>{app.status === "failed" ? "Retry Send (Demo Mode)" : "Send (Demo Mode)"}</span>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
            {!hasVerifiedRecipient && app.status !== "sent" && app.status !== "sending" && (
              <div className="px-6 py-2 bg-amber-50/50 dark:bg-amber-950/20 border-t border-amber-200/40 dark:border-amber-900/30 text-[11px] text-amber-800 dark:text-amber-400 flex items-center justify-between">
                <span>⚠️ Aucun email de recruteur vérifié disponible.</span>
                {officialApplyUrl && (
                  <a
                    href={officialApplyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold underline hover:no-underline text-blue-600 dark:text-blue-400"
                  >
                    Postuler sur le portail officiel de l&apos;employeur ↗
                  </a>
                )}
              </div>
            )}
          </form>
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
