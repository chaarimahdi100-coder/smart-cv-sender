/**
 * Core types and interfaces for the Smart CV Sender Opportunity Discovery Engine.
 */

export type VerificationStatus =
  | "new"             // Discovered but not yet processed
  | "verified_open"   // Verified through active source, valid application route, corroborated employer
  | "likely_open"     // Reachable and appears active, but availability cannot be 100% corroborated
  | "unverified"      // Search lead or snippet without full page confirmation
  | "expired"         // Explicitly expired date or passed deadline
  | "closed"          // Source explicitly reports vacancy is filled or closed
  | "upcoming"        // Future-dated vacancy or recruitment wave opening at a future date
  | "broken_source"   // URL returns 404, DNS error, or does not resolve
  | "rejected";       // Scam, payment required, or misleading listing

export type SourceType =
  | "company_career"
  | "ats_portal"
  | "professional_network"
  | "job_board"
  | "search_engine"
  | "university_portal"
  | "public_feed"
  | "manual";

export type SourceAccessMethod =
  | "direct_api"
  | "ats_api"
  | "public_feed"
  | "search_lead"
  | "manual_import"
  | "curated_feed";

export type OpportunityType =
  | "PFE"
  | "STAGE"
  | "JUNIOR"
  | "GRADUATE_PROGRAM"
  | "APPRENTICESHIP"
  | "MANAGER"
  | "SENIOR"
  | "SPONTANEOUS"
  | "OTHER";

export type RemotePolicy =
  | "on_site"
  | "hybrid"
  | "remote"
  | "unknown";

export interface VerificationEvidence {
  urlReachable: boolean;
  httpStatusCode?: number;
  isSpecificListing: boolean;
  employerCorroborated: boolean;
  corroborationMethod?: string;
  datePostedVerified: boolean;
  deadlineVerified: boolean;
  applicationRouteVerified: boolean;
  noClosedOrExpiredSignals: boolean;
  noSuspiciousScamSignals: boolean;
  signalsDetected: string[];
  notes: string[];
  checkedAt: string;
  dateOpening?: string | null;
  dateModified?: string | null;
  directApplicationUrl?: string | null;
  sourcePlatformName?: string | null;
  sourcePlatform?: string | null;
  sourceUrl?: string | null;
  applicationUrl?: string | null;
  publishedAt?: string | null;
  updatedAtSource?: string | null;
  closedAt?: string | null;
  isPublicationDateUnknown?: boolean;
  isAvailabilityUnconfirmed?: boolean;
  statusHistory?: Array<{ status: VerificationStatus; date: string; reason?: string }>;
  isStale?: boolean;
  staleReason?: string;
  availabilityConflict?: {
    hasConflict: boolean;
    candidatePeriod?: string;
    opportunityPeriod?: string;
    reason?: string;
  };
}

export interface DiscoveredOpportunity {
  id?: string;
  title: string;
  canonicalUrl: string;
  sourceUrl: string;
  sourceProvider: string;
  sourceProviderName?: string;
  sourcePlatform?: string;
  companyName: string;
  companyWebsite?: string;
  companySector?: string;
  location: string;
  city?: string;
  country: string;
  remotePolicy: RemotePolicy;
  type: OpportunityType;
  domain: string;
  description: string;
  requiredSkills: string[];
  contactEmail?: string;
  applicationUrl: string;
  applicationMethod: "direct_url" | "email" | "portal";
  datePosted?: string | null;
  publishedAt?: string | null;
  validThrough?: string | null;
  deadlineAt?: string | null;
  dateOpening?: string | null;
  dateModified?: string | null;
  updatedAtSource?: string | null;
  closedAt?: string | null;
  directApplicationUrl?: string | null;
  firstSeenAt: string;
  lastCheckedAt: string;
  lastVerifiedAt?: string;
  lastContentChangeAt?: string;
  status: VerificationStatus;
  statusReason: string;
  verificationEvidence: VerificationEvidence;
  isDemo: boolean;
  isStale?: boolean;
  isPublicationDateUnknown?: boolean;
  statusHistory?: Array<{ status: VerificationStatus; date: string; reason?: string }>;
}

export interface DiscoveryLead {
  title: string;
  sourceUrl: string;
  sourceProvider: string;
  sourcePlatform?: string;
  applicationUrl?: string;
  companyName?: string;
  companyWebsite?: string;
  location?: string;
  snippet?: string;
  datePosted?: string | null;
  validThrough?: string | null;
  updatedAtSource?: string | null;
  closedAt?: string | null;
  type?: OpportunityType;
  domain?: string;
  rawPayload?: Record<string, unknown>;
}

export interface SourceRegistryItem {
  id: string;
  name: string;
  sourceType: SourceType;
  accessMethod: SourceAccessMethod;
  homepageUrl: string;
  enabled: boolean;
  requiresAuth: boolean;
  isConfigured: boolean;
  configRequirements: string[];
  lastSyncAt?: string | null;
  lastError?: string | null;
  rateLimitPerMinute: number;
  description: string;
  targetAudience: string;
  tunisiaCoverage: "primary" | "regional" | "remote_eligible";
}

export interface SyncReport {
  timestamp: string;
  totalLeadsDiscovered: number;
  verifiedOpenCount: number;
  likelyOpenCount: number;
  unverifiedCount: number;
  expiredCount: number;
  closedCount: number;
  rejectedCount: number;
  brokenSourceCount: number;
  duplicateCount: number;
  persistedCount: number;
  durationMs: number;
  providerResults: Array<{
    providerId: string;
    leadsCount: number;
    success: boolean;
    error?: string;
  }>;
  errors: string[];
}

export type PersistOpportunityMode =
  | "full"
  | "fallback_base"
  | "updated"
  | "failed";

export interface PersistOpportunityResult {
  success: boolean;
  mode: PersistOpportunityMode;
  partialMetadata: boolean;
  opportunityId?: string;
  warning?: string;
  error?: string;
}
