import "server-only";
import { getServiceRoleClient } from "./opportunities-manager.ts";

/**
 * Scoped, secure count-only query for public display on the landing page.
 * Returns strictly the integer count of active opportunities without exposing
 * any opportunity rows, columns, or candidate metadata to anonymous visitors.
 * 
 * If the privileged client is unavailable or the query fails, returns null
 * to prevent misleading fallbacks.
 */
export async function getActiveOpportunitiesPublicCount(): Promise<number | null> {
  const adminClient = getServiceRoleClient();
  if (!adminClient) {
    return null;
  }

  try {
    const { count, error } = await adminClient
      .from("opportunities")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true);

    if (error || typeof count !== "number") {
      return null;
    }

    return count;
  } catch {
    return null;
  }
}
