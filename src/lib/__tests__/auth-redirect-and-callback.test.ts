import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

// Load .env.local into process.env for Node test runner
if (fs.existsSync(".env.local")) {
  const envContent = fs.readFileSync(".env.local", "utf8");
  envContent.split("\n").forEach((line) => {
    const trimmed = line.replace(/\r/g, "").trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const k = trimmed.slice(0, eqIdx).trim();
        const v = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[k]) {
          process.env[k] = v;
        }
      }
    }
  });
}

import {
  isAllowedHost,
  resolveSafeOriginFromHeaders,
  sanitizeNextRedirect,
  validateEmail,
  validateSignupPayload,
  sanitizeAuthError,
  PRODUCTION_CANONICAL_ORIGIN,
  LOCAL_DEV_ORIGIN,
} from "../auth-utils.ts";
import { isRouteProtected } from "../route-protection.ts";
import { getActiveOpportunitiesPublicCount } from "../opportunities-count.server.ts";

// Helper to mock headers
function createMockHeaders(map: Record<string, string | undefined>) {
  return {
    get(name: string) {
      return map[name.toLowerCase()] ?? null;
    },
  };
}

test("Origin Security: isAllowedHost strictly accepts approved hosts and rejects malicious hosts", () => {
  // Approved development hosts
  assert.equal(isAllowedHost("localhost"), true);
  assert.equal(isAllowedHost("localhost:3000"), true);
  assert.equal(isAllowedHost("localhost:8080"), true);
  assert.equal(isAllowedHost("127.0.0.1"), true);
  assert.equal(isAllowedHost("127.0.0.1:3000"), true);

  // Approved production and preview hosts
  assert.equal(isAllowedHost("smart-cv-sender.vercel.app"), true);
  assert.equal(isAllowedHost("smart-cv-sender-git-feature-preview.vercel.app"), true);
  assert.equal(isAllowedHost("smart-cv-sender-abc123.vercel.app"), true);

  // Malicious or unapproved hosts (MUST BE REJECTED)
  assert.equal(isAllowedHost("evil.com"), false);
  assert.equal(isAllowedHost("attacker.com:3000"), false);
  assert.equal(isAllowedHost("smart-cv-sender.vercel.app.attacker.com"), false);
  assert.equal(isAllowedHost("localhost.attacker.com"), false);
  assert.equal(isAllowedHost("127.0.0.1.nip.io"), false);
  assert.equal(isAllowedHost("not-smart-cv-sender.vercel.app"), false);
  assert.equal(isAllowedHost(""), false);
  assert.equal(isAllowedHost(null), false);
  assert.equal(isAllowedHost(undefined), false);
});

test("Origin Resolution: resolveSafeOriginFromHeaders correctly determines safe origin", () => {
  // Local development request
  const localHeaders = createMockHeaders({
    host: "localhost:3000",
  });
  assert.equal(resolveSafeOriginFromHeaders(localHeaders), "http://localhost:3000");

  // Production Vercel request with SSL
  const prodHeaders = createMockHeaders({
    "x-forwarded-host": "smart-cv-sender.vercel.app",
    "x-forwarded-proto": "https",
  });
  assert.equal(resolveSafeOriginFromHeaders(prodHeaders), "https://smart-cv-sender.vercel.app");

  // Vercel preview deployment request
  const previewHeaders = createMockHeaders({
    "x-forwarded-host": "smart-cv-sender-preview-123.vercel.app",
    "x-forwarded-proto": "https",
  });
  assert.equal(resolveSafeOriginFromHeaders(previewHeaders), "https://smart-cv-sender-preview-123.vercel.app");

  // Host Header Poisoning Attack (Attacker tries to hijack email redirect to evil.com)
  const attackHeaders = createMockHeaders({
    "x-forwarded-host": "evil-phishing-site.com",
    "x-forwarded-proto": "https",
  });
  const sanitizedOrigin = resolveSafeOriginFromHeaders(attackHeaders);
  assert.notEqual(sanitizedOrigin, "https://evil-phishing-site.com");
  assert.equal(
    sanitizedOrigin === PRODUCTION_CANONICAL_ORIGIN || sanitizedOrigin === LOCAL_DEV_ORIGIN,
    true
  );

  // Missing headers fallback
  const fallback = resolveSafeOriginFromHeaders(null);
  assert.equal(
    fallback === PRODUCTION_CANONICAL_ORIGIN || fallback === LOCAL_DEV_ORIGIN,
    true
  );
});

