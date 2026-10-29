/**
 * Authentication utility functions for email normalization, input validation,
 * password matching, and safe error handling.
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
