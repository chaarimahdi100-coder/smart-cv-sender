import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { AppFooter } from "@/components/layout/AppFooter";
import { OpportunityDirectoryClient, OpportunityItem } from "./OpportunityDirectoryClient";
import { calculateOpportunityMatchScore } from "@/lib/opportunity-matcher";
import { isAuthorizedOpportunityManager } from "@/lib/auth/admin-auth";
import { CandidateData, resolveExactProgramName } from "@/lib/email-generator";
import { seedTunisianOpportunitiesFormAction } from "./manage-actions";
import { isOpportunityStale } from "@/lib/discovery/verifier";

export const instant = false;

export default async function OpportunitiesPage() {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?error=" + encodeURIComponent("Veuillez vous connecter pour accéder aux offres d'emploi et de stage."));
  }

  const authCheck = isAuthorizedOpportunityManager(user);
  const isManager = authCheck.authorized;

  // 1. Fetch Candidate Profile and Latest Resume for Deterministic Scoring
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const { data: latestResume } = await supabase
    .from("resumes")
    .select("id, extracted_data")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

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
    rawCvText: rawCvText,
    skills: extData.skills,
  };

  const verifiedDegreeName = resolveExactProgramName(candidateData);

  // 2. Fetch Opportunities (including closed/expired for dedicated historical tab)
  const oppQuery = supabase
    .from("opportunities")
    .select("*, companies(name, website)");

  const { data: rawOpportunities, error } = await oppQuery.order("created_at", { ascending: false });

  type OppRecord = {
    id: string;
    title: string;
    description: string;
    location: string;
    type: string;
    domain?: string | null;
    source_url?: string | null;
    canonical_url?: string | null;
    source_provider?: string | null;
    source_platform?: string | null;
    application_url?: string | null;
    updated_at_source?: string | null;
    closed_at?: string | null;
    verification_status?: string | null;
    status_reason?: string | null;
    verification_evidence?: Record<string, unknown> | null;
    date_posted?: string | null;
    valid_through?: string | null;
    last_checked_at?: string | null;
    remote_policy?: string | null;
    is_active?: boolean;
    is_demo?: boolean;
    companies: { name: string; website?: string | null } | null;
  };

  const opsList = (rawOpportunities || []) as OppRecord[];

  // 3. Compute Honest Relevance Scores for Each Opportunity
  const opportunityItems: OpportunityItem[] = opsList.map((op) => {
    const oppData = {
      title: op.title,
      companyName: op.companies?.name || "Entreprise",
      description: op.description,
      location: op.location,
      type: op.type,
      source_url: op.source_url,
      canonical_url: op.canonical_url,
      source_provider: op.source_provider,
      source_platform: op.source_platform,
      application_url: op.application_url,
      status_reason: op.status_reason,
      verification_evidence: op.verification_evidence,
    };

    const matchBreakdown = calculateOpportunityMatchScore(
      hasCandidateCv ? candidateData : null,
      oppData
    );

    const isDemo = Boolean(
      op.is_demo ||
      op.title?.startsWith("[DEMO]") ||
      op.companies?.name?.includes("[DEMO]") ||
      op.source_url?.includes("demo")
    );

    // Strict fallback: never assume verified_open or likely_open without verified evidence.
    let verification_status = op.verification_status;
    if (!verification_status) {
      verification_status = "unverified";
    }

    const staleEvaluation = isOpportunityStale(
      op.date_posted,
      op.type || op.title,
      undefined,
      op.last_checked_at
    );
    const isStale = staleEvaluation.isStale;

    return {
      id: op.id,
      title: op.title,
      description: op.description,
      location: op.location || "Tunisie",
      type: op.type,
      domain: op.domain,
      source_url: op.source_url,
      canonical_url: op.canonical_url,
      source_provider: op.source_provider,
      source_platform: op.source_platform || (op.verification_evidence?.sourcePlatformName as string) || null,
      application_url: op.application_url || (op.verification_evidence?.directApplicationUrl as string) || op.canonical_url || op.source_url,
      verification_status,
      status_reason: op.status_reason || null,
      verification_evidence: op.verification_evidence || null,
      date_posted: op.date_posted,
      valid_through: op.valid_through,
      last_checked_at: op.last_checked_at,
      closed_at: op.closed_at,
      updated_at_source: op.updated_at_source,
      remote_policy: op.remote_policy,
      is_active: op.is_active !== false,
      companies: op.companies,
      matchBreakdown,
      isDemo,
      isStale,
    };
  });

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100">
      <AppNavbar userEmail={user?.email} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1">
              <span>Répertoire d&apos;Opportunités Professionnelles</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Offres PFE, Stages & Postes Junior
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400 max-w-2xl">
              Postulez aux opportunités ciblées en Tunisie avec génération d&apos;emails assistée par IA et évaluation transparente d&apos;adéquation technique.
            </p>
          </div>
          <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-zinc-400 bg-white dark:bg-zinc-900 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-2xs">
            <span className="font-semibold text-slate-700 dark:text-zinc-300">{opportunityItems.length}</span> opportunités répertoriées
          </div>
        </div>

        {error ? (
          <div className="p-6 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 rounded-2xl text-rose-700 dark:text-rose-400 text-sm">
            Erreur lors du chargement des offres depuis la base de données : {error.message}
          </div>
        ) : opportunityItems.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-12 text-center text-slate-500 dark:text-zinc-400">
            <div className="max-w-md mx-auto space-y-3">
              <span className="text-3xl">📂</span>
              <p className="font-semibold text-slate-800 dark:text-zinc-200">
                Aucune opportunité active n&apos;est actuellement répertoriée dans la base de données.
              </p>
              <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                Vous pouvez charger le catalogue initial d&apos;offres tunisiennes ciblées (PFE, stages d&apos;été et postes juniors) pour alimenter le répertoire.
              </p>
              {isManager ? (
                <form action={seedTunisianOpportunitiesFormAction}>
                  <button
                    type="submit"
                    className="mt-2 inline-flex items-center px-5 py-2.5 border border-blue-600 text-xs font-semibold rounded-xl text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
                  >
                    Charger le Catalogue d&apos;Opportunités Tunisiennes
                  </button>
                </form>
              ) : (
                <p className="text-xs text-slate-400 dark:text-zinc-500 italic mt-2">
                  Contactez un gestionnaire pour synchroniser le catalogue d&apos;opportunités.
                </p>
              )}
            </div>
          </div>
        ) : (
          <OpportunityDirectoryClient
            opportunities={opportunityItems}
            hasCandidateCv={hasCandidateCv}
            candidateDegree={verifiedDegreeName}
            isManager={isManager}
          />
        )}
      </main>

      <AppFooter />
    </div>
  );
}
