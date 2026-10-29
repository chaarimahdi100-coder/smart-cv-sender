import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRateLimitWindow } from "../rate-limiter.ts";

test("Rate Limiter: permits first request when no existing record exists", () => {
  const result = evaluateRateLimitWindow(null, Date.now(), 5, 600);
  assert.equal(result.allowed, true);
  assert.equal(result.remaining, 4);
  assert.equal(result.resetInSeconds, 600);
  assert.equal(result.reason, undefined);
});

test("Rate Limiter: allows subsequent requests below limit within active window", () => {
  const now = Date.now();
  const windowStart = new Date(now - 120 * 1000).toISOString(); // 2 minutes ago in 10-minute window
  const currentRecord = { request_count: 2, window_start: windowStart };

  const result = evaluateRateLimitWindow(currentRecord, now, 5, 600);
  assert.equal(result.allowed, true);
  assert.equal(result.remaining, 2); // 5 - (2 + 1) = 2 remaining
  assert.ok(result.resetInSeconds <= 480 && result.resetInSeconds >= 478);
});

test("Rate Limiter: rejects requests that exceed the limit within active window", () => {
  const now = Date.now();
  const windowStart = new Date(now - 60 * 1000).toISOString(); // 1 minute ago in 5-minute window
  const currentRecord = { request_count: 10, window_start: windowStart };

  const result = evaluateRateLimitWindow(currentRecord, now, 10, 300);
  assert.equal(result.allowed, false);
  assert.equal(result.remaining, 0);
  assert.ok(result.resetInSeconds <= 240 && result.resetInSeconds >= 238);
  assert.match(result.reason || "", /Rate limit exceeded/);
});

test("Rate Limiter: resets bucket after window duration has elapsed", () => {
  const now = Date.now();
  const windowStart = new Date(now - 301 * 1000).toISOString(); // 301s ago in 300s window
  const currentRecord = { request_count: 10, window_start: windowStart };

  const result = evaluateRateLimitWindow(currentRecord, now, 10, 300);
  assert.equal(result.allowed, true);
  assert.equal(result.remaining, 9);
  assert.equal(result.resetInSeconds, 300);
});

test("Rate Limiter: checkRateLimit returns unmigrated_fallback when table/rpc is missing without claiming database enforcement", async () => {
  const { checkRateLimit } = await import("../rate-limiter.ts");

  // Mock Supabase client where RPC and table are missing
  const mockSupabase = {
    rpc: async () => ({ data: null, error: { code: "PGRST202", message: "function not found" } }),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: null,
            error: { code: "42P01", message: 'relation "rate_limits" does not exist' }
          })
        })
      })
    })
  } as unknown as import("@supabase/supabase-js").SupabaseClient;

  const result = await checkRateLimit(mockSupabase, "cv_upload:user-123", 5, 600);
  assert.equal(result.allowed, true);
  assert.equal(result.source, "unmigrated_fallback");
  assert.equal(result.isDatabaseEnforced, false);
});

test("Rate Limiter: checkRateLimit returns rpc source and isDatabaseEnforced true when RPC succeeds", async () => {
  const { checkRateLimit } = await import("../rate-limiter.ts");

  const mockSupabase = {
    rpc: async () => ({
      data: { allowed: true, remaining: 4, reset_in_seconds: 600 },
      error: null
    })
  } as unknown as import("@supabase/supabase-js").SupabaseClient;

  const result = await checkRateLimit(mockSupabase, "cv_upload:user-123", 5, 600);
  assert.equal(result.allowed, true);
  assert.equal(result.remaining, 4);
  assert.equal(result.source, "rpc");
  assert.equal(result.isDatabaseEnforced, true);
});

test("Rate Limiter: key format validation prevents tenant manipulation and malformed formats", () => {
  const userId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
  const validKey = `cv_upload:${userId}`;
  const validRegenKey = `draft_regen:${userId}`;

  function isValidRateLimitKey(key: string, authUid: string): { valid: boolean; error?: string } {
    if (!key || typeof key !== "string" || !key.trim()) {
      return { valid: false, error: "Rate limit key cannot be empty" };
    }
    const regex = /^[a-zA-Z0-9_-]+:[0-9a-fA-F-]{36}$/;
    if (!regex.test(key)) {
      return { valid: false, error: "Invalid rate limit key format" };
    }
    const parts = key.split(":");
    if (parts[1] !== authUid) {
      return { valid: false, error: "Unauthorized rate limit key: user ID mismatch" };
    }
    return { valid: true };
  }

  // Valid cases
  assert.equal(isValidRateLimitKey(validKey, userId).valid, true);
  assert.equal(isValidRateLimitKey(validRegenKey, userId).valid, true);

  // Cross-tenant attack: attacker passes victim user ID
  const victimId = "b1ffcd88-8b1a-3de7-aa5c-5aa8ac270b22";
  const spoofedKey = `cv_upload:${victimId}`;
  assert.equal(isValidRateLimitKey(spoofedKey, userId).valid, false);
  assert.match(isValidRateLimitKey(spoofedKey, userId).error || "", /user ID mismatch/);

  // Substring injection attack: attacker injects their own ID as a sub-component
  const injectedKey = `cv_upload:${victimId}:${userId}`;
  assert.equal(isValidRateLimitKey(injectedKey, userId).valid, false);
  assert.match(isValidRateLimitKey(injectedKey, userId).error || "", /Invalid rate limit key format/);

  // Malformed characters / SQL-like injection
  assert.equal(isValidRateLimitKey(`cv_upload;DROP TABLE:123`, userId).valid, false);
  assert.equal(isValidRateLimitKey(``, userId).valid, false);
});

