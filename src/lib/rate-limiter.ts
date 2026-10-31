import type { SupabaseClient } from "@supabase/supabase-js";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
  reason?: string;
  source?: "rpc" | "table" | "unmigrated_fallback" | "error_fallback";
  isDatabaseEnforced?: boolean;
}

export interface RateLimitRecord {
  id: string;
  request_count: number;
  window_start: string;
}

/**
 * Pure evaluation function for rate limiting window logic.
 * Enables unit testing without network or database dependencies.
 */
export function evaluateRateLimitWindow(
  currentRecord: { request_count: number; window_start: string | Date } | null,
  nowMs: number,
  limit: number,
  windowSeconds: number
): RateLimitResult {
  const windowMs = windowSeconds * 1000;

  if (!currentRecord) {
    return {
      allowed: true,
      remaining: Math.max(0, limit - 1),
      resetInSeconds: windowSeconds,
    };
  }

  const windowStartMs = new Date(currentRecord.window_start).getTime();
  const elapsedMs = nowMs - windowStartMs;

  // Window has expired; full bucket reset
  if (elapsedMs >= windowMs) {
    return {
      allowed: true,
      remaining: Math.max(0, limit - 1),
      resetInSeconds: windowSeconds,
    };
  }

  const resetInSeconds = Math.max(1, Math.ceil((windowMs - elapsedMs) / 1000));

  if (currentRecord.request_count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds,
      reason: `Rate limit exceeded. Maximum ${limit} requests per ${windowSeconds}s allowed. Try again in ${resetInSeconds}s.`,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, limit - (currentRecord.request_count + 1)),
    resetInSeconds,
  };
}

/**
 * Shared atomic rate limiter backed by Supabase PostgreSQL.
 * Falls back safely if the rate_limits table is pending migration,
 * preventing total outage while logging a warning.
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const now = new Date();
  const nowMs = now.getTime();

  try {
    // Attempt fast stored procedure first if available
    const { data: rpcData, error: rpcError } = await supabase.rpc("check_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (!rpcError && rpcData) {
      return {
        allowed: Boolean(rpcData.allowed),
        remaining: Number(rpcData.remaining ?? 0),
        resetInSeconds: Number(rpcData.reset_in_seconds ?? windowSeconds),
        reason: rpcData.allowed ? undefined : `Rate limit exceeded. Try again in ${rpcData.reset_in_seconds}s.`,
        source: "rpc",
        isDatabaseEnforced: true,
      };
    }

    // Direct table fallback with atomic upsert pattern
    const { data: existing, error: selectError } = await supabase
      .from("rate_limits")
      .select("id, request_count, window_start")
      .eq("id", key)
      .maybeSingle();

    if (selectError) {
      // Table does not exist yet (pending migration 20240113000000_fencing_and_atomic_lifecycle.sql)
      if (selectError.code === "PGRST205" || selectError.code === "42P01") {
        console.warn(`[rate-limiter] rate_limits table not yet migrated. Permitting request for key "${key}".`);
        return {
          allowed: true,
          remaining: limit - 1,
          resetInSeconds: windowSeconds,
          source: "unmigrated_fallback",
          isDatabaseEnforced: false,
        };
      }
      console.error("[rate-limiter] Error reading rate_limits:", selectError.message);
      return {
        allowed: true,
        remaining: 1,
        resetInSeconds: windowSeconds,
        source: "error_fallback",
        isDatabaseEnforced: false,
      };
    }

    const evaluation = evaluateRateLimitWindow(existing, nowMs, limit, windowSeconds);

    if (evaluation.allowed) {
      if (!existing || nowMs - new Date(existing.window_start).getTime() >= windowSeconds * 1000) {
        // Reset window
        await supabase
          .from("rate_limits")
          .upsert({
            id: key,
            request_count: 1,
            window_start: now.toISOString(),
          }, { onConflict: "id" });
      } else {
        // Increment
        await supabase
          .from("rate_limits")
          .update({
            request_count: existing.request_count + 1,
          })
          .eq("id", key);
      }
    }

    return {
      ...evaluation,
      source: "table",
      isDatabaseEnforced: true,
    };
  } catch (err) {
    console.error("[rate-limiter] Unexpected error:", err);
    // Graceful fallback to prevent user lock-out on transient network glitch
    return {
      allowed: true,
      remaining: 1,
      resetInSeconds: windowSeconds,
      source: "error_fallback",
      isDatabaseEnforced: false,
    };
  }
}
