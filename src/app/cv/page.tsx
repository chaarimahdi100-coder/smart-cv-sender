import { connection } from "next/server";
import { uploadCV } from "./actions";
import { isDemoUser } from "@/lib/demo-mode";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { AppFooter } from "@/components/layout/AppFooter";
import { CVDownloadButton } from "@/components/ui/CVDownloadButton";

export const instant = false;

interface ExtractedData {
  data?: {
    school?: string;
    degree?: string;
    specialty?: string;
    skills?: string[];
  };
}

export default async function CVUploadPage() {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const isDemo = isDemoUser(user.email);

  // Fetch the latest CV if present
  const { data: latestResume } = await supabase
    .from("resumes")
    .select("id, storage_path, created_at, extracted_data")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const ext = (latestResume?.extracted_data || {}) as ExtractedData;
  const parsedData = ext.data || null;
  const rawFileName = latestResume?.storage_path ? latestResume.storage_path.split("/").pop() : null;
  const displayFileName = rawFileName && rawFileName.length > 5 ? rawFileName : "Curriculum Vitae (PDF)";

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100">
      <AppNavbar userEmail={user.email} />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1">
            <span>Étape 1 sur 2 • Profil & Ingestion CV</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Votre Curriculum Vitae
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
            Téléversez votre CV au format PDF. Notre plateforme extrait vos compétences pour matcher avec les meilleures offres de stage et d&apos;emploi.
          </p>
        </div>

        {isDemo && (
          <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80 rounded-2xl flex items-start shadow-xs space-x-3">
            <svg
              className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                Mode Démo — CV de test actif
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400/90 mt-0.5 leading-relaxed">
                Le CV de démonstration (Yassine Ben Salem, Génie Logiciel ESPRIT) est actuellement configuré pour simuler le scoring d&apos;opportunités et la rédaction d&apos;emails.
              </p>
            </div>
          </div>
        )}

        {/* Active CV Card if exists */}
        {latestResume && (
          <div className="mb-8 bg-white dark:bg-zinc-900 shadow-sm rounded-2xl border border-emerald-200 dark:border-emerald-800/60 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start space-x-4">
                <div className="h-12 w-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-900/50">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      {displayFileName}
                    </h2>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                      CV Actif
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                    Ajouté le {new Date(latestResume.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                  {parsedData && (parsedData.school || (parsedData.skills && parsedData.skills.length > 0)) && (
                    <div className="mt-3 flex flex-wrap gap-1.5 items-center">
                      {parsedData.school && (
                        <span className="text-xs font-medium bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 px-2.5 py-1 rounded-md">
                          🎓 {parsedData.school}
                        </span>
                      )}
                      {parsedData.skills?.slice(0, 4).map((skill: string) => (
                        <span key={skill} className="text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-md">
                          {skill}
                        </span>
                      ))}
                      {(parsedData.skills?.length || 0) > 4 && (
                        <span className="text-xs text-slate-400 dark:text-zinc-500">
                          +{(parsedData.skills?.length || 0) - 4} autres
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="shrink-0 pt-2 sm:pt-0">
                <CVDownloadButton resumeId={latestResume.id} />
              </div>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-zinc-900 shadow-xs rounded-2xl border border-slate-200 dark:border-zinc-800 p-6 sm:p-8">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {latestResume ? "Remplacer ou mettre à jour votre CV" : "Téléverser un nouveau CV"}
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Sélectionnez un fichier PDF valide pour réanalyser votre profil et actualiser votre score de correspondance.
            </p>
          </div>

          <form action={uploadCV} className="space-y-6">
            <div className="border-2 border-dashed border-slate-300 dark:border-zinc-700/80 hover:border-blue-500 dark:hover:border-blue-400 rounded-2xl p-8 sm:p-12 flex flex-col items-center justify-center text-center transition-colors bg-slate-50/50 dark:bg-zinc-950/40">
              <div className="h-14 w-14 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3 shadow-xs">
                <svg
                  className="w-7 h-7"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              </div>

              <p className="text-sm font-semibold text-slate-800 dark:text-zinc-200 mb-1">
                Choisir un fichier PDF à téléverser
              </p>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mb-5 max-w-sm">
                Format supporté : <span className="font-semibold text-slate-700 dark:text-zinc-300">PDF</span>. Taille maximale : <span className="font-semibold text-slate-700 dark:text-zinc-300">5 Mo</span>.
              </p>

              <div className="w-full max-w-xs">
                <input
                  type="file"
                  name="cv_file"
                  accept=".pdf,application/pdf"
                  required
                  className="block w-full text-xs text-slate-500 dark:text-zinc-400
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-xl file:border-0
                    file:text-xs file:font-semibold
                    file:bg-blue-50 file:text-blue-700
                    dark:file:bg-blue-900/40 dark:file:text-blue-400
                    hover:file:bg-blue-100 dark:hover:file:bg-blue-900/60
                    cursor-pointer"
                />
              </div>
            </div>

            {/* Privacy & Security Note */}
            <div className="flex items-start space-x-3 p-4 bg-slate-50 dark:bg-zinc-800/40 rounded-xl border border-slate-200/60 dark:border-zinc-700/60 text-xs text-slate-600 dark:text-zinc-400">
              <svg
                className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <div>
                <span className="font-semibold text-slate-800 dark:text-zinc-200">
                  Stockage Sécurisé & Privé :
                </span>{" "}
                Votre CV est isolé dans un bucket Supabase Storage avec des règles Row-Level Security strictes basées sur votre identifiant d&apos;authentification. Aucun autre candidat n&apos;y a accès.
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-zinc-800">
              <span className="text-xs text-slate-500 dark:text-zinc-400">
                Suivant : Extraction des compétences & matching
              </span>
              <button
                type="submit"
                disabled={isDemo}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-sm rounded-xl transition-all shadow-md shadow-blue-500/20 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isDemo ? "Importation désactivée (Mode Démo)" : "Téléverser & Analyser"}
              </button>
            </div>
          </form>
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