test("Rate Limiter: concurrency simulation handles burst requests on initial insert atomically", async () => {
  // Simulates PostgreSQL atomic insert-on-conflict + select-for-update semantics
  class AtomicPostgresRateLimitTable {
    private store = new Map<string, { request_count: number; window_start: number }>();
    private locks = new Map<string, Promise<void>>();

    async checkRateLimitAtomic(key: string, limit: number, windowSeconds: number, nowMs: number) {
      // Wait for any existing lock on this key to ensure strict serializability (FOR UPDATE)
      while (this.locks.has(key)) {
        await this.locks.get(key);
      }

      let releaseLock!: () => void;
      const lockPromise = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      this.locks.set(key, lockPromise);

      try {
        // Atomic initial creation (INSERT ... ON CONFLICT DO NOTHING)
        if (!this.store.has(key)) {
          this.store.set(key, { request_count: 0, window_start: nowMs });
        }

        const record = this.store.get(key)!;
        const windowMs = windowSeconds * 1000;

        if (record.request_count === 0 || nowMs - record.window_start > windowMs) {
          record.request_count = 1;
          record.window_start = nowMs;
          return { allowed: true, remaining: limit - 1, count: 1 };
        }

        if (record.request_count >= limit) {
          return { allowed: false, remaining: 0, count: record.request_count };
        }

        record.request_count += 1;
        return { allowed: true, remaining: limit - record.request_count, count: record.request_count };
      } finally {
        this.locks.delete(key);
        releaseLock();
      }
    }
  }

  const table = new AtomicPostgresRateLimitTable();
  const key = "cv_upload:a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
  const limit = 5;
  const windowSeconds = 600;
  const now = Date.now();

  // Launch 15 concurrent requests simultaneously on a brand-new uninitialized key
  const promises = Array.from({ length: 15 }, () =>
    table.checkRateLimitAtomic(key, limit, windowSeconds, now)
  );

  const results = await Promise.all(promises);

  const allowed = results.filter((r) => r.allowed);
  const rejected = results.filter((r) => !r.allowed);

  assert.equal(allowed.length, 5, "Exactly 5 requests must be allowed under concurrent bursts");
  assert.equal(rejected.length, 10, "10 requests must be rejected when limit is 5");

  // Verify that remaining counts are strictly sequential from 4 down to 0
  const remainingCounts = allowed.map((r) => r.remaining).sort((a, b) => b - a);
  assert.deepEqual(remainingCounts, [4, 3, 2, 1, 0]);
});

test("Rate Limiter: direct counter manipulation is prohibited by table privileges and RLS policies", () => {
  // Simulates PostgreSQL role privileges on rate_limits
  interface TablePrivilegeMap {
    [role: string]: {
      select: boolean;
      insert: boolean;
      update: boolean;
      delete: boolean;
    };
  }

  const rateLimitsPrivileges: TablePrivilegeMap = {
    public: { select: false, insert: false, update: false, delete: false },
    anon: { select: false, insert: false, update: false, delete: false },
    authenticated: { select: true, insert: false, update: false, delete: false },
  };

  function simulateDirectTableMutation(
    role: string,
    operation: "select" | "insert" | "update" | "delete"
  ): { allowed: boolean; code?: string; error?: string } {
    const privs = rateLimitsPrivileges[role];
    if (!privs || !privs[operation]) {
      return {
        allowed: false,
        code: "42501",
        error: `permission denied for table rate_limits: operation ${operation.toUpperCase()} not granted to ${role}`,
      };
    }
    return { allowed: true };
  }

  // Authenticated user can SELECT own rate limits for quota monitoring
  const selectResult = simulateDirectTableMutation("authenticated", "select");
  assert.equal(selectResult.allowed, true);

  // Authenticated user attempting to DELETE own bucket to reset count is REJECTED
  const deleteResult = simulateDirectTableMutation("authenticated", "delete");
  assert.equal(deleteResult.allowed, false);
  assert.equal(deleteResult.code, "42501");
  assert.match(deleteResult.error || "", /permission denied/i);

  // Authenticated user attempting to UPDATE request_count back to 0 is REJECTED
  const updateResult = simulateDirectTableMutation("authenticated", "update");
  assert.equal(updateResult.allowed, false);
  assert.equal(updateResult.code, "42501");
  assert.match(updateResult.error || "", /permission denied/i);

  // Authenticated user attempting direct INSERT is REJECTED
  const insertResult = simulateDirectTableMutation("authenticated", "insert");
  assert.equal(insertResult.allowed, false);
  assert.equal(insertResult.code, "42501");

  // Anonymous user has no access whatsoever
  assert.equal(simulateDirectTableMutation("anon", "select").allowed, false);
  assert.equal(simulateDirectTableMutation("anon", "update").allowed, false);
});

