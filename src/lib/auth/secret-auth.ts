import crypto from "node:crypto";

/**
 * Compares two secrets in constant time using fixed-length SHA-256 digests.
 * Prevents timing side-channel attacks and handles unequal string lengths safely.
 */
export function constantTimeSecretMatch(
  provided: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (
    !provided ||
    !expected ||
    typeof provided !== "string" ||
    typeof expected !== "string"
  ) {
    return false;
  }

  const cleanProvided = provided.trim();
  const cleanExpected = expected.trim();

  if (cleanProvided.length === 0 || cleanExpected.length === 0) {
    return false;
  }

  const hashProvided = crypto.createHash("sha256").update(cleanProvided, "utf8").digest();
  const hashExpected = crypto.createHash("sha256").update(cleanExpected, "utf8").digest();

  return crypto.timingSafeEqual(hashProvided, hashExpected);
}
