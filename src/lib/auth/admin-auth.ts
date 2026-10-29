/**
 * Server-side Admin and Opportunity Manager Authorization.
 *
 * Enforces strict role checks for privileged catalog modifications
 * (creating, editing, deactivating, and importing opportunities).
 *
 * Security Guarantees:
 * - Candidate accounts are ALWAYS read-only for opportunity management.
 * - Never trusts client-supplied role parameters.
 * - Evaluates authorization strictly against server-side configuration.
 */

export interface AuthorizationResult {
  authorized: boolean;
  reason?: string;
  userEmail?: string;
}

/**
 * Designated development and test administrator accounts.
 * Wildcard prefixes (e.g. "admin@*") and domain suffixes (e.g. "*@smartcv.dev") are STRICTLY prohibited.
 */
export const DESIGNATED_DEV_TEST_ADMINS = new Set([
  "admin@smartcv.dev",
  "admin@example.com",
]);

/**
 * Checks if the given authenticated user is authorized to manage the opportunity directory.
 *
 * Evaluation Strategy:
 * 1. Checks if user email is listed in process.env.ADMIN_EMAILS (comma-separated exact emails).
 * 2. In production or preview environments without ADMIN_EMAILS, fails closed unconditionally.
 * 3. In local development or test mode, requires explicit opt-in (ALLOW_DEV_ADMIN=true or NODE_ENV=test)
 *    and an exact match against designated development administrator accounts (no wildcards).
 * 4. Never authorizes unknown or standard candidate accounts.
 */
export function isAuthorizedOpportunityManager(user: { email?: string | null } | null): AuthorizationResult {
  if (!user || !user.email) {
    return {
      authorized: false,
      reason: "Authentification requise : vous devez être connecté pour effectuer cette opération.",
    };
  }

  const email = user.email.toLowerCase().trim();
  const rawAdminEmails = process.env.ADMIN_EMAILS || "";
  const adminEmails = rawAdminEmails
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  // 1. Explicit ADMIN_EMAILS configuration takes precedence in all environments
  if (adminEmails.length > 0) {
    if (adminEmails.includes(email)) {
      return { authorized: true, userEmail: email };
    }
    return {
      authorized: false,
      reason: "Accès refusé : votre compte candidat n'a pas les privilèges d'administration du catalogue d'opportunités.",
      userEmail: email,
    };
  }

  // 2. Production, staging, or preview deployments without explicit ADMIN_EMAILS:
  // Fail closed unconditionally.
  const isProductionOrPreview =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production" ||
    process.env.VERCEL_ENV === "preview";

  if (isProductionOrPreview) {
    return {
      authorized: false,
      reason: "Accès refusé : aucun administrateur configuré dans l'environnement de production (ADMIN_EMAILS requis).",
      userEmail: email,
    };
  }

  const isExplicitDevAllowed =
    process.env.NODE_ENV === "test" ||
    process.env.ALLOW_DEV_ADMIN === "true" ||
    Boolean(process.env.NODE_TEST_CONTEXT);

  if (isExplicitDevAllowed && DESIGNATED_DEV_TEST_ADMINS.has(email)) {
    return { authorized: true, userEmail: email };
  }

  return {
    authorized: false,
    reason: "Accès refusé : seuls les gestionnaires autorisés (ADMIN_EMAILS) peuvent modifier le catalogue d'opportunités.",
    userEmail: email,
  };
}

