"use client";

import { useState } from "react";
import { getResumeDownloadUrl } from "@/app/cv/actions";

interface CVDownloadButtonProps {
  resumeId: string;
  className?: string;
  label?: string;
}

export function CVDownloadButton({
  resumeId,
  className = "inline-flex items-center space-x-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer",
  label = "Télécharger le CV (PDF)",
}: CVDownloadButtonProps) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDownload = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await getResumeDownloadUrl(resumeId);
      if (res.url) {
        window.open(res.url, "_blank", "noopener,noreferrer");
      } else {
        setErrorMsg(res.error || "Impossible d'accéder au fichier");
      }
    } catch {
      setErrorMsg("Erreur réseau");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        className={className}
        title="Ouvrir le CV dans un nouvel onglet"
      >
        <svg
          className={`h-4 w-4 shrink-0 text-slate-500 dark:text-zinc-400 ${loading ? "animate-spin" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          {loading ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          )}
        </svg>
        <span>{loading ? "Génération du lien..." : label}</span>
      </button>
      {errorMsg && (
        <span className="text-2xs text-rose-600 dark:text-rose-400 mt-1 font-medium">
          {errorMsg}
        </span>
      )}
    </div>
  );
}
