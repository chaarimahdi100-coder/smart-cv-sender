/**
 * Authentication utility functions for email normalization, input validation,
 * password matching, safe error handling, origin resolution, and open-redirect prevention.
 */

export function normalizeEmail(email: unknown): string {
  if (typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): { valid: boolean; error?: string } {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return { valid: false, error: "Please enter your email address." };
  }
  // Standard RFC 5322 compatible pattern for web forms
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(normalized)) {
    return { valid: false, error: "Please enter a valid email address." };
  }
  return { valid: true };
}

export function validatePassword(password: unknown): { valid: boolean; error?: string } {
  if (typeof password !== "string" || !password) {
    return { valid: false, error: "Please enter your password." };
  }
  if (password.length < 6) {
    return { valid: false, error: "Password must be at least 6 characters long." };
  }
  return { valid: true };
}

export function validateSignupPayload(payload: {
  email?: unknown;
  password?: unknown;
  confirmPassword?: unknown;
}): { valid: boolean; error?: string; normalizedEmail?: string } {
  const emailValidation = validateEmail(String(payload.email || ""));
  if (!emailValidation.valid) {
    return { valid: false, error: emailValidation.error };
  }

  const pwdValidation = validatePassword(payload.password);
  if (!pwdValidation.valid) {
    return { valid: false, error: pwdValidation.error };
  }

  const password = String(payload.password || "");
  const confirmPassword = String(payload.confirmPassword || "");

  if (payload.confirmPassword !== undefined && password !== confirmPassword) {
    return { valid: false, error: "Passwords do not match. Please re-enter your password." };
  }

  return {
    valid: true,
    normalizedEmail: normalizeEmail(payload.email),
  };
}

export function sanitizeAuthError(error: unknown): string {
  if (!error) return "An unexpected error occurred. Please try again.";
  const msg = typeof error === "object" && error !== null && "message" in error
    ? String((error as { message: unknown }).message)
    : String(error);

  const lower = msg.toLowerCase();

  if (lower.includes("invalid login credentials") || lower.includes("invalid_credentials")) {
    return "Invalid email or password. Please verify your credentials and try again.";
  }
  if (lower.includes("email not confirmed") || lower.includes("email_not_confirmed")) {
    return "Please confirm your email address before signing in.";
  }
  if (lower.includes("user already registered") || lower.includes("user_already_exists")) {
    return "An account with this email already exists. Please sign in or reset your password.";
  }
  if (lower.includes("password should be at least") || lower.includes("password is too short")) {
    return "Password must be at least 6 characters long.";
  }
  if (lower.includes("rate limit") || lower.includes("too many requests")) {
    return "Too many attempts. Please wait a few minutes before trying again.";
  }

  return msg;
}

export const PRODUCTION_CANONICAL_ORIGIN = "https://smart-cv-sender.vercel.app";
export const LOCAL_DEV_ORIGIN = "http://localhost:3000";

/**
 * Explicit allowlist of approved hostnames and deployment patterns.
 * Prevents arbitrary header poisoning via manipulated x-forwarded-host.
 */
export const ALLOWED_HOSTNAME_PATTERNS: readonly RegExp[] = [
  /^localhost(?::\d+)?$/i,
  /^127\.0\.0\.1(?::\d+)?$/i,
  /^smart-cv-sender\.vercel\.app$/i,
  /^smart-cv-sender-[a-zA-Z0-9_-]+\.vercel\.app$/i,
];

/**
 * Validates whether a given host string belongs to the approved allowlist.
 */
export function isAllowedHost(host: unknown): boolean {
  if (typeof host !== "string" || !host.trim()) return false;
  const trimmed = host.trim().toLowerCase();
  return ALLOWED_HOSTNAME_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Safely resolves the application origin using request headers and an explicit allowlist.
 * If the header host is untrusted, invalid, or missing, it falls back to the canonical
 * environment origin (production or local dev).
 */
export function resolveSafeOriginFromHeaders(headersReader?: {
  get(headerName: string): string | null | undefined;
} | null): string {
  const isProd = process.env.NODE_ENV === "production";
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  // Establish fallback origin
  let fallbackOrigin = isProd ? PRODUCTION_CANONICAL_ORIGIN : (configuredAppUrl || LOCAL_DEV_ORIGIN);
  if (!fallbackOrigin.startsWith("http://") && !fallbackOrigin.startsWith("https://")) {
    fallbackOrigin = `https://${fallbackOrigin}`;
  }

  if (!headersReader) {
    return fallbackOrigin;
  }

  // Check forwarded host or standard host
  const rawForwarded = headersReader.get("x-forwarded-host")?.trim();
  const rawHost = headersReader.get("host")?.trim();
  const candidateHost = rawForwarded || rawHost;

  if (candidateHost && isAllowedHost(candidateHost)) {
    const rawProto = headersReader.get("x-forwarded-proto")?.trim().toLowerCase();
    const isLocal = candidateHost.startsWith("localhost") || candidateHost.startsWith("127.0.0.1");
    const proto = rawProto === "https" ? "https" : (isLocal && rawProto !== "https") ? "http" : "https";
    return `${proto}://${candidateHost}`;
  }

  return fallbackOrigin;
}

/**
 * Sanitizes destination paths to strictly prevent open-redirect vulnerabilities.
 * Disallows protocol-relative URLs (//evil.com), backslashes (/\\evil.com),
 * and absolute URLs with schemes.
 */
export function sanitizeNextRedirect(next: unknown, fallback = "/dashboard"): string {
  if (typeof next !== "string" || !next.trim()) return fallback;
  const trimmed = next.trim();

  // Must begin with a single slash, not double slash or slash-backslash
  if (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.startsWith("/\\") &&
    !trimmed.includes("://") &&
    !trimmed.includes("\r") &&
    !trimmed.includes("\n")
  ) {
    return trimmed;
  }

  return fallback;
}
