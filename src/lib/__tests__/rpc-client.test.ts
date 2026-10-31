import test from "node:test";
import assert from "node:assert/strict";
import {
  executeAtomicRpcWithRetry,
  isMissingRpcError,
  type SupabaseRpcResult,
} from "../rpc-client.ts";

test("RPC Client: handles successful RPC invocation", async () => {
  type TestPayload = { success: boolean; id: string };
  const mockRpc = async (): Promise<SupabaseRpcResult<TestPayload>> => ({
    data: { success: true, id: "test-app-123" },
    error: null,
  });

  const outcome = await executeAtomicRpcWithRetry<TestPayload>(mockRpc);
  assert.equal(outcome.status, "success");
  if (outcome.status === "success") {
    assert.equal(outcome.data.success, true);
    assert.equal(outcome.data.id, "test-app-123");
  }
});

test("RPC Client: detects missing database RPC (PGRST202) and prevents silent fallback", async () => {
  const missingRpc = async (): Promise<SupabaseRpcResult<Record<string, unknown>>> => ({
    data: null,
    error: {
      code: "PGRST202",
      message: "Could not find the function public.transition_application_status_atomic in the schema cache",
    },
  });

  assert.equal(isMissingRpcError({ code: "PGRST202", message: "Not found" }), true);
  assert.equal(isMissingRpcError({ code: "42883", message: "Undefined function" }), true);
  assert.equal(isMissingRpcError({ code: "42501", message: "Permission denied" }), false);

  const outcome = await executeAtomicRpcWithRetry(missingRpc, {
    rpcName: "transition_application_status_atomic",
  });

  assert.equal(outcome.status, "missing_rpc");
  if (outcome.status === "missing_rpc") {
    assert.match(outcome.error, /migration 007 must be executed first/i);
    assert.equal(outcome.code, "PGRST202");
  }
});

test("RPC Client: handles PL/pgSQL controlled JSON rejection ({ success: false, error: ... }) without throwing", async () => {
  const businessErrorRpc = async (): Promise<SupabaseRpcResult<{ success: boolean; error: string }>> => ({
    data: { success: false, error: "stale_fencing_token" },
    error: null,
  });

  const outcome = await executeAtomicRpcWithRetry(businessErrorRpc);
  assert.equal(outcome.status, "business_error");
  if (outcome.status === "business_error") {
    assert.equal(outcome.error, "stale_fencing_token");
  }
});

test("RPC Client: retries on retryable PostgreSQL concurrency codes (40P01, 40001, 55P03)", async () => {
  let callCount = 0;
  const transientDeadlockRpc = async (): Promise<SupabaseRpcResult<{ success: boolean }>> => {
    callCount++;
    if (callCount < 3) {
      return {
        data: null,
        error: { code: "40P01", message: "deadlock detected" },
      };
    }
    return { data: { success: true }, error: null };
  };

  const outcome = await executeAtomicRpcWithRetry(transientDeadlockRpc, {
    maxRetries: 3,
    initialDelayMs: 5,
  });

  assert.equal(callCount, 3);
  assert.equal(outcome.status, "success");
});

test("RPC Client: retries on transient application concurrency errors (concurrency_conflict)", async () => {
  let callCount = 0;
  const transientAppConflict = async (): Promise<SupabaseRpcResult<{ success: boolean; error?: string }>> => {
    callCount++;
    if (callCount === 1) {
      return {
        data: { success: false, error: "concurrency_conflict" },
        error: null,
      };
    }
    return { data: { success: true }, error: null };
  };

  const outcome = await executeAtomicRpcWithRetry(transientAppConflict, {
    maxRetries: 3,
    initialDelayMs: 5,
  });

  assert.equal(callCount, 2);
  assert.equal(outcome.status, "success");
});

test("RPC Client: fails with max_retries_exceeded when concurrency deadlock persists", async () => {
  const persistentDeadlockRpc = async (): Promise<SupabaseRpcResult<Record<string, unknown>>> => ({
    data: null,
    error: { code: "40P01", message: "deadlock detected" },
  });

  const outcome = await executeAtomicRpcWithRetry(persistentDeadlockRpc, {
    maxRetries: 3,
    initialDelayMs: 2,
  });

  assert.equal(outcome.status, "max_retries_exceeded");
  if (outcome.status === "max_retries_exceeded") {
    assert.equal(outcome.attempts, 3);
  }
});

test("RPC Client: does NOT retry non-retryable authorization or validation errors", async () => {
  let callCount = 0;
  const authDeniedRpc = async (): Promise<SupabaseRpcResult<Record<string, unknown>>> => {
    callCount++;
    return {
      data: null,
      error: { code: "42501", message: "permission denied for table applications" },
    };
  };

  const outcome = await executeAtomicRpcWithRetry(authDeniedRpc, { maxRetries: 3 });
  assert.equal(callCount, 1, "Must immediately fail without retrying auth violations");
  assert.equal(outcome.status, "database_error");
});

test("RPC Client: prevents retries when side effects have already occurred", async () => {
  let callCount = 0;
  const sideEffectRpc = async (): Promise<SupabaseRpcResult<Record<string, unknown>>> => {
    callCount++;
    return {
      data: null,
      error: { code: "40P01", message: "deadlock detected" },
    };
  };

  const outcome = await executeAtomicRpcWithRetry(sideEffectRpc, {
    maxRetries: 3,
    hasSideEffectsOccurred: true, // Side effect already happened
  });

  assert.equal(callCount, 1, "Must not retry once side effects have occurred");
  assert.equal(outcome.status, "database_error");
});
