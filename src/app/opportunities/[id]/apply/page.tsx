import { connection } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createApplicationDraft } from "./actions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { AppFooter } from "@/components/layout/AppFooter";
import { formatDisplayDate, isDateInPast } from "@/lib/date-utils";
import { cleanHtmlToPlainText } from "@/lib/text-sanitizer";
import { calculateOpportunityMatchScore } from "@/lib/opportunity-matcher";
import { CandidateData, OpportunityData, resolveExactProgramName } from "@/lib/email-generator";

export const instant = false;

export default async function ApplyPage(props: { params: Promise<{ id: string }> }) {
  await connection();
  const params = await props.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: opportunity, error: oppError } = await supabase
    .from("opportunities")
    .select("*, companies(name)")
    .eq("id", params.id)
    .single();

  if (oppError || !opportunity) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-zinc-950">
        <AppNavbar userEmail={user.email} />
        <main className="flex-1 max-w-xl mx-auto px-4 py-16 text-center">
          <div className="p-6 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 rounded-2xl text-rose-700 dark:text-rose-400">
            <h2 className="text-lg font-semibold mb-2">Opportunity Not Found</h2>
            <p className="text-sm">This opportunity may have expired or been removed.</p>
            <Link href="/opportunities" className="mt-4 inline-block text-xs font-semibold text-blue-600 hover:underline">
              ← Return to Opportunities
            </Link>
          </div>
        </main>
        <AppFooter />
      </div>
    );
  }

  // Fetch candidate profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  // Fetch user's resumes
  const { data: resumes } = await supabase
    .from("resumes")
    .select("id, created_at, storage_path, extracted_data")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  type ExtractedPayload = {
    data?: {
      first_name?: string;
      last_name?: string;
      school?: string;
      degree?: string;
      specialty?: string;
      skills?: string[];
      languages?: string[];
    };
    rawText?: string;
  };

  const latestResume = resumes?.[0];
  const ext = (latestResume?.extracted_data || {}) as ExtractedPayload;
  const extData = ext.data || {};
  const rawCvText = ext.rawText;
  const hasCandidateCv = Boolean(rawCvText && rawCvText.length > 0) || Boolean(extData.skills && extData.skills.length > 0);

  const candidateData: CandidateData = {
    first_name: profile?.first_name || extData.first_name,
    last_name: profile?.last_name || extData.last_name,
    email: user.email,
    school: profile?.school || extData.school,
    degree: profile?.degree || extData.degree,
    specialty: extData.specialty || profile?.specialty,
    city: profile?.city,
    country: profile?.country,
    rawCvText: rawCvText,
    skills: extData.skills,
  };

  const verifiedDegreeName = resolveExactProgramName(candidateData);

  const opportunityData: OpportunityData = {
    title: opportunity.title,
    companyName: opportunity.companies?.name,
    description: opportunity.description,
    location: opportunity.location,
    type: opportunity.type,
  };

  const matchBreakdown = calculateOpportunityMatchScore(
    hasCandidateCv ? candidateData : null,
    opportunityData
  );

  const scoreBadgeColor =
    matchBreakdown.relevanceLevel === "high"
      ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800"
      : matchBreakdown.relevanceLevel === "good"
      ? "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border-blue-300 dark:border-blue-800"
      : matchBreakdown.relevanceLevel === "moderate"
      ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-300 dark:border-amber-800"
      : "bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border-rose-300 dark:border-rose-800";

  const isSpontaneousLead =
    opportunity.verification_status === "unverified" ||
    Boolean(opportunity.status_reason?.toLowerCase().includes("spontanée")) ||
    opportunity.title.toLowerCase().includes("piste") ||
    opportunity.title.toLowerCase().includes("spontanée");

  const isPastDeadline = isDateInPast(opportunity.valid_through);
  const isVacancyClosedOrExpired = Boolean(
    opportunity.verification_status === "closed" ||
    opportunity.verification_status === "expired" ||
    opportunity.is_active === false ||
    isPastDeadline
  );
  const officialApplyUrl = opportunity.application_url || opportunity.source_url || null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100">
      <AppNavbar userEmail={user.email} />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link
            href="/opportunities"
            className="inline-flex items-center space-x-1.5 text-xs font-medium text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 mb-3"
          >
            <span>← Back to Opportunities</span>
          </Link>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                {opportunity.title}
              </h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
                {opportunity.companies?.name} • {opportunity.location}
              </p>
            </div>
            {hasCandidateCv && (
              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${scoreBadgeColor}`}>
                {matchBreakdown.score}% • {matchBreakdown.relevanceLabel}
              </span>
            )}
          </div>
        </div>

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
                  Cette opportunité n&apos;est plus active ou sa date limite ({opportunity.valid_through ? formatDisplayDate(opportunity.valid_through) : "passée"}) est dépassée. Pour préserver votre crédibilité professionnelle auprès de {opportunity.companies?.name || "l'employeur"}, la création de candidatures et l&apos;envoi d&apos;emails pour cette offre sont bloqués.
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
                  {matchBreakdown.matchedSkills.map((s) => (
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
                  {matchBreakdown.missingSkills.map((s) => (
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
                  {matchBreakdown.unsupportedRequirements.map((u) => (
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
                  Confirmation requise ci-dessous pour continuer
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Application Form */}
        <div className="bg-white dark:bg-zinc-900 shadow-xs rounded-2xl border border-slate-200 dark:border-zinc-800 p-6 sm:p-8">
          <form action={createApplicationDraft} className="space-y-6">
            <input type="hidden" name="opportunity_id" value={opportunity.id} />

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/60 dark:border-zinc-800/60 text-xs text-slate-600 dark:text-zinc-400 space-y-2">
              <span className="font-semibold text-slate-900 dark:text-zinc-200 block">
                Job Overview
              </span>
              <p className="leading-relaxed line-clamp-4">{cleanHtmlToPlainText(opportunity.description)}</p>
              {opportunity.source_url && (
                <div className="pt-2 border-t border-slate-200/60 dark:border-zinc-800/60 space-y-1">
                  <a
                    href={opportunity.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-1.5 font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <span>
                      {isSpontaneousLead
                        ? "Accéder au portail carrières officiel / formulaire de candidature ↗"
                        : "Consulter l'offre officielle et postuler en ligne ↗"}
                    </span>
                  </a>
                  {isSpontaneousLead && (
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                      Canal de recrutement de l&apos;employeur (formulaire carrières général / candidature spontanée sans annonce spécifique).
                    </p>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-2">
                Select CV to Attach
              </label>

              {!resumes || resumes.length === 0 ? (
                <div className="p-5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-400 space-y-2">
                  <p className="font-medium">No CV uploaded yet.</p>
                  <p>You need at least one uploaded CV to generate an application email draft.</p>
                  <Link
                    href="/cv"
                    className="inline-block mt-1 font-bold underline hover:no-underline text-blue-600 dark:text-blue-400"
                  >
                    Upload your CV now →
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  <select
                    name="resume_id"
                    required
                    className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 shadow-xs"
                  >
                    {resumes.map((r, i) => (
                      <option key={r.id} value={r.id}>
                        CV #{i + 1} • Uploaded on {formatDisplayDate(r.created_at)}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    The chosen PDF will be securely linked to this specific application and draft.
                  </p>
                </div>
              )}
            </div>

            {/* Checkbox for Seniority Mismatch Confirmation */}
            {matchBreakdown.seniorityMismatch && (
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800">
                <label className="flex items-start space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    name="confirm_seniority_gap"
                    value="true"
                    required
                    className="mt-0.5 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-zinc-700 cursor-pointer"
                  />
                  <span className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed">
                    Je confirme avoir pris connaissance de l&apos;écart d&apos;expérience pour ce poste ({matchBreakdown.roleSeniorityLabel}) et souhaite générer un brouillon formulé sous l&apos;angle de mes compétences réelles d&apos;étudiant / junior.
                  </span>
                </label>
              </div>
            )}

            <div className="pt-4 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-zinc-400">
                You will review the draft before sending
              </span>
              {isVacancyClosedOrExpired ? (
                <button
                  type="button"
                  disabled
                  className="px-6 py-2.5 bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 font-medium text-sm rounded-xl cursor-not-allowed border border-rose-200 dark:border-rose-900/60 shadow-xs"
                  title="Cette opportunité est clôturée ou expirée. La génération d'un brouillon est bloquée."
                >
                  Candidature Bloquée (Offre Clôturée / Expirée)
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!resumes || resumes.length === 0}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-sm rounded-xl transition-all shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  Generate Email Draft →
                </button>
              )}
            </div>
          </form>
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
