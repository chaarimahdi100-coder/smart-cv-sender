import { connection } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { isDemoUser } from "@/lib/demo-mode";
import Link from "next/link";
import { FormattedDate } from "@/components/ui/FormattedDate";
import { CVDownloadButton } from "@/components/ui/CVDownloadButton";

export const instant = false;

export default async function DashboardPage() {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch applications overview
  const { data: applicationsData, error } = await supabase
    .from("applications")
    .select("id, status, created_at, opportunity_id, companies(name), opportunities(title, id)")
    .eq("user_id", user?.id)
    .order("created_at", { ascending: false });

  // Fetch active candidate CV
  const { data: latestResume } = await supabase
    .from("resumes")
    .select("id, storage_path, created_at, extracted_data")
    .eq("user_id", user?.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  type AppDetails = {
    id: string;
    status: string;
    created_at: string;
    opportunity_id?: string | null;
    companies: { name: string } | null;
    opportunities: { title: string; id: string } | null;
  };

  const isDemo = isDemoUser(user?.email);
  const applications = applicationsData as unknown as AppDetails[] | null;
  const recentApplications = applications ?? [];
  const totalApplications = applications?.length ?? 0;
  const approvedApplications =
    applications?.filter((app) => app.status === "approved").length ?? 0;
  const pendingApplications =
    applications?.filter((app) => ["draft", "pending_approval"].includes(app.status)).length ?? 0;
  const sentApplications =
    applications?.filter((app) => ["sent", "replied", "closed"].includes(app.status)).length ?? 0;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return {
          label: "✓ Validée / En Examen",
          className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800",
        };
      case "sent":
        return {
          label: "✉ Envoyée",
          className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800",
        };
      case "replied":
        return {
          label: "💬 Réponse Reçue",
          className: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800",
        };
      case "draft":
      case "pending_approval":
        return {
          label: "📝 Brouillon",
          className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800",
        };
      case "closed":
        return {
          label: "Clôturée",
          className: "bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700",
        };
      default:
        return {
          label: status,
          className: "bg-slate-100 text-slate-800 dark:bg-zinc-800 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700",
        };
    }
  };

  const resumeFileName = latestResume?.storage_path
    ? latestResume.storage_path.split("/").pop()
    : "Curriculum Vitae (PDF)";

  return (
    <div className="space-y-8">
      {/* Demo Mode Indicator Banner */}
      {isDemo && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center space-x-3.5">
            <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                Mode Démo Actif — Données d&apos;exemple partagées
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400/90 mt-0.5 leading-relaxed">
                Vous explorez l&apos;application avec le profil de test Yassine Ben Salem. Tous les envois d&apos;emails sont simulés (aucun courriel réel n&apos;est émis).
              </p>
            </div>
          </div>
          <div className="shrink-0 self-start sm:self-auto text-2xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-900/40 px-3 py-1.5 rounded-lg border border-amber-200/60 dark:border-amber-700/60">
            Simulation Mock
          </div>
        </div>
      )}

      {/* Header and Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Tableau de Bord Candidat
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
            Suivi en temps réel de vos candidatures, opportunités postulées et statuts de traitement.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            href="/cv"
            className="px-4 py-2 text-sm font-medium rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800/80 text-slate-700 dark:text-zinc-200 transition-colors shadow-2xs"
          >
            Gérer mon CV
          </Link>
          <Link
            href="/opportunities"
            className="px-4 py-2 text-sm font-medium rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm"
          >
            Explorer les Offres
          </Link>
        </div>
      </div>

      {/* Candidate Active CV Strip */}
      <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-900/50">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                {latestResume ? resumeFileName : "Aucun CV téléversé"}
              </p>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${latestResume ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-amber-100 text-amber-800"}`}>
                {latestResume ? "Actif pour vos candidatures" : "Action requise"}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
              {latestResume
                ? `Mis à jour le ${new Date(latestResume.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`
                : "Téléversez un CV au format PDF pour débloquer le scoring IA et les candidatures directes."}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          {latestResume ? (
            <>
              <CVDownloadButton resumeId={latestResume.id} label="Télécharger (PDF)" />
              <Link
                href="/cv"
                className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 transition-colors"
              >
                Remplacer
              </Link>
            </>
          ) : (
            <Link
              href="/cv"
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              Téléverser un CV →
            </Link>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Total Applications (Candidatures)
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
              {totalApplications}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">Dossiers créés</p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Validées / Examen
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
              {approvedApplications}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">Soumises & prêtes</p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Brouillons
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
              {pendingApplications}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">En cours de rédaction</p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Envoyées
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
              {sentApplications}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">Transmises</p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Applications List */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs overflow-hidden">
        <div className="px-6 py-4.5 border-b border-slate-100 dark:border-zinc-800/80 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Vos Candidatures
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Suivi et historique de vos candidatures auprès des entreprises.
            </p>
          </div>
          <span className="text-xs text-slate-400 dark:text-zinc-500 font-mono">
            {recentApplications.length} candidature(s)
          </span>
        </div>

        <div className="p-6">
          {error || recentApplications.length === 0 ? (
            <div className="py-12 text-center space-y-4">
              <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-400 dark:text-zinc-500">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  Aucune candidature enregistrée
                </p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mx-auto">
                  Consultez les offres PFE, stages et emplois juniors pour postuler en direct ou générer un pitch personnalisé.
                </p>
              </div>
              <Link
                href="/opportunities"
                className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                Explorer les Opportunités
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-zinc-800/80">
              {recentApplications.map((app) => {
                const badge = getStatusBadge(app.status);
                const oppId = app.opportunity_id || app.opportunities?.id;
                return (
                  <div
                    key={app.id}
                    className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        {oppId ? (
                          <Link
                            href={`/opportunities/${oppId}/apply`}
                            className="text-sm font-semibold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          >
                            {app.opportunities?.title || "Candidature Directe"}
                          </Link>
                        ) : (
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {app.opportunities?.title || "Candidature Directe"}
                          </p>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 flex items-center space-x-2">
                        <span>{app.companies?.name || "Entreprise Partenaire"}</span>
                        <span>•</span>
                        <FormattedDate date={app.created_at} />
                      </p>
                    </div>

                    <div className="flex items-center space-x-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                      <Link
                        href={`/applications/${app.id}/draft`}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors shadow-2xs"
                      >
                        Consulter le Dossier
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
