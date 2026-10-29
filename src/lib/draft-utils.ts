export type EmailDraftRecord = {
  id: string;
  application_id: string;
  recipient_email: string;
  subject: string;
  body: string;
  approved_at: string | null;
  approved_hash: string | null;
  approved_attachment_hash: string | null;
  created_at?: string;
  updated_at?: string;
  is_ai_generated?: boolean;
  generation_notice?: string | null;
  conflict_resolution?: string | null;
  conflict_resolution_note?: string | null;
};

/**
 * Normalizes email draft data returned by Supabase PostgREST.
 * In PostgREST, a relation can be returned as an array (1-to-many) or a single object
 * (1-to-1 when a unique constraint is present on application_id).
 *
 * If multiple drafts exist in an array, this function sorts by updated_at / created_at descending
 * to guarantee that the candidate's latest saved edits are always selected.
 */
export function normalizeDraftData(rawDrafts: unknown): EmailDraftRecord | null {
  if (!rawDrafts) return null;

  if (Array.isArray(rawDrafts)) {
    if (rawDrafts.length === 0) return null;
    const valid = rawDrafts.filter(
      (d): d is EmailDraftRecord => Boolean(d && typeof d === "object" && "id" in d)
    );
    if (valid.length === 0) return null;

    // Prefer the most recently saved draft
    valid.sort((a, b) => {
      const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
      const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
      return timeB - timeA;
    });

    return valid[0];
  }

  if (typeof rawDrafts === "object" && "id" in rawDrafts) {
    return rawDrafts as EmailDraftRecord;
  }

  return null;
}

/**
 * Known placeholder domains and synthetic patterns.
 * Addresses using these domains or patterns are never legitimate recruiter contacts.
 */
const PLACEHOLDER_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "test.dev",
  "test.local",
  "test.org",
  "localhost",
  "invalid",
  "dummy.com",
  "placeholder.com",
  "enterprise.com",
]);

const PLACEHOLDER_PREFIXES = new Set([
  "recruiter@example.com",
  "test@example.com",
  "contact@enterprise.com",
  "hr@example.com",
  "admin@example.com",
  "candidate@example.com",
]);

/**
 * Checks whether an email address is a synthetic placeholder, sample, or fabricated address.
 */
export function isPlaceholderOrUntrustedEmail(email?: string | null): boolean {
  if (!email || typeof email !== "string") return true;

  const normalized = email.trim().toLowerCase();
  if (!normalized) return true;

  if (PLACEHOLDER_PREFIXES.has(normalized)) return true;

  // Domain check
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex === -1 || atIndex === 0 || atIndex === normalized.length - 1) return true;

  const domain = normalized.substring(atIndex + 1);
  if (PLACEHOLDER_DOMAINS.has(domain)) return true;

  // Check subdomains of placeholder domains (e.g. mail.example.com)
  for (const placeholder of PLACEHOLDER_DOMAINS) {
    if (domain.endsWith(`.${placeholder}`)) return true;
  }

  // Common placeholder keywords in localpart or domain
  if (
    normalized.includes("placeholder") ||
    normalized.includes("fake") ||
    normalized.includes("dummy") ||
    normalized.includes("unverified")
  ) {
    return true;
  }

  return false;
}

/**
 * Validates that an email is structurally valid AND from a non-placeholder, credible source.
 */
export function isTrustedRecruiterEmail(email?: string | null): boolean {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim();
  const validEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!validEmailRegex.test(trimmed)) return false;
  if (isPlaceholderOrUntrustedEmail(trimmed)) return false;
  return true;
}

/**
 * Validates and formats the payload for a new application email draft.
 * Never fabricates or defaults to fake placeholder emails (e.g. recruiter@example.com).
 * If no verified, trusted contact email is available, leaves recipient_email empty.
 */
export function buildDraftPayload(params: {
  applicationId: string;
  opportunityTitle: string;
  userEmail: string;
  contactEmail?: string | null;
  subject?: string;
  body?: string;
  conflict_resolution?: string | null;
  conflict_resolution_note?: string | null;
}) {
  const { applicationId, opportunityTitle, userEmail, contactEmail, subject, body, conflict_resolution, conflict_resolution_note } = params;

  const cleanedContact = contactEmail?.trim() || "";
  const recipient_email = isTrustedRecruiterEmail(cleanedContact)
    ? cleanedContact
    : "";

  const title = opportunityTitle.trim() || "Poste";
  const defaultSubject = `Candidature pour ${title}`;
  const defaultBody = `Bonjour,\n\nJe souhaite vous proposer ma candidature pour ${title}.\n\nCordialement,\n${userEmail}`;

  return {
    application_id: applicationId,
    recipient_email,
    subject: subject?.trim() || defaultSubject,
    body: body?.trim() || defaultBody,
    conflict_resolution: conflict_resolution || null,
    conflict_resolution_note: conflict_resolution_note || null,
    updated_at: new Date().toISOString(),
  };
}
