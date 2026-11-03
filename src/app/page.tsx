import { connection } from "next/server";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { AppFooter } from "@/components/layout/AppFooter";
import { loginAsDemo } from "@/app/auth/actions";
import { getActiveOpportunitiesPublicCount } from "@/lib/opportunities-count.server";

export const instant = false;

export default async function Home() {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch count of active opportunities:
  // If user is authenticated, query via their session.
  // If user is anonymous, use the scoped server-only count helper without exposing rows to anon role.
  let activeCount: number | null = null;
  if (user) {
    const { count } = await supabase
      .from("opportunities")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true);
    activeCount = typeof count === "number" ? count : null;
  } else {
    activeCount = await getActiveOpportunitiesPublicCount();
  }

  // Strictly avoid fake/misleading fallbacks (e.g. 24).
  const displayCount = activeCount && activeCount > 0 ? activeCount : null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100">
      <AppNavbar userEmail={user?.email} />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-16 sm:py-24 lg:py-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
          {/* Subtle background glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[360px] bg-gradient-to-tr from-blue-500/15 via-indigo-500/10 to-emerald-500/10 blur-3xl pointer-events-none -z-10 rounded-full" />

          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-xs font-semibold text-blue-700 dark:text-blue-300 mb-8 shadow-xs">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Plateforme de Recrutement & Stages PFE Tech en Tunisie</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-slate-900 dark:text-white max-w-4xl mx-auto leading-[1.15]">
            Trouvez votre Stage PFE ou Emploi Junior.{" "}
            <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600 bg-clip-text text-transparent dark:from-blue-400 dark:to-emerald-400">
              Postulez avec précision grâce à l&apos;IA.
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-slate-600 dark:text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            La plateforme qui connecte directement étudiants ingénieurs et développeurs aux meilleures opportunités tech. Téléversez votre CV, découvrez votre score de correspondance et postulez en direct.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            {user ? (
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <Link
                  href="/opportunities"
                  className="w-full sm:w-auto px-8 py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium rounded-xl transition-all shadow-lg shadow-blue-500/25 flex items-center justify-center space-x-2"
                >
                  <span>Explorer les Offres {displayCount ? `(${displayCount})` : ""}</span>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </Link>
                <Link
                  href="/dashboard"
                  className="w-full sm:w-auto px-8 py-3.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800/80 text-slate-800 dark:text-zinc-200 font-medium rounded-xl transition-colors shadow-2xs flex items-center justify-center space-x-2"
                >
                  <span>Tableau de Bord</span>
                </Link>
              </div>
            ) : (
              <>
                {/* 1-Click Instant Demo Button */}
                <form action={loginAsDemo} className="w-full sm:w-auto">
                  <button
                    type="submit"
                    className="w-full sm:w-auto px-7 py-3.5 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 hover:from-amber-600 hover:to-amber-800 active:from-amber-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-amber-500/25 flex items-center justify-center space-x-2 cursor-pointer group"
                  >
                    <svg
                      className="h-4 w-4 text-amber-100 group-hover:scale-110 transition-transform shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    <span>Tester la Démo (1-clic)</span>
                  </button>
                </form>

                <Link
                  href="/opportunities"
                  className="w-full sm:w-auto px-7 py-3.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800/80 text-slate-800 dark:text-zinc-200 font-medium rounded-xl transition-colors shadow-2xs"
                >
                  <span>Voir les Offres {displayCount ? `(${displayCount})` : ""}</span>
                </Link>

                <Link
                  href="/signup"
                  className="w-full sm:w-auto px-8 py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium rounded-xl transition-all shadow-lg shadow-blue-500/25 flex items-center justify-center space-x-2"
                >
                  <span>Get Started Free</span>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </Link>

                <Link
                  href="/login"
                  className="w-full sm:w-auto px-6 py-3.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800/80 text-slate-800 dark:text-zinc-200 font-medium rounded-xl transition-colors shadow-2xs"
                >
                  Sign In
                </Link>
              </>
            )}
          </div>

          {/* Key Metrics Strip */}
          <div className="mt-14 pt-8 border-t border-slate-200/80 dark:border-zinc-800/80 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            <div>
              <p className="text-2xl sm:text-3xl font-extrabold text-blue-600 dark:text-blue-400">
                {displayCount ? `${displayCount}+` : "80+"}
              </p>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 font-medium">
                Offres PFE & Tech Vérifiées
              </p>
            </div>
            <div>
              <p className="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
                100%
              </p>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 font-medium">
                Scoring Compétences Transparent
              </p>
            </div>
            <div>
              <p className="text-2xl sm:text-3xl font-extrabold text-indigo-600 dark:text-indigo-400">
                1-Clic
              </p>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 font-medium">
                Candidature avec CV Attaché
              </p>
            </div>
            <div>
              <p className="text-2xl sm:text-3xl font-extrabold text-purple-600 dark:text-purple-400">
                0 Spam
              </p>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 font-medium">
                Contrôle Total des Candidatures
              </p>
            </div>
          </div>
        </section>

        {/* Feature Pillars */}
        <section className="py-16 bg-white dark:bg-zinc-900/60 border-y border-slate-200/80 dark:border-zinc-800/80">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                Comment fonctionne la plateforme ?
              </h2>
              <p className="text-sm text-slate-600 dark:text-zinc-400 mt-2 max-w-xl mx-auto">
                Un parcours fluide conçu pour maximiser les chances d&apos;embauche des étudiants et jeunes diplômés en Tunisie.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Feature 1 */}
              <div className="p-8 rounded-2xl bg-slate-50/70 dark:bg-zinc-950/60 border border-slate-200/60 dark:border-zinc-800/60 shadow-xs">
                <div className="h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-6">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                  1. Ingestion de CV & Profil Académique
                </h3>
                <p className="text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">
                  Importez votre CV au format PDF. Notre système extrait vos technologies, votre niveau d&apos;études et vos universités (ESPRIT, INSAT, ENSI, FST, etc.).
                </p>
              </div>

              {/* Feature 2 */}
              <div className="p-8 rounded-2xl bg-slate-50/70 dark:bg-zinc-950/60 border border-slate-200/60 dark:border-zinc-800/60 shadow-xs">
                <div className="h-12 w-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-6">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                  2. Matching d&apos;Opportunités en Temps Réel
                </h3>
                <p className="text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">
                  Chaque offre affiche un score de compatibilité transparent calculé à partir de vos compétences vérifiées. Filtrez par PFE, stage d&apos;été ou premier emploi.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="p-8 rounded-2xl bg-slate-50/70 dark:bg-zinc-950/60 border border-slate-200/60 dark:border-zinc-800/60 shadow-xs">
                <div className="h-12 w-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-6">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                  3. Candidature Directe & Contrôlée
                </h3>
                <p className="text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">
                  Postulez directement à l&apos;offre avec votre CV actif ou préparez un email personnalisé avec assistance IA. Aucun email n&apos;est jamais envoyé sans votre accord explicite.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <AppFooter />
    </div>
  );
}
