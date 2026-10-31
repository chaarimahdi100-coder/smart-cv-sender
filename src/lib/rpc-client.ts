/**
 * Supabase RPC Client & Concurrency Retry Engine
 *
 * Implements robust error handling and bounded retries for PostgREST RPC executions:
 * - Supabase RPC calls return `{ data, error }` without throwing runtime exceptions.
 * - PL/pgSQL functions returning JSONB `{ success: false, error: ... }` resolve as HTTP 200 OK.
 * - Intercepts retryable PostgreSQL concurrency codes ('40P01' Deadlock, '40001' Serialization, '55P03' Lock Timeout).
 * - Detects missing database RPCs ('PGRST202' / '42883') to prevent unsafe direct fallbacks.
 * - Enforces bounded retries with jittered exponential backoff.
 * - Prevents unsafe retries after external side effects.
 */

export interface PostgrestRpcError {
  code?: string;
  message: string;
  details?: string;
  hint?: string;
}

export type SupabaseRpcResult<T> = {
  data: T | null;
  error: PostgrestRpcError | null;
};

export interface RpcRetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  hasSideEffectsOccurred?: boolean;
  rpcName?: string;
}

export type RpcExecutionOutcome<T> =
  | { status: "success"; data: T }
  | { status: "business_error"; error: string; code?: string }
  | { status: "missing_rpc"; error: string; code: string }
  | { status: "database_error"; error: string; code?: string }
  | { status: "max_retries_exceeded"; error: string; attempts: number };

const RETRYABLE_PG_CODES = new Set([
  "40P01", // deadlock_detected
  "40001", // serialization_failure
  "55P03", // lock_not_available
]);

const RETRYABLE_APP_ERRORS = new Set([
  "concurrency_conflict",
  "lease_lock_timeout",
  "lock_timeout",
]);

/**
 * Checks if a PostgREST error indicates that the requested RPC does not exist in the database catalog.
 */
export function isMissingRpcError(error: PostgrestRpcError | null | undefined): boolean {
  if (!error) return false;
  return error.code === "PGRST202" || error.code === "42883";
}

/**
 * Executes a Supabase RPC with retry logic for transient concurrency conflicts.
 */
export async function executeAtomicRpcWithRetry<T extends { success?: boolean; error?: string }>(
  rpcFn: () => PromiseLike<unknown> | Promise<unknown>,
  options?: RpcRetryOptions
): Promise<RpcExecutionOutcome<T>> {
  const maxRetries = options?.maxRetries ?? 3;
  const initialDelay = options?.initialDelayMs ?? 50;
  const maxDelay = options?.maxDelayMs ?? 400;
  const rpcName = options?.rpcName || "rpc_call";

  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;

    let result: SupabaseRpcResult<T>;
    try {
      result = (await rpcFn()) as SupabaseRpcResult<T>;
    } catch (unexpectedErr) {
      const message = unexpectedErr instanceof Error ? unexpectedErr.message : "Unexpected RPC network error";
      return {
        status: "database_error",
        error: message,
      };
    }

    const { data, error } = result;

    // 1. Check for database / PostgREST level errors
    if (error) {
      if (isMissingRpcError(error)) {
        return {
          status: "missing_rpc",
          error: `Database RPC '${rpcName}' is not defined. Pending migration 007 must be executed first.`,
          code: error.code || "PGRST202",
        };
      }

      const isRetryablePg = error.code && RETRYABLE_PG_CODES.has(error.code);
      if (isRetryablePg && !options?.hasSideEffectsOccurred) {
        if (attempt < maxRetries) {
          const delay = Math.min(maxDelay, initialDelay * Math.pow(2, attempt - 1) + Math.random() * 25);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        return {
          status: "max_retries_exceeded",
          error: `Operation failed after ${maxRetries} attempts due to persistent concurrency deadlock: ${error.message}`,
          attempts: maxRetries,
        };
      }

      return {
        status: "database_error",
        error: error.message || "Database execution failed",
        code: error.code,
      };
    }

    // 2. Check for controlled PL/pgSQL JSON response { success: false, error: ... }
    if (data && data.success === false) {
      const appError = data.error || "Operation rejected by database";

      const isRetryableApp = RETRYABLE_APP_ERRORS.has(appError);
      if (isRetryableApp && !options?.hasSideEffectsOccurred) {
        if (attempt < maxRetries) {
          const delay = Math.min(maxDelay, initialDelay * Math.pow(2, attempt - 1) + Math.random() * 25);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        return {
          status: "max_retries_exceeded",
          error: `Operation failed after ${maxRetries} attempts due to persistent concurrency lock: ${appError}`,
          attempts: maxRetries,
        };
      }

      return {
        status: "business_error",
        error: appError,
      };
    }

    if (!data) {
      return {
        status: "database_error",
        error: "Database returned empty response",
      };
    }

    return {
      status: "success",
      data,
    };
  }

  return {
    status: "max_retries_exceeded",
    error: `Operation failed after ${maxRetries} attempts due to persistent concurrency lock.`,
    attempts: maxRetries,
  };
}
