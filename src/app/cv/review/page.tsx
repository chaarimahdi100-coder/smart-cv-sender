import { connection } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { saveExtractedData } from "../actions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { UniversityCombobox } from "@/components/ui/UniversityCombobox";
import { DegreeCombobox } from "@/components/ui/DegreeCombobox";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { AppFooter } from "@/components/layout/AppFooter";

export const instant = false;

export default async function CVReviewPage(props: { searchParams: Promise<{ resume_id?: string }> }) {
  // Ensure rendering waits for an incoming user request, preventing Date.now() / unstable prerender errors
  await connection();

  const searchParams = await props.searchParams;
  const resumeId = searchParams?.resume_id;

  if (!resumeId) {
    redirect("/cv");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: resume, error } = await supabase
    .from("resumes")
    .select("*")
    .eq("id", resumeId)
    .eq("user_id", user.id)
    .single();

  if (error || !resume) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-zinc-950">
        <AppNavbar userEmail={user.email} />
        <main className="flex-1 max-w-2xl mx-auto px-4 py-16 text-center">
          <div className="p-6 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 rounded-2xl text-rose-700 dark:text-rose-400">
            <h2 className="text-lg font-semibold mb-2">Resume Not Found</h2>
            <p className="text-sm">{error?.message || "We could not find the specified resume file."}</p>
            <Link href="/cv" className="mt-4 inline-block text-xs font-semibold text-blue-600 hover:underline">
              ← Upload a new CV
            </Link>
          </div>
        </main>
        <AppFooter />
      </div>
    );
  }

  // Fetch candidate's current profile for fallback
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const extraction = resume.extracted_data || {};
  const extracted = extraction.data || {};
  const isUnreadable = !!extraction.unreadable;
  const rawTextLength = extraction.rawTextLength || 0;
  const totalPages = extraction.totalPages || 1;

  // Defaults: prefer extracted value if found, fallback to existing profile value
  const defaultFirstName = extracted.first_name || profile?.first_name || "";
  const defaultLastName = extracted.last_name || profile?.last_name || "";
  const defaultSchool = extracted.school || profile?.school || "";
  const defaultDegree = extracted.degree || profile?.degree || "";
  const defaultSpecialty = extracted.specialty || profile?.specialty || "";
  const defaultLanguages = extracted.languages && extracted.languages.length > 0
    ? extracted.languages.join(", ")
    : profile?.languages?.join(", ") || "";

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100">
      <AppNavbar userEmail={user.email} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1">
            <span>Step 2 of 2 • Review Extracted Information</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Verify Your CV Details
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
            Confirm and correct the details parsed from your uploaded PDF before saving them to your application profile.
          </p>
        </div>

        {/* State Banner: Unreadable / Scanned PDF */}
        {isUnreadable ? (
          <div className="mb-6 p-5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80 rounded-2xl flex items-start shadow-xs">
            <svg
              className="h-5 w-5 text-amber-600 dark:text-amber-500 mt-0.5 mr-3.5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-300">
                Scanned or Flattened Document Detected
              </h3>
              <p className="text-xs text-amber-800 dark:text-amber-400 leading-relaxed">
                Your PDF contains scanned images without an embedded text layer. No fields could be automatically extracted. Please complete your academic details using the smart autocompletes below.
              </p>
            </div>
          </div>
        ) : (
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/80 rounded-2xl flex items-start shadow-xs">
            <svg
              className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 mr-3 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-xs text-blue-900 dark:text-blue-300 space-y-0.5">
              <p className="font-semibold">Local Text Extraction Successful</p>
              <p className="text-blue-800 dark:text-blue-400">
                Extracted from {totalPages} page(s) ({rawTextLength} characters read). Fields identified with high confidence are pre-filled below.
              </p>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-zinc-900 shadow-xs rounded-2xl border border-slate-200 dark:border-zinc-800 p-6 sm:p-8">
          <form action={saveExtractedData} className="space-y-6">
            <input type="hidden" name="resume_id" value={resume.id} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                  First Name
                </label>
                <input
                  name="first_name"
                  defaultValue={defaultFirstName}
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
                  defaultValue={defaultLastName}
                  placeholder="e.g. Ben Salem"
                  className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 shadow-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <UniversityCombobox
                name="school"
                defaultValue={defaultSchool}
                label="University / Institution"
                placeholder="Search institution (e.g. INSAT, Sorbonne, Oxford...)"
              />
              <DegreeCombobox
                name="degree"
                defaultValue={defaultDegree}
                label="Degree / Qualification"
                placeholder="Search qualification (e.g. Diplôme d'ingénieur, Master...)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                Specialty / Major
              </label>
              <input
                name="specialty"
                defaultValue={defaultSpecialty}
                placeholder="e.g. Software Engineering"
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 shadow-xs"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                Languages (comma separated)
              </label>
              <input
                name="languages"
                defaultValue={defaultLanguages}
                placeholder="e.g. French, English, Arabic"
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 shadow-xs"
              />
              <p className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
                Languages are used to personalize the phrasing and greetings in generated application drafts.
              </p>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between">
              <Link
                href="/cv"
                className="text-xs font-medium text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200"
              >
                ← Upload a different file
              </Link>
              <button
                type="submit"
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-sm rounded-xl transition-all shadow-md shadow-blue-500/20 cursor-pointer"
              >
                Confirm & Save to Profile
              </button>
            </div>
          </form>
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
