import { connection } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { updateProfile } from "./actions";
import { isDemoUser } from "@/lib/demo-mode";
import { redirect } from "next/navigation";
import { UniversityCombobox } from "@/components/ui/UniversityCombobox";
import { DegreeCombobox } from "@/components/ui/DegreeCombobox";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { AppFooter } from "@/components/layout/AppFooter";

export const instant = false;

export default async function ProfilePage(props: {
  searchParams?: Promise<{ error?: string; success?: string }>;
}) {
  // Ensure rendering waits for an incoming user request, preventing unstable prerender errors
  await connection();

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

  const isDemo = isDemoUser(user.email);
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100">
      <AppNavbar userEmail={user.email} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1">
            <span>Candidate Profile</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Academic & Career Profile
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
            Keep your credentials updated to generate tailored applications and enhance AI opportunity matching.
          </p>
        </div>

        {/* Notifications */}
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

        {isDemo && (
          <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80 rounded-xl flex items-start shadow-xs space-x-3">
            <svg
              className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                Mode Démo — Profil partagé en lecture seule
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400/90 mt-0.5 leading-relaxed">
                Ce profil de démonstration est partagé entre les visiteurs. Les modifications sont désactivées pour préserver les données de test.
              </p>
            </div>
          </div>
        )}

        {/* Profile Form */}
        <form action={updateProfile} className="space-y-6">
          {/* Section 1: Personal Details */}
          <div className="bg-white dark:bg-zinc-900 shadow-xs rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-6 py-4.5 border-b border-slate-100 dark:border-zinc-800/80 bg-slate-50/50 dark:bg-zinc-900/50 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Personal Information
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Your identity as it appears in applications and signature blocks.
                </p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 font-mono">
                {user.email}
              </span>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                    First Name
                  </label>
                  <input
                    name="first_name"
                    defaultValue={profile?.first_name || ""}
                    placeholder="e.g. Yassine"
                    className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 shadow-xs"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                    Last Name
                  </label>
                  <input
                    name="last_name"
                    defaultValue={profile?.last_name || ""}
                    placeholder="e.g. Ben Salem"
                    className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 shadow-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                    Country
                  </label>
                  <input
                    name="country"
                    defaultValue={profile?.country || ""}
                    placeholder="e.g. Tunisia, France, Germany"
                    className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 shadow-xs"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                    City
                  </label>
                  <input
                    name="city"
                    defaultValue={profile?.city || ""}
                    placeholder="e.g. Tunis, Sousse, Paris"
                    className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 shadow-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Education & Academic Credentials */}
          <div className="bg-white dark:bg-zinc-900 shadow-xs rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-6 py-4.5 border-b border-slate-100 dark:border-zinc-800/80 bg-slate-50/50 dark:bg-zinc-900/50">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Education & Qualifications
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Use smart autocomplete to select your institution and degree, or type custom entries.
              </p>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <UniversityCombobox
                  name="school"
                  defaultValue={profile?.school || ""}
                  label="University / Institution"
                  placeholder="e.g. INSAT, ENIT, Sorbonne..."
                />
                <DegreeCombobox
                  name="degree"
                  defaultValue={profile?.degree || ""}
                  label="Degree / Qualification"
                  placeholder="e.g. Diplôme d'ingénieur, Master, Licence..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                  Academic Specialty / Major
                </label>
                <input
                  name="specialty"
                  defaultValue={profile?.specialty || ""}
                  placeholder="e.g. Software Engineering, Data Science, Embedded Systems"
                  className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 shadow-xs"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Professional Skills & Languages */}
          <div className="bg-white dark:bg-zinc-900 shadow-xs rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-6 py-4.5 border-b border-slate-100 dark:border-zinc-800/80 bg-slate-50/50 dark:bg-zinc-900/50">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Languages & Communication
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Languages used for personalized application cover letters.
              </p>
            </div>

            <div className="p-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                  Spoken & Written Languages (comma separated)
                </label>
                <input
                  name="languages"
                  defaultValue={profile?.languages?.join(", ") || ""}
                  placeholder="e.g. French, English, Arabic, German"
                  className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 shadow-xs"
                />
                <p className="mt-1.5 text-xs text-slate-500 dark:text-zinc-400">
                  Separate languages with commas. AI drafts will adapt greetings and vocabulary accordingly.
                </p>
              </div>
            </div>
          </div>

          {/* Submit Action */}
          <div className="pt-2 flex items-center justify-end space-x-3">
            <button
              type="submit"
              disabled={isDemo}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-sm rounded-xl transition-all shadow-md shadow-blue-500/20 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {isDemo ? "Modification désactivée (Mode Démo)" : "Save Profile Changes"}
            </button>
          </div>
        </form>
      </main>

      <AppFooter />
    </div>
  );
}
