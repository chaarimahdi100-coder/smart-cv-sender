import React from "react";
import Link from "next/link";

export function AppFooter() {
  return (
    <footer className="mt-auto border-t border-slate-200/80 dark:border-zinc-800/80 bg-white/50 dark:bg-zinc-950/50 backdrop-blur-xs py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-zinc-500">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-slate-700 dark:text-zinc-300">Smart CV Sender</span>
          <span>•</span>
          <span>AI-Powered Application & Matching Platform</span>
        </div>

        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="text-slate-600 dark:text-zinc-400">All systems operational</span>
          </div>
          <Link href="/dashboard" className="hover:text-slate-900 dark:hover:text-white transition-colors">
            Dashboard
          </Link>
          <Link href="/opportunities" className="hover:text-slate-900 dark:hover:text-white transition-colors">
            Opportunities
          </Link>
        </div>
      </div>
    </footer>
  );
}
