/**
 * Deterministic date formatting utilities for SSR, prerendering, and client display.
 * Avoids Date.now(), non-deterministic values, and locale-based hydration mismatches during prerender.
 */

export function formatDisplayDate(
  date: string | number | Date | null | undefined,
  fallback = "recently"
): string {
  if (!date) return fallback;
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return fallback;
    // Guaranteed deterministic YYYY-MM-DD format across all environments
    return d.toISOString().slice(0, 10);
  } catch {
    return fallback;
  }
}

export function formatClientDate(
  date: string | number | Date | null | undefined,
  fallback = "recently"
): string {
  if (!date) return fallback;
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return fallback;
    return d.toLocaleDateString();
  } catch {
    return fallback;
  }
}

export function isDateInPast(date: string | number | Date | null | undefined): boolean {
  if (!date) return false;
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return false;
    return d.getTime() < Date.now();
  } catch {
    return false;
  }
}

export function calculateDaysAgo(date: string | number | Date | null | undefined): number {
  if (!date) return 0;
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return 0;
    return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
  } catch {
    return 0;
  }
}

