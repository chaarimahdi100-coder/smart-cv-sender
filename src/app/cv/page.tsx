import { connection } from "next/server";
import { uploadCV } from "./actions";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { AppFooter } from "@/components/layout/AppFooter";

export const instant = false;

export default async function CVUploadPage() {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100">
      <AppNavbar userEmail={user.email} />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1">
            <span>Step 1 of 2 • Document Ingestion</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Upload Your Curriculum Vitae
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
            Upload your latest PDF CV. We securely extract education and qualifications to automate your applications.
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900 shadow-xs rounded-2xl border border-slate-200 dark:border-zinc-800 p-6 sm:p-8">
          <form action={uploadCV} className="space-y-6">
            <div className="border-2 border-dashed border-slate-300 dark:border-zinc-700/80 hover:border-blue-500 dark:hover:border-blue-400 rounded-2xl p-10 sm:p-14 flex flex-col items-center justify-center text-center transition-colors bg-slate-50/50 dark:bg-zinc-950/40">
              <div className="h-16 w-16 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4 shadow-xs">
                <svg
                  className="w-8 h-8"
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

              <p className="text-base font-semibold text-slate-800 dark:text-zinc-200 mb-1">
                Choose a PDF file to upload
              </p>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mb-6 max-w-sm">
                Supported format: <span className="font-semibold text-slate-700 dark:text-zinc-300">PDF</span>. Maximum file size: <span className="font-semibold text-slate-700 dark:text-zinc-300">5 MB</span>.
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
                  Private & Encrypted Storage:
                </span>{" "}
                Your CV is isolated under your authenticated user ID in Supabase Storage with strict Row-Level Security. No other candidate or recruiter can access it without your explicit application approval.
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-zinc-800">
              <span className="text-xs text-slate-500 dark:text-zinc-400">
                Next: Verify extracted education & skills
              </span>
              <button
                type="submit"
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-sm rounded-xl transition-all shadow-md shadow-blue-500/20 cursor-pointer"
              >
                Upload & Continue
              </button>
            </div>
          </form>
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
