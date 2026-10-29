import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import {
  normalizeEmail,
  validateEmail,
  validatePassword,
  validateSignupPayload,
  sanitizeAuthError,
} from "../auth-utils.ts";
import { isRouteProtected } from "../route-protection.ts";
import { createClient } from "@supabase/supabase-js";

test("Auth Utils: normalizeEmail trims spaces and normalizes case", () => {
  assert.equal(normalizeEmail("  user@example.com  "), "user@example.com");
  assert.equal(normalizeEmail("User@Example.COM"), "user@example.com");
  assert.equal(normalizeEmail("   Candidate.ESPRIT@SmartCV.tn  \t\n"), "candidate.esprit@smartcv.tn");
  assert.equal(normalizeEmail(null), "");
  assert.equal(normalizeEmail(undefined), "");
  assert.equal(normalizeEmail(12345), "");
});

test("Auth Utils: validateEmail checks email presence and format", () => {
  assert.deepEqual(validateEmail("user@example.com"), { valid: true });
  assert.deepEqual(validateEmail("  candidate@esprit.tn  "), { valid: true });
  assert.equal(validateEmail("").valid, false);
  assert.equal(validateEmail("not-an-email").valid, false);
  assert.equal(validateEmail("user@domain").valid, false);
});

test("Auth Utils: validatePassword enforces minimum 6 character length", () => {
  assert.deepEqual(validatePassword("validPass123!"), { valid: true });
  assert.deepEqual(validatePassword("123456"), { valid: true });
  assert.equal(validatePassword("12345").valid, false);
  assert.equal(validatePassword("").valid, false);
  assert.equal(validatePassword(null).valid, false);
});

test("Auth Utils: validateSignupPayload requires password confirmation matching", () => {
  // Matching passwords
  const validRes = validateSignupPayload({
    email: " Candidate@test.com ",
    password: "Password123!",
    confirmPassword: "Password123!",
  });
  assert.equal(validRes.valid, true);
  assert.equal(validRes.normalizedEmail, "candidate@test.com");

  // Mismatched passwords
  const mismatchRes = validateSignupPayload({
    email: "candidate@test.com",
    password: "Password123!",
    confirmPassword: "DifferentPassword456!",
  });
  assert.equal(mismatchRes.valid, false);
  assert.match(mismatchRes.error || "", /Passwords do not match/);

  // Short password
  const shortRes = validateSignupPayload({
    email: "candidate@test.com",
    password: "123",
    confirmPassword: "123",
  });
  assert.equal(shortRes.valid, false);
  assert.match(shortRes.error || "", /at least 6 characters/);
});

test("Auth Utils: sanitizeAuthError maps internal Supabase errors to helpful user messages", () => {
  assert.equal(
    sanitizeAuthError("Invalid login credentials"),
    "Invalid email or password. Please verify your credentials and try again."
  );
  assert.equal(
    sanitizeAuthError({ message: "User already registered" }),
    "An account with this email already exists. Please sign in or reset your password."
  );
  assert.equal(
    sanitizeAuthError("Email not confirmed"),
    "Please confirm your email address before signing in."
  );
});

test("Regression: Signup, Logout, and Subsequent Login with same credentials work consistently", async () => {
  // Read local Supabase credentials from .env.local
  const envContent = fs.readFileSync(".env.local", "utf8");
  const env: Record<string, string> = {};
  envContent.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    }
  });

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return; // Skip if local Supabase is not configured
  }

  const client = createClient(supabaseUrl, supabaseAnonKey);
  const adminClient = serviceKey ? createClient(supabaseUrl, serviceKey) : null;

  const rawSignupEmail = `  Candidate_${Date.now()}@esprit.tn  `;
  const rawLoginEmail = rawSignupEmail.toUpperCase();
  const password = "SafePassword2026!";

  // 1. Sign up with normalized email
  const normalizedEmail = normalizeEmail(rawSignupEmail);
  const { data: signUpData, error: signUpError } = await client.auth.signUp({
    email: normalizedEmail,
    password,
  });

  assert.equal(signUpError, null, `SignUp should succeed: ${signUpError?.message}`);
  assert.ok(signUpData.user?.id, "User ID should be returned on signup");

  try {
    // 2. Sign out
    const { error: signOutError } = await client.auth.signOut();
    assert.equal(signOutError, null, "Sign out should succeed without error");

    // 3. Attempt sign in with rawLoginEmail (which has whitespace and uppercase) after normalizing
    const normalizedLoginEmail = normalizeEmail(rawLoginEmail);
    const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
      email: normalizedLoginEmail,
      password,
    });

    assert.equal(signInError, null, `Sign in after logout should succeed: ${signInError?.message}`);
    assert.equal(signInData.user?.id, signUpData.user.id, "Authenticated user ID should match signed-up user ID");
    assert.ok(signInData.session, "Session should be returned on successful login");
  } finally {
    // Cleanup test user
    if (adminClient && signUpData.user?.id) {
      await adminClient.auth.admin.deleteUser(signUpData.user.id);
    }
  }
});

test("Regression: Protected routes remain protected after logout", () => {
  // Routes that must strictly require authentication
  assert.equal(isRouteProtected("/dashboard"), true);
  assert.equal(isRouteProtected("/profile"), true);
  assert.equal(isRouteProtected("/cv"), true);
  assert.equal(isRouteProtected("/opportunities"), true);
  assert.equal(isRouteProtected("/applications"), true);

  // Routes that must remain publicly accessible
  assert.equal(isRouteProtected("/"), false);
  assert.equal(isRouteProtected("/login"), false);
  assert.equal(isRouteProtected("/signup"), false);
});
