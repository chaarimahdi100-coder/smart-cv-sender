import "server-only";

import { DEMO_USER_EMAIL } from "./demo-mode.ts";

/**
 * Server-side Demo Mode Configuration & Public Abuse Mitigation.
 *
 * This file is guarded by "server-only" to ensure that demo credentials,
 * server secrets, and authentication actions can NEVER be bundled or leaked
 * into client-side browser bundles.
 *
 * Architectural Note on Rate Limiting:
 * This rate limiter is strictly INSTANCE-LOCAL and in-memory.
 * In serverless environments such as Vercel (AWS Lambda / Edge), each serverless function
 * executes in an isolated, ephemeral container. Therefore:
 * 1. State is maintained per-instance and is NOT shared across scaled concurrent lambdas.
 * 2. State resets automatically upon cold starts or container recycling.
 * 3. It serves as a zero-cost, lightweight best-effort throttle to protect warm containers
 *    against rapid automated burst abuse, rather than a distributed enterprise DDoS defense.
 * (A distributed limiter would require an external shared store such as Redis/Upstash;
 * Supabase DB rate_limits RPC is restricted to authenticated/service_role and is not
 * exposed to unauthenticated public visitors).
 */

/**
 * Retrieves the server-side credentials for one-click demo authentication.
 * Fails safely by returning null if DEMO_USER_PASSWORD is not configured
 * in the server environment, preventing hardcoded credentials or empty password authentication.
 */
export function getDemoCredentials(): { email: string; password: string } | null {
  const password = process.env.DEMO_USER_PASSWORD?.trim();
  if (!password) {
    return null;
  }

  return {
    email: process.env.DEMO_USER_EMAIL?.trim() || DEMO_USER_EMAIL,
    password,
  };
}

/**
 * Rate limiting configuration for public demo login attempts.
 * Prevents automated scripts or rapid clicks from exhausting
 * Supabase Auth quotas or causing denial-of-service on the demo session.
 */
const DEMO_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1-minute sliding window
const MAX_DEMO_LOGINS_PER_IP = 5; // Max 5 demo logins per IP per minute
const MAX_DEMO_LOGINS_GLOBAL = 30; // Max 30 demo logins globally per minute

interface RateLimitBucket {
  timestamps: number[];
}

const ipBuckets = new Map<string, RateLimitBucket>();
const globalBucket: RateLimitBucket = { timestamps: [] };

export interface DemoRateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
  message?: string;
}

/**
 * Helper to clean timestamps older than the sliding window.
 */
function pruneExpired(bucket: RateLimitBucket, cutoff: number): void {
  bucket.timestamps = bucket.timestamps.filter((ts) => ts > cutoff);
}

/**
 * Checks and records a demo login attempt against both IP and global sliding windows.
 * Can be called with an explicit IP (e.g. in unit tests) or will inspect
 * trusted deployment proxy headers when executed within a Next.js Server Action context.
 */
export async function checkDemoLoginRateLimit(explicitIdentifier?: string): Promise<DemoRateLimitResult> {
  let identifier = explicitIdentifier;

  if (!identifier) {
    try {
      const { headers } = await import("next/headers");
      const headerStore = await headers();

      // Prioritize trusted proxy headers set by edge platforms (Vercel, Cloudflare).
      // These cannot be forged by client manipulation of X-Forwarded-For.
      const trustedIp =
        headerStore.get("x-real-ip") ||
        headerStore.get("x-vercel-ip") ||
        headerStore.get("cf-connecting-ip");

      if (trustedIp) {
        identifier = trustedIp.trim();
      } else {
        // Fallback for standard reverse proxies where x-real-ip is not enabled:
        // Read x-forwarded-for. When multiple proxies exist, the rightmost entry is
        // appended by the closest trusted proxy.
        const forwarded = headerStore.get("x-forwarded-for");
        if (forwarded) {
          const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
          identifier = parts[parts.length - 1] || "unknown";
        } else {
          identifier = "unknown";
        }
      }
    } catch {
      // Outside of an active Next.js request context (e.g., unit test runner)
      identifier = "default_client";
    }
  }

  const now = Date.now();
  const windowStart = now - DEMO_RATE_LIMIT_WINDOW_MS;

  // 1. Clean and check global rate limit
  pruneExpired(globalBucket, windowStart);
  if (globalBucket.timestamps.length >= MAX_DEMO_LOGINS_GLOBAL) {
    const oldest = globalBucket.timestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + DEMO_RATE_LIMIT_WINDOW_MS - now) / 1000));
    return {
      allowed: false,
      retryAfterSeconds,
      message: `Le service de démo fait face à une forte demande globale. Veuillez patienter ${retryAfterSeconds} seconde(s) avant de réessayer.`,
    };
  }

  // 2. Clean and check IP rate limit
  let bucket = ipBuckets.get(identifier);
  if (!bucket) {
    bucket = { timestamps: [] };
    ipBuckets.set(identifier, bucket);
  } else {
    pruneExpired(bucket, windowStart);
  }

  if (bucket.timestamps.length >= MAX_DEMO_LOGINS_PER_IP) {
    const oldest = bucket.timestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + DEMO_RATE_LIMIT_WINDOW_MS - now) / 1000));
    return {
      allowed: false,
      retryAfterSeconds,
      message: `Trop de requêtes d'accès au mode démo depuis votre connexion. Veuillez patienter ${retryAfterSeconds} seconde(s) avant de réessayer.`,
    };
  }

  // 3. Record current attempt
  bucket.timestamps.push(now);
  globalBucket.timestamps.push(now);

  return { allowed: true };
}

/**
 * Resets the in-memory rate limiter state.
 * Strictly intended for testing suites.
 */
export function _resetDemoRateLimiter(): void {
  ipBuckets.clear();
  globalBucket.timestamps = [];
}
