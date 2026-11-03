/**
 * Demo Mode Configuration and Authorization Guards (Client & Server Shared).
 *
 * Provides shared utilities for the public demonstration session:
 * - Demo user identification
 * - Shared demo session restrictions (prevents mutating critical profile settings)
 * - Fictional sample data constants
 *
 * NOTE: Server-only credentials and rate-limiting reside in demo-mode.server.ts.
 */

export const DEMO_USER_EMAIL = "demo@smartcv.dev";

/**
 * Checks whether the given email corresponds to the dedicated demo user.
 */
export function isDemoUser(email?: string | null): boolean {
  if (!email || typeof email !== "string") return false;
  return email.trim().toLowerCase() === DEMO_USER_EMAIL.toLowerCase();
}

/**
 * Explanatory message shown when a shared demo user attempts to perform restricted mutations.
 */
export const SHARED_DEMO_RESTRICTION_MESSAGE =
  "Le profil du compte de démonstration partagé est en mode aperçu public : les modifications de profil sont désactivées pour garantir une expérience cohérente à tous les visiteurs.";

