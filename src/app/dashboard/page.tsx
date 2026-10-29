import { connection } from "next/server";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { FormattedDate } from "@/components/ui/FormattedDate";

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
    .select("id, status, created_at, companies(name), opportunities(title)")
    .eq("user_id", user?.id)
    .order("created_at", { ascending: false });

  type AppDetails = {
    id: string;
    status: string;
    created_at: string;
    companies: { name: string } | null;
    opportunities: { title: string } | null;
  };
  const applications = applicationsData as unknown as AppDetails[] | null;
  const recentApplications = applications?.slice(0, 6) ?? [];
  const totalApplications = applications?.length ?? 0;
  const pendingApplications =
    applications?.filter((app) => ["draft", "pending_approval"].includes(app.status)).length ?? 0;
  const sentApplications =
    applications?.filter((app) => ["sent", "replied", "closed"].includes(app.status)).length ?? 0;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800";
      case "sent":
      case "replied":
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800";
      case "draft":
      case "pending_approval":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800";
      default:
        return "bg-slate-100 text-slate-800 dark:bg-zinc-800 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700";
    }
  };

  return (
    <div className="space-y-8">
      {/* Header and Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Application Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
            Real-time tracking of candidate outreach, email drafts, and application status.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            href="/cv"
            className="px-4 py-2 text-sm font-medium rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800/80 text-slate-700 dark:text-zinc-200 transition-colors shadow-2xs"
          >
            Upload New CV
          </Link>
          <Link
            href="/opportunities"
            className="px-4 py-2 text-sm font-medium rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm"
          >
            Explore Opportunities
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Total Applications
            </p>
            <p className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
              {totalApplications}
            </p>
            <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">Created candidatures</p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Pending Approval
            </p>
            <p className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
              {pendingApplications}
            </p>
            <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">Awaiting your sign-off</p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Sent & Processed
            </p>
            <p className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
              {sentApplications}
            </p>
            <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">Dispatched to recruiters</p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Recent Applications List */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs overflow-hidden">
        <div className="px-6 py-4.5 border-b border-slate-100 dark:border-zinc-800/80 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Recent Applications
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Track the progress of your customized email drafts.
            </p>
          </div>
          <span className="text-xs text-slate-400 dark:text-zinc-500 font-mono">
            {recentApplications.length} shown
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
                  No applications yet
                </p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mx-auto">
                  Browse open opportunities matching your specialty to generate personalized drafts.
                </p>
              </div>
              <Link
                href="/opportunities"
                className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                Browse Opportunities
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-zinc-800/80">
              {recentApplications.map((app) => (
                <div
                  key={app.id}
                  className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {app.opportunities?.title || "Direct Application"}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 flex items-center space-x-2">
                      <span>{app.companies?.name || "Target Company"}</span>
                      <span>•</span>
                      <FormattedDate date={app.created_at} />
                    </p>
                  </div>

                  <div className="flex items-center space-x-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusBadge(
                        app.status
                      )}`}
                    >
                      {app.status.replace("_", " ")}
                    </span>
                    <Link
                      href={`/applications/${app.id}/draft`}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors shadow-2xs"
                    >
                      View Draft
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
