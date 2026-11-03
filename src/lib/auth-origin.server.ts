import "server-only";
import { headers } from "next/headers";
import { resolveSafeOriginFromHeaders } from "./auth-utils.ts";

/**
 * Safely resolves the application origin on the server side using incoming
 * request headers validated against the explicit allowlist.
 */
export async function getServerSafeAppOrigin(): Promise<string> {
  try {
    const headersList = await headers();
    return resolveSafeOriginFromHeaders(headersList);
  } catch {
    // If headers() is called outside a request context, fallback safely
    return resolveSafeOriginFromHeaders(null);
  }
}
