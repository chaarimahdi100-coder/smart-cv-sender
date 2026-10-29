export const PROTECTED_ROUTE_PREFIXES = ['/dashboard', '/profile', '/cv', '/applications', '/opportunities'];
export const OPPORTUNITY_APPLY_ROUTE_PATTERN = /^\/opportunities\/.+\/apply(\/.*)?$/;

/**
 * Evaluates whether a given pathname requires an authenticated user session.
 * Protects all authenticated candidate routes (/dashboard, /profile, /cv, /applications, /opportunities).
 */
export function isRouteProtected(pathname: string): boolean {
  if (PROTECTED_ROUTE_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return true;
  }
  return OPPORTUNITY_APPLY_ROUTE_PATTERN.test(pathname);
}