test("Redirect Construction: constructs environment-aware emailRedirectTo", () => {
  // Local development redirect
  const localOrigin = resolveSafeOriginFromHeaders(createMockHeaders({ host: "localhost:3000" }));
  const localRedirect = `${localOrigin}/auth/callback`;
  assert.equal(localRedirect, "http://localhost:3000/auth/callback");

  // Production Vercel redirect
  const prodOrigin = resolveSafeOriginFromHeaders(
    createMockHeaders({ "x-forwarded-host": "smart-cv-sender.vercel.app", "x-forwarded-proto": "https" })
  );
  const prodRedirect = `${prodOrigin}/auth/callback`;
  assert.equal(prodRedirect, "https://smart-cv-sender.vercel.app/auth/callback");
});

test("Open Redirect Defense: sanitizeNextRedirect neutralizes all open redirect vectors", () => {
  // Allowed safe relative paths
  assert.equal(sanitizeNextRedirect("/dashboard"), "/dashboard");
  assert.equal(sanitizeNextRedirect("/opportunities"), "/opportunities");
  assert.equal(sanitizeNextRedirect("/applications/d10b9960/draft"), "/applications/d10b9960/draft");
  assert.equal(sanitizeNextRedirect("/profile?tab=settings"), "/profile?tab=settings");

  // Disallowed protocol-relative URLs
  assert.equal(sanitizeNextRedirect("//evil.com"), "/dashboard");
  assert.equal(sanitizeNextRedirect("//attacker.com/steal-session"), "/dashboard");

  // Disallowed backslash escapes
  assert.equal(sanitizeNextRedirect("/\\evil.com"), "/dashboard");
  assert.equal(sanitizeNextRedirect("/\\/attacker.com"), "/dashboard");

  // Disallowed absolute URLs
  assert.equal(sanitizeNextRedirect("https://evil.com"), "/dashboard");
  assert.equal(sanitizeNextRedirect("http://evil.com/path"), "/dashboard");
  assert.equal(sanitizeNextRedirect("javascript:alert(1)"), "/dashboard");

  // Custom fallback
  assert.equal(sanitizeNextRedirect("https://evil.com", "/opportunities"), "/opportunities");
  assert.equal(sanitizeNextRedirect("", "/home"), "/home");
  assert.equal(sanitizeNextRedirect(null, "/login"), "/login");
});

test("Scoped Opportunities Count Helper: returns accurate count without exposing rows", async () => {
  const count = await getActiveOpportunitiesPublicCount();
  assert.equal(typeof count, "number");
  assert.equal(count, 89);
});

test("Critical Access Policy: unauthenticated anon role CANNOT select opportunity rows", async () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:55431";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const anonClient = createClient(supabaseUrl, supabaseAnonKey);

  // Direct row selection should return 0 rows for unauthenticated anon client due to RLS
  const { data: opps, error } = await anonClient
    .from("opportunities")
    .select("id, title, description");

  assert.equal(error, null);
  assert.equal(Array.isArray(opps), true);
  assert.equal(opps.length, 0, "Anonymous role must receive 0 rows from opportunities table");
});

test("Critical Access Policy: authenticated service client can read opportunities", async () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:55431";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const serviceClient = createClient(supabaseUrl, serviceKey);

  const { count, error } = await serviceClient
    .from("opportunities")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);

  assert.equal(error, null);
  assert.equal(count, 89, "Authenticated service client must see all 89 active opportunities");
});

test("Critical Access Policy: Opportunities directory and applications are strictly protected routes", () => {
  assert.equal(isRouteProtected("/opportunities"), true);
  assert.equal(isRouteProtected("/opportunities/123/apply"), true);
  assert.equal(isRouteProtected("/dashboard"), true);
  assert.equal(isRouteProtected("/profile"), true);
  assert.equal(isRouteProtected("/cv"), true);
  assert.equal(isRouteProtected("/applications"), true);

  // Public unauthenticated routes
  assert.equal(isRouteProtected("/"), false);
  assert.equal(isRouteProtected("/login"), false);
  assert.equal(isRouteProtected("/signup"), false);
});

test("Email Confirmation & Resend Security: validateEmail & user enumeration prevention contracts", () => {
  // Validate email checks
  assert.deepEqual(validateEmail("candidate@esprit.tn"), { valid: true });
  assert.deepEqual(validateEmail("invalid-email"), { valid: false, error: "Please enter a valid email address." });

  // Validate signup payload
  const payloadRes = validateSignupPayload({ email: "test@esprit.tn", password: "Password123!" });
  assert.equal(payloadRes.valid, true);

  // Rate limit detection
  const rateLimitError = sanitizeAuthError({ message: "email rate limit exceeded" });
  assert.equal(rateLimitError, "Too many attempts. Please wait a few minutes before trying again.");
});
