import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";

export const instant = false;

export default async function LoginPage(props: {
  searchParams: Promise<{ error?: string; success?: string; expired?: string }>;
}) {
  const searchParams = await props.searchParams;
  const error = searchParams?.error;
  const success = searchParams?.success;
  const isExpired = Boolean(searchParams?.expired);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-zinc-950 px-4 py-12">
      <div className="w-full max-w-md p-8 sm:p-10 space-y-6 bg-white dark:bg-zinc-900 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200 dark:border-zinc-800">
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center space-x-2 group mb-2">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 bg-clip-text text-transparent dark:from-blue-400 dark:to-indigo-300 font-extrabold text-xl">
              Smart CV
            </span>
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Welcome back
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Sign in to manage your applications and candidate profile.
          </p>
        </div>

        {success && (
          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-medium text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-center">
            {success}
          </div>
        )}

        {error && (
          <div className="p-3.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-medium text-rose-700 dark:text-rose-300 flex items-center justify-center text-center">
            {error}
          </div>
        )}

        <LoginForm initialExpired={isExpired} />

        <p className="text-center text-xs text-slate-600 dark:text-zinc-400">
          Don&apos;t have an account yet?{" "}
          <Link href="/signup" className="text-blue-600 dark:text-blue-400 hover:underline font-semibold">
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}
