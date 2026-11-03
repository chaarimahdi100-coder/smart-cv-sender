"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { OpportunityMatchBreakdown } from "@/lib/opportunity-matcher";
import {
  seedTunisianOpportunitiesAction,
  toggleOpportunityActiveAction,
  createOpportunityAction,
  getOpportunityApplicantsAction,
  updateApplicantReviewStatusAction,
  type OpportunityApplicant,
} from "./manage-actions";
import {
  runDiscoverySyncAction,
  importManualOpportunityAction,
} from "./discovery-actions";
import { SOURCE_REGISTRY } from "@/lib/discovery/registry";
import { SyncReport } from "@/lib/discovery/types";
import { FormattedDate } from "@/components/ui/FormattedDate";
import { cleanHtmlToPlainText } from "@/lib/text-sanitizer";
import {
  OPPORTUNITIES_PAGE_SIZE,
  paginateOpportunities,
  getPaginationPageNumbers,
  type PaginationResult,
} from "@/lib/opportunity-pagination";

export {
  OPPORTUNITIES_PAGE_SIZE,
  paginateOpportunities,
  getPaginationPageNumbers,
};
export type { PaginationResult };

export interface OpportunityItem {
  id: string;
  title: string;
  description: string;
  location: string;
  type: string;
  domain?: string | null;
  source_url?: string | null;
  canonical_url?: string | null;
  source_provider?: string | null;
  source_platform?: string | null;
  application_url?: string | null;
  updated_at_source?: string | null;
  closed_at?: string | null;
  verification_status?: string | null;
  status_reason?: string | null;
  verification_evidence?: Record<string, unknown> | null;
  date_posted?: string | null;
  valid_through?: string | null;
  last_checked_at?: string | null;
  remote_policy?: string | null;
  is_active?: boolean;
  companies: { name: string; website?: string | null } | null;
  matchBreakdown: OpportunityMatchBreakdown;
  isDemo: boolean;
  isStale?: boolean;
}

interface OpportunityDirectoryClientProps {
  opportunities: OpportunityItem[];
  hasCandidateCv: boolean;
  candidateDegree?: string;
  isManager?: boolean;
}

export function OpportunityDirectoryClient({
  opportunities,
  hasCandidateCv,
  candidateDegree,
  isManager = false,
}: OpportunityDirectoryClientProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<
    "ALL" | "VERIFIED_OPEN" | "TO_RECHECK" | "SPONTANEOUS" | "UNKNOWN" | "CLOSED_EXPIRED"
  >("ALL");
  const [selectedRoleType, setSelectedRoleType] = useState<string>("ALL");
  // Default to LIVE opportunities to strictly separate real feed from demo fixtures
  const [selectedFeed, setSelectedFeed] = useState<"LIVE" | "DEMO" | "ALL">("LIVE");
  const [selectedBreakdown, setSelectedBreakdown] = useState<OpportunityItem | null>(null);

  // Discovery engine state
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryReport, setDiscoveryReport] = useState<SyncReport | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  // Manual URL import state
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Legacy demo seeding state
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  // Manager: Create Opportunity Modal State
  const [isCreateOpportunityOpen, setIsCreateOpportunityOpen] = useState(false);
  const [isCreatingOpportunity, setIsCreatingOpportunity] = useState(false);
  const [createOpportunityError, setCreateOpportunityError] = useState<string | null>(null);

  // Manager: Review Applicants Modal State
  const [isReviewApplicantsOpen, setIsReviewApplicantsOpen] = useState(false);
  const [selectedOpportunityForApplicants, setSelectedOpportunityForApplicants] = useState<OpportunityItem | null>(null);
  const [applicantsList, setApplicantsList] = useState<OpportunityApplicant[]>([]);
  const [isLoadingApplicants, setIsLoadingApplicants] = useState(false);
  const [applicantActionError, setApplicantActionError] = useState<string | null>(null);

  const handleOpenApplicants = async (op: OpportunityItem) => {
    setSelectedOpportunityForApplicants(op);
    setIsReviewApplicantsOpen(true);
    setIsLoadingApplicants(true);
    setApplicantActionError(null);
    try {
      const res = await getOpportunityApplicantsAction(op.id);
      if (res.success && res.applicants) {
        setApplicantsList(res.applicants);
      } else {
        setApplicantActionError(res.error || "Impossible de récupérer les candidatures.");
      }
    } catch (err) {
      setApplicantActionError(err instanceof Error ? err.message : "Erreur de chargement.");
    } finally {
      setIsLoadingApplicants(false);
    }
  };

  const handleUpdateApplicantStatus = async (appId: string, newStatus: string) => {
    try {
      const res = await updateApplicantReviewStatusAction(appId, newStatus);
      if (res.success) {
        setApplicantsList((prev) =>
          prev.map((a) => (a.applicationId === appId ? { ...a, status: newStatus } : a))
        );
      } else {
        alert(res.error || "Erreur lors de la mise à jour");
      }
    } catch {
      alert("Erreur lors de la mise à jour");
    }
  };

  const handleCreateOpportunitySubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsCreatingOpportunity(true);
    setCreateOpportunityError(null);
    try {
      const formData = new FormData(e.currentTarget);
      const res = await createOpportunityAction(formData);
      if (res.success) {
        setIsCreateOpportunityOpen(false);
        window.location.reload();
      } else {
        setCreateOpportunityError(res.error || "Échec de création de l'opportunité.");
      }
    } catch (err) {
      setCreateOpportunityError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setIsCreatingOpportunity(false);
    }
  };

  // Filter opportunities based on search, status & reliability filter, role type, and feed mode
  const filteredOpportunities = useMemo(() => {
    return opportunities.filter((op) => {
      // Feed mode: Strict separation of Live vs Demo
      if (selectedFeed === "LIVE" && op.isDemo) return false;
      if (selectedFeed === "DEMO" && !op.isDemo) return false;

      const isClosedOrExpired =
        op.verification_status === "closed" ||
        op.verification_status === "expired" ||
        op.is_active === false;

      const isSpontaneous =
        op.type?.toUpperCase() === "SPONTANEOUS" ||
        Boolean(op.status_reason?.toLowerCase().includes("spontanée")) ||
        op.title?.toLowerCase().includes("piste") ||
        op.title?.toLowerCase().includes("spontanée");

      const isUnknownSourceOrDate =
        !op.date_posted ||
        !op.source_platform ||
        op.source_platform === "Source d'origine inconnue";

      const isToRecheck =
        !isClosedOrExpired &&
        !isSpontaneous &&
        (op.verification_status === "unverified" || Boolean(op.isStale) || op.verification_status === "likely_open");

      const isVerifiedOpen =
        op.verification_status === "verified_open" &&
        !isClosedOrExpired &&
        !isSpontaneous;

      // Status / Reliability filter
      if (selectedStatusFilter === "CLOSED_EXPIRED") {
        if (!isClosedOrExpired) return false;
      } else if (selectedStatusFilter === "VERIFIED_OPEN") {
        if (!isVerifiedOpen) return false;
      } else if (selectedStatusFilter === "TO_RECHECK") {
        if (!isToRecheck) return false;
      } else if (selectedStatusFilter === "SPONTANEOUS") {
        if (isClosedOrExpired || !isSpontaneous) return false;
      } else if (selectedStatusFilter === "UNKNOWN") {
        if (isClosedOrExpired || !isUnknownSourceOrDate) return false;
      } else {
        // "ALL": Active view strictly excludes closed or expired vacancies
        if (isClosedOrExpired) return false;
      }

      // Role type sub-filter
      if (selectedRoleType !== "ALL") {
        const normType = op.type.toUpperCase();
        if (selectedRoleType === "PFE" && normType !== "PFE") return false;
        if (selectedRoleType === "STAGE" && normType !== "STAGE" && normType !== "INTERNSHIP") return false;
        if (selectedRoleType === "JUNIOR" && normType !== "JUNIOR") return false;
        if (selectedRoleType === "SPONTANEOUS" && !isSpontaneous) return false;
      }

      // Text search
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase();
        const combined = `${op.title} ${op.companies?.name || ""} ${op.location} ${op.domain || ""} ${op.description} ${op.source_platform || ""}`.toLowerCase();
        return combined.includes(q);
      }

      return true;
    });
  }, [opportunities, selectedStatusFilter, selectedRoleType, selectedFeed, searchQuery]);

  // Pagination calculation applied strictly AFTER all filters and search
  const {
    paginatedItems: paginatedOpportunities,
    currentPage: safeCurrentPage,
    totalPages,
    totalResults,
    startIndex,
    endIndex,
  } = useMemo(() => {
    return paginateOpportunities(filteredOpportunities, currentPage, OPPORTUNITIES_PAGE_SIZE);
  }, [filteredOpportunities, currentPage]);

  const liveCount = useMemo(
    () => opportunities.filter((o) => !o.isDemo && o.verification_status !== "closed" && o.verification_status !== "expired").length,
    [opportunities]
  );
  const demoCount = useMemo(
    () => opportunities.filter((o) => o.isDemo && o.verification_status !== "closed" && o.verification_status !== "expired").length,
    [opportunities]
  );

  const statusFilterCounts = useMemo(() => {
    const feedFiltered = opportunities.filter((op) => {
      if (selectedFeed === "LIVE" && op.isDemo) return false;
      if (selectedFeed === "DEMO" && !op.isDemo) return false;
      return true;
    });

    let verifiedOpen = 0;
    let toRecheck = 0;
    let spontaneous = 0;
    let unknownSourceDate = 0;
    let closedExpired = 0;
    let activeAll = 0;

    for (const op of feedFiltered) {
      const isClosedOrExpired =
        op.verification_status === "closed" ||
        op.verification_status === "expired" ||
        op.is_active === false;

      const isSpont =
        op.type?.toUpperCase() === "SPONTANEOUS" ||
        Boolean(op.status_reason?.toLowerCase().includes("spontanée")) ||
        op.title?.toLowerCase().includes("piste") ||
        op.title?.toLowerCase().includes("spontanée");

      const isUnknown =
        !op.date_posted ||
        !op.source_platform ||
        op.source_platform === "Source d'origine inconnue";

      if (isClosedOrExpired) {
        closedExpired++;
      } else {
        activeAll++;
        if (isSpont) {
          spontaneous++;
        } else if (op.verification_status === "verified_open") {
          verifiedOpen++;
        }
        if (!isSpont && (op.verification_status === "unverified" || op.isStale || op.verification_status === "likely_open")) {
          toRecheck++;
        }
        if (isUnknown) {
          unknownSourceDate++;
        }
      }
    }

    return {
      ALL: activeAll,
      VERIFIED_OPEN: verifiedOpen,
      TO_RECHECK: toRecheck,
      SPONTANEOUS: spontaneous,
      UNKNOWN: unknownSourceDate,
      CLOSED_EXPIRED: closedExpired,
    };
  }, [opportunities, selectedFeed]);

  const roleCounts = useMemo(() => {
    const feedFiltered = opportunities.filter((op) => {
      if (selectedFeed === "LIVE" && op.isDemo) return false;
      if (selectedFeed === "DEMO" && !op.isDemo) return false;
      return true;
    });

    const activeFiltered = feedFiltered.filter(
      (o) => o.verification_status !== "closed" && o.verification_status !== "expired" && o.is_active !== false
    );

    return {
      ALL: activeFiltered.length,
      PFE: activeFiltered.filter((o) => o.type.toUpperCase() === "PFE").length,
      STAGE: activeFiltered.filter((o) => {
        const t = o.type.toUpperCase();
        return t === "STAGE" || t === "INTERNSHIP";
      }).length,
      JUNIOR: activeFiltered.filter((o) => o.type.toUpperCase() === "JUNIOR").length,
    };
  }, [opportunities, selectedFeed]);

  const handleRunDiscovery = async () => {
    try {
      setIsDiscovering(true);
      setDiscoveryError(null);
      setDiscoveryReport(null);
      const res = await runDiscoverySyncAction();
      if (res.success && res.report) {
        setDiscoveryReport(res.report);
      } else {
        setDiscoveryError(res.error || "Échec de la découverte");
      }
    } catch (err) {
      setDiscoveryError(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleManualImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importUrl.trim()) return;

    try {
      setIsImporting(true);
      setImportMessage(null);
      setImportError(null);

      const formData = new FormData();
      formData.append("url", importUrl.trim());

      const res = await importManualOpportunityAction(formData);
      if (res.success) {
        setImportMessage(res.message || "Offre importée avec succès !");
        setImportUrl("");
      } else {
        setImportError(res.error || "Impossible d'importer cette URL.");
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setIsImporting(false);
    }
  };

  const handleSeedCatalog = async () => {
    try {
      setIsSeeding(true);
      setSeedMessage(null);
      const res = await seedTunisianOpportunitiesAction();
      if (res.success) {
        setSeedMessage(res.message || "Catalogue synchronisé avec succès.");
      } else {
        setSeedMessage(`Erreur : ${res.error}`);
      }
    } catch (err) {
      setSeedMessage(`Erreur réseau : ${err instanceof Error ? err.message : "Échec"}`);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleToggleActive = async (id: string, currentState: boolean) => {
    if (!confirm(`Voulez-vous ${currentState ? "désactiver" : "activer"} cette offre ?`)) return;
    await toggleOpportunityActiveAction(id, !currentState);
  };

  return (
    <div className="space-y-6">
      {/* CV Guidance Banner if no CV is uploaded */}
      {!hasCandidateCv && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start space-x-3">
            <span className="text-xl">📄</span>
            <div>
              <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                Uploadez votre CV pour activer le score de pertinence factuel
              </h3>
              <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                Chaque offre est comparée à vos compétences, projets et cursus réels. Sans CV, les scores de pertinence restent en attente.
              </p>
            </div>
          </div>
          <Link
            href="/cv"
            className="shrink-0 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-xs"
          >
            Déposer mon CV →
          </Link>
        </div>
      )}

      {/* Discovery & Sources Top Action Bar */}
      <div className="bg-linear-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-2xl p-5 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-[11px] font-bold uppercase tracking-wider text-blue-300">
            <span>Moteur de Découverte Multi-Sources</span>
            <span className="bg-blue-500/30 px-2 py-0.5 rounded-full text-blue-200">En Temps Réel</span>
          </div>
          <h2 className="text-lg font-extrabold mt-0.5">
            Veille Continue & Vérification d&apos;Opportunités
          </h2>
          <p className="text-xs text-blue-200/80 mt-1 max-w-xl">
            Surveillance continue des sites carrières officiels, ATS (Greenhouse, Lever), portails tunisiens et pistes de recherche pour les profils Informatique de Gestion (BIS/BI/Web).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsImportOpen(true)}
            className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl transition-all border border-white/10 flex items-center space-x-1.5 cursor-pointer"
          >
            <span>🔗</span>
            <span>Importer par URL</span>
          </button>
          <button
            type="button"
            onClick={() => setIsDiscoveryOpen(true)}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-xl transition-all shadow-xs flex items-center space-x-1.5 cursor-pointer"
          >
            <span>⚡</span>
            <span>Sources & Synchronisation</span>
          </button>
          {isManager && (
            <button
              type="button"
              onClick={() => setIsCreateOpportunityOpen(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-all shadow-xs flex items-center space-x-1.5 cursor-pointer"
            >
              <span>➕</span>
              <span>Publier une Offre</span>
            </button>
          )}
        </div>
      </div>

      {/* Primary Feed Selector (Strict Separation of Live vs Demo) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-zinc-800 pb-3">
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => {
              setSelectedFeed("LIVE");
              setCurrentPage(1);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              selectedFeed === "LIVE"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-800"
            }`}
          >
            <span>✓ Offres Réelles en Direct</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${selectedFeed === "LIVE" ? "bg-white/20 text-white" : "bg-slate-100 dark:bg-zinc-800 text-slate-600"}`}>
              {liveCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedFeed("DEMO");
              setCurrentPage(1);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              selectedFeed === "DEMO"
                ? "bg-amber-600 text-white shadow-xs"
                : "bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-800"
            }`}
          >
            <span>🧪 Exemples Démo (Simulation)</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${selectedFeed === "DEMO" ? "bg-white/20 text-white" : "bg-slate-100 dark:bg-zinc-800 text-slate-600"}`}>
              {demoCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedFeed("ALL");
              setCurrentPage(1);
            }}
            className={`px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
              selectedFeed === "ALL"
                ? "bg-slate-800 text-white"
                : "text-slate-500 hover:text-slate-800 dark:text-zinc-400"
            }`}
          >
            Tout afficher
          </button>
        </div>

        {selectedFeed === "LIVE" && liveCount === 0 && (
          <div className="text-xs text-slate-500 dark:text-zinc-400">
            Aucune offre en direct chargée. Cliquez sur <strong>Sources & Synchronisation</strong> pour synchroniser le catalogue vérifié.
          </div>
        )}

        {selectedFeed === "DEMO" && isManager && (
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleSeedCatalog}
              disabled={isSeeding}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-950 dark:hover:bg-amber-900 text-amber-800 dark:text-amber-200 transition-colors cursor-pointer"
            >
              {isSeeding ? "Synchronisation..." : "⚡ Recharger les 10 Démo"}
            </button>
            {seedMessage && <span className="text-[11px] text-amber-700">{seedMessage}</span>}
          </div>
        )}
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-2xs">
        {/* Search Input */}
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Rechercher par titre, entreprise, ville, mot-clé (ex: Next.js, Power BI, SQL)..."
            className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
          <svg
            className="absolute left-3.5 top-3 h-4 w-4 text-slate-400 dark:text-zinc-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Status & Reliability Filter Tabs */}
        <div className="flex flex-col gap-2.5 border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-100 dark:border-zinc-800">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "ALL", label: "Toutes les actives" },
              { id: "VERIFIED_OPEN", label: "✓ Vérifiées actives" },
              { id: "TO_RECHECK", label: "⚠️ À revérifier" },
              { id: "SPONTANEOUS", label: "🏢 Candidatures spontanées" },
              { id: "UNKNOWN", label: "❓ Date / Source inconnue" },
              { id: "CLOSED_EXPIRED", label: "⛔ Clôturées / Expirées" },
            ].map((tab) => {
              const count = statusFilterCounts[tab.id as keyof typeof statusFilterCounts] ?? 0;
              const isSelected = selectedStatusFilter === tab.id;
              const isClosedTab = tab.id === "CLOSED_EXPIRED";
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setSelectedStatusFilter(tab.id as typeof selectedStatusFilter);
                    setCurrentPage(1);
                  }}
                  className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isSelected
                      ? isClosedTab
                        ? "bg-slate-700 text-white shadow-2xs"
                        : "bg-blue-600 text-white shadow-2xs"
                      : isClosedTab
                      ? "bg-slate-100 dark:bg-zinc-850 text-slate-500 hover:text-slate-800 dark:text-zinc-400 border border-dashed border-slate-300 dark:border-zinc-700"
                      : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      isSelected
                        ? "bg-white/20 text-white"
                        : "bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-300"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Sub-Filter for Role Type */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs pt-1 border-t border-slate-100 dark:border-zinc-800/60">
            <span className="text-[11px] font-semibold text-slate-400 dark:text-zinc-500 mr-1">Rôle :</span>
            {[
              { id: "ALL", label: "Tous types" },
              { id: "PFE", label: "PFE" },
              { id: "STAGE", label: "Stages d'été" },
              { id: "JUNIOR", label: "Emplois Junior" },
            ].map((role) => {
              const count = roleCounts[role.id as keyof typeof roleCounts] ?? 0;
              const isSelected = selectedRoleType === role.id;
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => {
                    setSelectedRoleType(role.id);
                    setCurrentPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer flex items-center space-x-1 ${
                    isSelected
                      ? "bg-slate-800 text-white dark:bg-zinc-200 dark:text-zinc-900"
                      : "bg-slate-100 dark:bg-zinc-800/80 text-slate-600 dark:text-zinc-400 hover:bg-slate-200"
                  }`}
                >
                  <span>{role.label}</span>
                  <span className="text-[10px] opacity-75">({count})</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Grid of Opportunities */}
      {filteredOpportunities.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-12 text-center text-slate-500 dark:text-zinc-400">
          <div className="max-w-md mx-auto space-y-3">
            <span className="text-3xl">🔍</span>
            <p className="font-semibold text-slate-800 dark:text-zinc-200">
              Aucune offre ne correspond à vos filtres dans ce flux.
            </p>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              {selectedFeed === "LIVE"
                ? "Le flux d'offres en direct n'a pas encore été synchronisé ou aucune offre ne correspond à votre recherche."
                : "Aucune offre de démonstration ne correspond aux critères saisis."}
            </p>
            <div className="flex items-center justify-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedStatusFilter("ALL");
                  setSelectedRoleType("ALL");
                  setSelectedFeed("ALL");
                  setCurrentPage(1);
                }}
                className="px-4 py-2 border border-blue-600 text-xs font-semibold rounded-xl text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors cursor-pointer"
              >
                Réinitialiser les filtres
              </button>
              {selectedFeed === "LIVE" && (
                <button
                  type="button"
                  onClick={() => setIsDiscoveryOpen(true)}
                  className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 transition-colors cursor-pointer"
                >
                  Synchroniser les Sources →
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginatedOpportunities.map((op) => {
            const breakdown = op.matchBreakdown;
            const normType = op.type.toUpperCase();

            const isSpontaneousLead =
              normType === "SPONTANEOUS" ||
              Boolean(op.status_reason?.toLowerCase().includes("spontanée")) ||
              op.title.toLowerCase().includes("piste") ||
              op.title.toLowerCase().includes("spontanée");

            const isManagerRole =
              !isSpontaneousLead &&
              (normType === "MANAGER" ||
                normType === "EXECUTIVE" ||
                breakdown.roleSeniority === "manager" ||
                breakdown.roleSeniority === "executive");

            const isSeniorRole =
              !isSpontaneousLead &&
              (normType === "SENIOR" || breakdown.roleSeniority === "senior");

            const typeBadgeColor = isSpontaneousLead
              ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800"
              : normType === "PFE" || breakdown.roleSeniority === "pfe"
              ? "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200 dark:border-purple-800"
              : normType === "STAGE" || normType === "INTERNSHIP" || breakdown.roleSeniority === "intern"
              ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800"
              : isManagerRole
              ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-800"
              : isSeniorRole
              ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800"
              : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800";

            const typeLabel = isSpontaneousLead
              ? "Candidature Spontanée"
              : normType === "PFE" || breakdown.roleSeniority === "pfe"
              ? "PFE"
              : normType === "STAGE" || normType === "INTERNSHIP" || breakdown.roleSeniority === "intern"
              ? "Stage d'été"
              : isManagerRole
              ? "Poste Manager"
              : isSeniorRole
              ? "Poste Senior"
              : "Emploi Junior";

            const scoreBadgeColor =
              breakdown.seniorityMismatch
                ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-300 dark:border-amber-700"
                : breakdown.relevanceLevel === "high"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                : breakdown.relevanceLevel === "good"
                ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                : breakdown.relevanceLevel === "moderate"
                ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                : "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400 border-slate-200 dark:border-zinc-700";

            // Verification status badge with explicit confidence levels
            const statusBadge =
              op.verification_status === "verified_open" ? (
                <span
                  title="Offre vérifiée active auprès de l'employeur (flux ATS officiel). Niveau de confiance : Élevé."
                  className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"
                >
                  <span>✓ Vérifiée Active (Confiance : Élevée)</span>
                </span>
              ) : op.verification_status === "likely_open" ? (
                <span
                  title="Offre accessible et en cours de diffusion sur le web (employeur corroboré). Niveau de confiance : Modéré."
                  className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60"
                >
                  <span>Plausible / En Diffusion (Confiance : Modérée)</span>
                </span>
              ) : op.verification_status === "expired" ? (
                <span
                  title="Date limite de candidature échue."
                  className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-50 text-rose-800 dark:bg-rose-950/30 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60"
                >
                  <span>⏰ Date Échue</span>
                </span>
              ) : op.verification_status === "closed" ? (
                <span
                  title="Poste pourvu ou candidatures closes."
                  className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700"
                >
                  <span>⛔ Clôturée</span>
                </span>
              ) : op.verification_status === "broken_source" ? (
                <span
                  title="Lien source inaccessible (code HTTP d'erreur ou page introuvable)."
                  className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300 border border-red-200 dark:border-red-800/60"
                >
                  <span>⚠️ Lien Inaccessible</span>
                </span>
              ) : isSpontaneousLead ? (
                <span
                  title="Candidature spontanée : formulaire carrières général de l'employeur sans annonce de poste spécifique confirmée."
                  className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-50 text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60"
                >
                  <span>🏢 Candidature spontanée — aucune offre spécifique confirmée</span>
                </span>
              ) : (
                <span
                  title={op.status_reason || "Offre non vérifiée : source externe ou informations à confirmer auprès de l'employeur. Niveau de confiance : Faible."}
                  className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60"
                >
                  <span>⚠️ Statut à revérifier (Confiance : Faible)</span>
                </span>
              );

            return (
              <div
                key={op.id}
                className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xs hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700/80 rounded-2xl overflow-hidden flex flex-col transition-all duration-200"
              >
                <div className="p-6 flex-1 flex flex-col">
                  {/* Card Header: Type Badge & Match Score Button */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${typeBadgeColor}`}>
                        {typeLabel}
                      </span>
                      {breakdown.seniorityMismatch && (
                        <span
                          title={breakdown.seniorityWarning || "Écart de séniorité significatif détecté par rapport au profil"}
                          className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700"
                        >
                          <span>⚠️ Écart Séniorité</span>
                        </span>
                      )}
                    </div>

                    {/* Deterministic Relevance Score Pill */}
                    {hasCandidateCv && breakdown.score > 0 ? (
                      <button
                        type="button"
                        onClick={() => setSelectedBreakdown(op)}
                        title="Score de pertinence technique calculé à partir de votre CV (ne constitue pas une probabilité d'embauche). Cliquez pour voir le détail."
                        className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold border transition-transform hover:scale-105 cursor-pointer ${scoreBadgeColor}`}
                      >
                        <span>{breakdown.score}%</span>
                        <span className="text-[10px] font-normal opacity-75">Pertinence</span>
                        <span className="text-[10px]">ℹ️</span>
                      </button>
                    ) : (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700"
                        title="Uploadez votre CV pour calculer ce score"
                      >
                        CV Requis
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h3 className="text-base font-bold text-slate-900 dark:text-white line-clamp-2 mb-1.5">
                    {op.title}
                  </h3>

                  {/* Company & Location & Website */}
                  <div className="flex items-center space-x-2 text-xs font-medium text-slate-500 dark:text-zinc-400 mb-2.5">
                    <span className="text-slate-800 dark:text-zinc-200 font-semibold">{op.companies?.name || "Entreprise"}</span>
                    <span>•</span>
                    <span className="truncate">{op.location}</span>
                    {op.companies?.website && (
                      <>
                        <span>•</span>
                        <a
                          href={op.companies.website}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                          title="Visiter le site officiel de l'employeur"
                        >
                          🌐 Site
                        </a>
                      </>
                    )}
                  </div>

                  {/* Verification Status Pill, Provider & Remote Policy */}
                  {(() => {
                    const displaySourcePlatform =
                      op.source_platform ||
                      (op.verification_evidence?.sourcePlatformName as string) ||
                      breakdown.provenance?.sourcePlatformName ||
                      "Source d'origine inconnue";

                    return (
                      <>
                        <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
                          {statusBadge}
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 font-medium">
                            Source : {displaySourcePlatform}
                          </span>
                          {op.isDemo && (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-50 text-purple-800 dark:bg-purple-950/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60">
                              <span>🧪 Exemple Simulation</span>
                            </span>
                          )}
                          {op.remote_policy && op.remote_policy !== "unknown" && (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300">
                              {op.remote_policy === "remote" ? "Télétravail" : op.remote_policy === "hybrid" ? "Hybride" : "Sur site"}
                            </span>
                          )}
                        </div>

                        {/* Complete Lifecycle Dates: Publication, Deadline & Verification */}
                        <div className="mb-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-100 dark:border-zinc-800/60 text-[11px] text-slate-500 dark:text-zinc-400 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 dark:text-zinc-500">Publiée le :</span>
                            {op.date_posted ? (
                              <span className="font-semibold text-slate-700 dark:text-zinc-300">
                                <FormattedDate date={op.date_posted} />
                              </span>
                            ) : (
                              <span className="italic text-slate-400 dark:text-zinc-500">Inconnue</span>
                            )}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 dark:text-zinc-500">Date limite :</span>
                            {op.valid_through ? (
                              <span className="font-semibold text-slate-700 dark:text-zinc-300">
                                <FormattedDate date={op.valid_through} />
                              </span>
                            ) : (
                              <span className="italic text-slate-400 dark:text-zinc-500">Non précisée</span>
                            )}
                          </div>
                          {op.last_checked_at && (
                            <div className="flex items-center justify-between pt-1 border-t border-slate-200/50 dark:border-zinc-800/50 text-[10px]">
                              <span className="text-slate-400 dark:text-zinc-500">Dernière vérification :</span>
                              <span className="text-slate-600 dark:text-zinc-400 font-medium">
                                <FormattedDate date={op.last_checked_at} />
                              </span>
                            </div>
                          )}
                          {!op.date_posted && (
                            <div className="pt-1 border-t border-slate-200/40 dark:border-zinc-800/40 text-[10px] text-amber-700 dark:text-amber-400">
                              ⚠️ Date d&apos;origine non établie : vérifier disponibilité avant candidature.
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}

                  {/* Stale Warning Banner if older than threshold */}
                  {op.isStale && (
                    <div className="mb-3 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-[10px] text-amber-800 dark:text-amber-300">
                      ⚠️ Offre ancienne (plus de 90/120 jours). Statut à revérifier auprès de l&apos;employeur.
                    </div>
                  )}

                  {/* Description */}
                  <p className="text-xs text-slate-600 dark:text-zinc-400 line-clamp-3 leading-relaxed flex-1">
                    {cleanHtmlToPlainText(op.description)}
                  </p>

                  {/* Skills Preview */}
                  {breakdown.matchedSkills.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800/60 flex flex-wrap gap-1">
                      {breakdown.matchedSkills.slice(0, 4).map((skill) => (
                        <span
                          key={skill}
                          className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300"
                        >
                          ✓ {skill}
                        </span>
                      ))}
                      {breakdown.matchedSkills.length > 4 && (
                        <span className="px-1.5 py-0.5 text-[10px] text-slate-400">
                          +{breakdown.matchedSkills.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Footer: CTA and Manager Actions */}
                <div className="px-6 py-4 bg-slate-50/60 dark:bg-zinc-950/60 border-t border-slate-100 dark:border-zinc-800/80 flex items-center justify-between gap-2">
                  {isManager && (
                    <div className="flex items-center space-x-3">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(op.id, op.is_active !== false)}
                        className="text-[11px] text-rose-600 hover:text-rose-700 dark:text-rose-400 font-medium cursor-pointer"
                      >
                        {op.is_active !== false ? "Désactiver" : "Activer"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenApplicants(op)}
                        className="text-[11px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 underline cursor-pointer"
                      >
                        Candidatures
                      </button>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {op.source_url && (
                      <a
                        href={op.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-slate-500 hover:text-blue-600 dark:text-zinc-400 flex items-center space-x-1 hover:underline"
                        title={`Lien vers l'annonce originale (${op.source_platform || "Source"})`}
                      >
                        <span>Annonce originale ({op.source_platform || (op.verification_evidence?.sourcePlatformName as string) || "Source"}) ↗</span>
                      </a>
                    )}
                    {op.application_url && op.application_url !== op.source_url && (
                      <a
                        href={op.application_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-blue-600 hover:underline dark:text-blue-400 font-medium flex items-center space-x-1"
                        title="Lien vers le portail officiel de candidature de l'employeur"
                      >
                        <span>Portail officiel de candidature ↗</span>
                      </a>
                    )}
                  </div>
                  {op.verification_status === "closed" ? (
                    <Link
                      href={`/opportunities/${op.id}/apply`}
                      className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-300 dark:hover:bg-zinc-700 transition-colors shadow-xs"
                    >
                      Offre Clôturée (Consulter) →
                    </Link>
                  ) : op.verification_status === "expired" ? (
                    <Link
                      href={`/opportunities/${op.id}/apply`}
                      className="px-4 py-2 text-xs font-semibold rounded-lg bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 hover:bg-rose-200 transition-colors shadow-xs"
                    >
                      Date Échue (Consulter) →
                    </Link>
                  ) : isSpontaneousLead ? (
                    <Link
                      href={`/opportunities/${op.id}/apply`}
                      className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-xs"
                    >
                      Candidature Spontanée →
                    </Link>
                  ) : (
                    <Link
                      href={`/opportunities/${op.id}/apply`}
                      className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-xs"
                    >
                      Postuler & Brouillon →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Accessible Pagination Navigation */}
        {totalResults > 0 && (
          <nav
            aria-label="Pagination du répertoire des opportunités"
            className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-2xs"
          >
            <div className="text-xs text-slate-600 dark:text-zinc-400">
              Affichage de <span className="font-semibold text-slate-900 dark:text-zinc-100">{startIndex + 1}</span> à{" "}
              <span className="font-semibold text-slate-900 dark:text-zinc-100">{endIndex}</span> sur{" "}
              <span className="font-semibold text-slate-900 dark:text-zinc-100">{totalResults}</span> opportunités
              <span className="ml-2 text-slate-400 dark:text-zinc-500">
                (Page {safeCurrentPage} sur {totalPages})
              </span>
            </div>

            <div className="flex items-center space-x-1.5 sm:space-x-2">
              <button
                type="button"
                onClick={() => {
                  setCurrentPage((prev) => Math.max(1, prev - 1));
                  if (typeof window !== "undefined") {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
                disabled={safeCurrentPage <= 1}
                aria-label="Page précédente"
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all flex items-center space-x-1 ${
                  safeCurrentPage <= 1
                    ? "opacity-40 cursor-not-allowed border-slate-200 dark:border-zinc-800 text-slate-400 dark:text-zinc-500"
                    : "border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer"
                }`}
              >
                <span>← Précédent</span>
              </button>

              <div className="flex items-center space-x-1">
                {getPaginationPageNumbers(safeCurrentPage, totalPages).map((p, idx) =>
                  p === "..." ? (
                    <span key={`dots-${idx}`} className="px-2 py-1 text-xs text-slate-400 dark:text-zinc-500">
                      …
                    </span>
                  ) : (
                    <button
                      key={`page-${p}`}
                      type="button"
                      onClick={() => {
                        setCurrentPage(Number(p));
                        if (typeof window !== "undefined") {
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }
                      }}
                      aria-label={`Aller à la page ${p}`}
                      aria-current={p === safeCurrentPage ? "page" : undefined}
                      className={`min-w-8 h-8 px-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center justify-center ${
                        p === safeCurrentPage
                          ? "bg-blue-600 text-white font-bold shadow-xs"
                          : "text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-transparent"
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setCurrentPage((prev) => Math.min(totalPages, prev + 1));
                  if (typeof window !== "undefined") {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
                disabled={safeCurrentPage >= totalPages}
                aria-label="Page suivante"
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all flex items-center space-x-1 ${
                  safeCurrentPage >= totalPages
                    ? "opacity-40 cursor-not-allowed border-slate-200 dark:border-zinc-800 text-slate-400 dark:text-zinc-500"
                    : "border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer"
                }`}
              >
                <span>Suivant →</span>
              </button>
            </div>
          </nav>
        )}
      </>
    )}

      {/* Discovery & Sources Registry Modal */}
      {isDiscoveryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                  Moteur de Découverte Multi-Sources
                </span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                  Registre des Sources & Synchronisation
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Surveillance continue des employeurs technologiques, plateformes ATS et requêtes de veille.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDiscoveryOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 text-lg p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Sync Report Banner if triggered */}
            {discoveryReport && (
              <div
                className={`p-4 rounded-xl border text-xs space-y-2 ${
                  discoveryReport.persistedCount > 0
                    ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
                    : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200"
                }`}
              >
                <div className="font-bold flex items-center justify-between">
                  <span>
                    {discoveryReport.persistedCount > 0
                      ? `✓ Synchronisation complétée en ${discoveryReport.durationMs} ms !`
                      : `ℹ Synchronisation achevée en ${discoveryReport.durationMs} ms (0 enregistrée)`}
                  </span>
                  {discoveryReport.persistedCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 text-[10px] font-semibold">
                      +{discoveryReport.persistedCount} offres
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1">
                  <div className="bg-white/60 dark:bg-zinc-900/60 p-2 rounded-lg">
                    <span className="block text-slate-500">Pistes explorées :</span>
                    <strong className="text-sm">{discoveryReport.totalLeadsDiscovered}</strong>
                  </div>
                  <div className="bg-white/60 dark:bg-zinc-900/60 p-2 rounded-lg">
                    <span className="block text-slate-500">Vérifiées actives :</span>
                    <strong className="text-sm text-emerald-600">{discoveryReport.verifiedOpenCount}</strong>
                  </div>
                  <div className="bg-white/60 dark:bg-zinc-900/60 p-2 rounded-lg">
                    <span className="block text-slate-500">Doublons filtrés :</span>
                    <strong className="text-sm">{discoveryReport.duplicateCount}</strong>
                  </div>
                  <div className="bg-white/60 dark:bg-zinc-900/60 p-2 rounded-lg">
                    <span className="block text-slate-500">Enregistrées :</span>
                    <strong className="text-sm text-blue-600">{discoveryReport.persistedCount}</strong>
                  </div>
                </div>

                {discoveryReport.errors && discoveryReport.errors.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-amber-200/60 dark:border-amber-800/60 text-[11px] leading-relaxed">
                    <span className="font-semibold">⚠️ Notes & Diagnostics :</span>
                    <p className="mt-0.5 text-amber-900 dark:text-amber-200">{discoveryReport.errors[0]}</p>
                  </div>
                )}
              </div>
            )}

            {discoveryError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs rounded-xl">
                {discoveryError}
              </div>
            )}

            {/* Registered Providers List */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-800 dark:text-zinc-200 uppercase tracking-wide">
                Fournisseurs & Portails Actifs
              </h4>
              <div className="space-y-2">
                {SOURCE_REGISTRY.map((src) => (
                  <div
                    key={src.id}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-slate-900 dark:text-white">{src.name}</span>
                        {src.isConfigured ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            Connecté
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            Import Manuel
                          </span>
                        )}
                      </div>
                      <p className="text-slate-600 dark:text-zinc-400 mt-1 text-[11px] leading-relaxed">
                        {src.description}
                      </p>
                      <div className="text-[10px] text-slate-400 mt-1 flex items-center space-x-3">
                        <span>Cible : {src.targetAudience}</span>
                        <span>•</span>
                        <span>Limite : {src.rateLimitPerMinute} req/min</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 dark:border-zinc-800">
              <span className="text-[11px] text-slate-500">
                La détection exclut strictement les arnaques et doublons cross-portails.
              </span>
              <button
                type="button"
                onClick={handleRunDiscovery}
                disabled={isDiscovering}
                className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer flex items-center justify-center space-x-2"
              >
                <span>⚡</span>
                <span>{isDiscovering ? "Recherche et vérification..." : "Lancer la Découverte & Vérification"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual URL Importer Modal */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                  Importateur Universel d&apos;Offre
                </span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                  Importer une Offre par Lien Web
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Collez le lien d&apos;une offre (LinkedIn, site carrière, portail tunisien) pour extraction et évaluation instantanée.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsImportOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 text-lg p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleManualImport} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  URL de l&apos;offre d&apos;emploi ou de stage :
                </label>
                <input
                  type="url"
                  required
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="https://www.linkedin.com/jobs/view/... ou site carrière"
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {importMessage && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs rounded-xl">
                  {importMessage}
                </div>
              )}

              {importError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs rounded-xl">
                  {importError}
                </div>
              )}

              <div className="p-3 bg-slate-50 dark:bg-zinc-950/60 rounded-xl border border-slate-200 dark:border-zinc-800 text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
                🛡️ <strong>Sécurité & Intégrité :</strong> L&apos;importateur extrait les métadonnées (Schema.org / JSON-LD / balises de contenu), neutralise tout contenu suspect ou tentative d&apos;injection et vérifie l&apos;absence de signaux de clôture.
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsImportOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer"
                >
                  Fermer
                </button>
                <button
                  type="submit"
                  disabled={isImporting || !importUrl.trim()}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer flex items-center space-x-1.5"
                >
                  <span>{isImporting ? "Extraction & Vérification..." : "Importer et Vérifier"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Relevance Score Detail Modal */}
      {selectedBreakdown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                  Détail du Score de Pertinence Factuel
                </span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                  {selectedBreakdown.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  {selectedBreakdown.companies?.name} • {selectedBreakdown.location}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBreakdown(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 text-lg p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Score Pill and Level */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-950/80 border border-slate-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
                  {selectedBreakdown.matchBreakdown.score}%
                </span>
                <span className="ml-2 text-xs font-semibold text-slate-600 dark:text-zinc-300">
                  {selectedBreakdown.matchBreakdown.relevanceLabel}
                </span>
              </div>
              <span className="text-xs text-slate-400">Basé sur votre CV vérifié</span>
            </div>

            {/* Factual Technical Fit vs Hiring Probability Notice */}
            <div className="p-3 bg-slate-100/80 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/80 rounded-xl text-[11px] text-slate-700 dark:text-zinc-300 leading-relaxed">
              ℹ️ <strong>Pertinence technique ≠ Probabilité d&apos;embauche :</strong> Ce score évalue factuellement la correspondance entre vos compétences, cursus et projets réels et les exigences de l&apos;offre. Il ne mesure ni ne prédit la probabilité d&apos;être recruté.
            </div>

            {/* Spontaneous Lead Disclaimer in Modal */}
            {(selectedBreakdown.verification_status === "unverified" ||
              selectedBreakdown.title.toLowerCase().includes("piste")) && (
              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 rounded-xl text-[11px] text-indigo-900 dark:text-indigo-300 leading-relaxed">
                🏢 <strong>Piste / Candidature Spontanée :</strong> Ce score mesure l&apos;adéquation technique de vos compétences avec l&apos;écosystème de l&apos;entreprise. Il ne constitue pas une confirmation d&apos;offre de stage ouverte ni une probabilité d&apos;embauche.
              </div>
            )}

            {/* Seniority Evaluation & Comparison */}
            <div className="p-3 rounded-xl bg-slate-100/70 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-zinc-400">Niveau ciblé par le poste :</span>
                <span className="font-semibold text-slate-800 dark:text-zinc-200">
                  {selectedBreakdown.matchBreakdown.roleSeniorityLabel || "Non spécifié"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-zinc-400">Niveau documenté du candidat :</span>
                <span className="font-semibold text-slate-800 dark:text-zinc-200">
                  {selectedBreakdown.matchBreakdown.candidateSeniorityLabel || "Étudiant / En formation"}
                </span>
              </div>
            </div>

            {/* Seniority Warning if Mismatch */}
            {selectedBreakdown.matchBreakdown.seniorityMismatch && selectedBreakdown.matchBreakdown.seniorityWarning && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/80 rounded-xl text-xs text-amber-900 dark:text-amber-200 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                  <span>⚠️ Attention — Écart de séniorité & d&apos;expérience</span>
                </div>
                <p className="leading-relaxed">
                  {selectedBreakdown.matchBreakdown.seniorityWarning}
                </p>
              </div>
            )}

            {/* Availability & Session Alignment */}
            <div className="p-3 rounded-xl bg-slate-100/70 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-zinc-400">Disponibilité indiquée dans votre CV :</span>
                <span className="font-semibold text-slate-800 dark:text-zinc-200">
                  {selectedBreakdown.matchBreakdown.candidateAvailability || "Non précisée"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-zinc-400">Session / Période ciblée :</span>
                <span className="font-semibold text-slate-800 dark:text-zinc-200">
                  {selectedBreakdown.matchBreakdown.opportunityTargetPeriod || "Non précisée"}
                </span>
              </div>
            </div>

            {/* Calendar Availability Conflict Warning */}
            {selectedBreakdown.matchBreakdown.availabilityConflict && selectedBreakdown.matchBreakdown.availabilityWarning && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/80 rounded-xl text-xs text-amber-900 dark:text-amber-200 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                  <span>⚠️ Conflit de calendrier & de session</span>
                </div>
                <p className="leading-relaxed">
                  {selectedBreakdown.matchBreakdown.availabilityWarning}
                </p>
              </div>
            )}

            {/* Unsupported Requirements */}
            {selectedBreakdown.matchBreakdown.unsupportedRequirements && selectedBreakdown.matchBreakdown.unsupportedRequirements.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-rose-700 dark:text-rose-400 mb-1.5">
                  Prérequis non justifiés par le profil (Écart majeur) :
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {selectedBreakdown.matchBreakdown.unsupportedRequirements.map((req) => (
                    <span
                      key={req}
                      className="px-2.5 py-1 text-xs font-medium rounded-lg bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                    >
                      ✗ {req}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Unknown Requirements */}
            {selectedBreakdown.matchBreakdown.unknownRequirements && selectedBreakdown.matchBreakdown.unknownRequirements.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Exigences du poste non documentées dans le CV :
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {selectedBreakdown.matchBreakdown.unknownRequirements.map((req) => (
                    <span
                      key={req}
                      className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400"
                    >
                      ? {req}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Matched Skills */}
            <div>
              <h4 className="text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                Compétences vérifiées correspondantes :
              </h4>
              {selectedBreakdown.matchBreakdown.matchedSkills.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {selectedBreakdown.matchBreakdown.matchedSkills.map((s) => (
                    <span
                      key={s}
                      className="px-2.5 py-1 text-xs font-medium rounded-lg bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                    >
                      ✓ {s}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">Aucune compétence directement commune détectée.</p>
              )}
            </div>

            {/* Missing Skills */}
            {selectedBreakdown.matchBreakdown.missingSkills.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Compétences mentionnées dans l&apos;offre non détectées :
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {selectedBreakdown.matchBreakdown.missingSkills.map((s) => (
                    <span
                      key={s}
                      className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400"
                    >
                      • {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Matched Projects */}
            {selectedBreakdown.matchBreakdown.matchedProjects.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Projets réels du CV pertinents pour ce poste :
                </h4>
                <ul className="text-xs text-slate-600 dark:text-zinc-400 list-disc list-inside space-y-1">
                  {selectedBreakdown.matchBreakdown.matchedProjects.map((p) => (
                    <li key={p} className="font-medium text-slate-800 dark:text-zinc-200">{p}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Education Verified */}
            <div>
              <h4 className="text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Formation prise en compte :
              </h4>
              <p className="text-xs font-medium text-slate-800 dark:text-zinc-200 bg-slate-100 dark:bg-zinc-800 p-2 rounded-lg">
                🎓 {selectedBreakdown.matchBreakdown.verifiedDegreeName || candidateDegree || "Cursus en cours"}
              </p>
            </div>

            {/* Provenance & Source Transparency */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800 text-xs space-y-2">
              <span className="text-slate-500 dark:text-zinc-400 block text-[11px] font-semibold uppercase tracking-wider">
                Traçabilité & Provenance de l&apos;Annonce
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                <div>
                  <span className="text-slate-500 dark:text-zinc-400 text-[10px] uppercase font-semibold block">Plateforme d&apos;origine</span>
                  <span className="font-semibold text-slate-800 dark:text-zinc-200">
                    {selectedBreakdown.source_platform ||
                      (selectedBreakdown.verification_evidence?.sourcePlatformName as string) ||
                      selectedBreakdown.matchBreakdown.provenance?.sourcePlatformName ||
                      "Source d'origine inconnue"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-zinc-400 text-[10px] uppercase font-semibold block">Statut & Confiance</span>
                  <span className="font-semibold text-slate-800 dark:text-zinc-200">
                    {selectedBreakdown.verification_status === "verified_open"
                      ? "Vérifiée Active (Confiance : Élevée)"
                      : selectedBreakdown.verification_status === "likely_open"
                      ? "Plausible / En Diffusion (Confiance : Modérée)"
                      : selectedBreakdown.verification_status === "closed"
                      ? "Clôturée (Fermée)"
                      : selectedBreakdown.verification_status === "expired"
                      ? "Date Échue (Expirée)"
                      : selectedBreakdown.type === "SPONTANEOUS"
                      ? "Candidature spontanée (Piste entreprise)"
                      : "Statut à revérifier (Confiance : Faible)"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-zinc-400 text-[10px] uppercase font-semibold block">Publié le</span>
                  <span className="font-semibold text-slate-800 dark:text-zinc-200">
                    {selectedBreakdown.date_posted ? (
                      <FormattedDate date={selectedBreakdown.date_posted} />
                    ) : (
                      <span className="italic text-slate-400 dark:text-zinc-500">Inconnue</span>
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-zinc-400 text-[10px] uppercase font-semibold block">Date limite</span>
                  <span className="font-semibold text-slate-800 dark:text-zinc-200">
                    {selectedBreakdown.valid_through ? (
                      <FormattedDate date={selectedBreakdown.valid_through} />
                    ) : (
                      <span className="italic text-slate-400 dark:text-zinc-500">Non précisée</span>
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-zinc-400 text-[10px] uppercase font-semibold block">Dernière vérification</span>
                  <span className="font-semibold text-slate-800 dark:text-zinc-200">
                    {selectedBreakdown.last_checked_at ? (
                      <FormattedDate date={selectedBreakdown.last_checked_at} />
                    ) : (
                      "Récemment"
                    )}
                  </span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-200/60 dark:border-zinc-800/60 space-y-1 text-xs">
                {selectedBreakdown.source_url && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-zinc-400">Annonce originale vérifiée :</span>
                    <a
                      href={selectedBreakdown.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 underline hover:no-underline truncate max-w-[240px]"
                    >
                      Consulter l&apos;annonce ↗
                    </a>
                  </div>
                )}
                {selectedBreakdown.application_url && selectedBreakdown.application_url !== selectedBreakdown.source_url && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-zinc-400">Portail de candidature direct :</span>
                    <a
                      href={selectedBreakdown.application_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 underline hover:no-underline truncate max-w-[240px]"
                    >
                      Portail officiel ↗
                    </a>
                  </div>
                )}
              </div>
              {!selectedBreakdown.date_posted && (
                <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-[11px] text-amber-800 dark:text-amber-300">
                  ⚠️ <strong>Date d&apos;origine non établie :</strong> l&apos;ouverture effective du recrutement doit être confirmée directement auprès de l&apos;employeur avant tout envoi de candidature.
                </div>
              )}
            </div>

            {/* Explicit Disclaimer */}
            <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/60 rounded-xl text-[11px] text-blue-800 dark:text-blue-300 leading-relaxed">
              <strong>Transparence & Déontologie :</strong> {selectedBreakdown.matchBreakdown.explanation}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedBreakdown(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 transition-colors cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 1: Publier une Opportunité (Manager) */}
      {isCreateOpportunityOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-xl border border-slate-200 dark:border-zinc-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Publier une Nouvelle Opportunité
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Ajoutez une offre de stage PFE ou d&apos;emploi junior au répertoire
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpportunityOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 text-lg leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            {createOpportunityError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-400">
                {createOpportunityError}
              </div>
            )}

            <form onSubmit={handleCreateOpportunitySubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Intitulé du poste *
                </label>
                <input
                  type="text"
                  name="title"
                  required
                  placeholder="ex: Stage PFE Développeur Full-Stack React & Node.js"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                    Entreprise *
                  </label>
                  <input
                    type="text"
                    name="company_name"
                    required
                    placeholder="ex: InstaDeep, Expensya"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                    Type de contrat *
                  </label>
                  <select
                    name="type"
                    required
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white"
                  >
                    <option value="PFE">Stage PFE</option>
                    <option value="STAGE">Stage d&apos;été</option>
                    <option value="JUNIOR">Emploi Junior / CDI</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                    Localisation *
                  </label>
                  <input
                    type="text"
                    name="location"
                    required
                    placeholder="ex: Tunis (Lac 2), Remote"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                    Email Recruteur / Contact *
                  </label>
                  <input
                    type="email"
                    name="contact_email"
                    required
                    placeholder="ex: rh@entreprise.tn"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Site Web ou Lien Officiel
                </label>
                <input
                  type="url"
                  name="source_url"
                  placeholder="https://..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Description du poste & Profil recherché *
                </label>
                <textarea
                  name="description"
                  required
                  rows={4}
                  placeholder="Détaillez les missions, la stack technique et les compétences attendues..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpportunityOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isCreatingOpportunity}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isCreatingOpportunity ? "Publication..." : "Publier l'Offre"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Gestion des Candidatures Reçues (Manager) */}
      {isReviewApplicantsOpen && selectedOpportunityForApplicants && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 shadow-xl border border-slate-200 dark:border-zinc-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Candidatures Reçues
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  {selectedOpportunityForApplicants.title} • {selectedOpportunityForApplicants.companies?.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsReviewApplicantsOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 text-lg leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            {applicantActionError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-400">
                {applicantActionError}
              </div>
            )}

            {isLoadingApplicants ? (
              <div className="py-12 text-center text-xs text-slate-500 dark:text-zinc-400">
                Chargement des candidatures...
              </div>
            ) : applicantsList.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <span className="text-3xl">📭</span>
                <p className="text-sm font-semibold text-slate-800 dark:text-zinc-200">
                  Aucune candidature reçue
                </p>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Les candidatures soumises par les candidats s&apos;afficheront ici avec accès direct à leur CV.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                {applicantsList.map((applicant) => (
                  <div key={applicant.applicationId} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {applicant.candidateName}
                        </span>
                        <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300">
                          {applicant.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                        🎓 {applicant.school || "Université"} {applicant.degree ? "• " + applicant.degree : ""} {applicant.specialty ? "(" + applicant.specialty + ")" : ""}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-zinc-500">
                        Postulé le {new Date(applicant.appliedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                      </p>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      {applicant.resumeDownloadUrl ? (
                        <a
                          href={applicant.resumeDownloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition-colors cursor-pointer"
                        >
                          📄 Voir le CV
                        </a>
                      ) : (
                        <span className="text-[10px] text-slate-400 dark:text-zinc-500 italic">
                          CV non disponible
                        </span>
                      )}

                      <select
                        value={applicant.status}
                        onChange={(e) => handleUpdateApplicantStatus(applicant.applicationId, e.target.value)}
                        className="text-xs px-2.5 py-1 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg text-slate-800 dark:text-zinc-200 cursor-pointer"
                      >
                        <option value="draft">Brouillon</option>
                        <option value="approved">En Examen / Validée</option>
                        <option value="sent">Envoyée / Contactée</option>
                        <option value="replied">Réponse Reçue</option>
                        <option value="closed">Clôturée</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 flex justify-end">
              <button
                type="button"
                onClick={() => setIsReviewApplicantsOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
