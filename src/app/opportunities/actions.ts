"use server";

import { seedTunisianOpportunitiesAction } from "./manage-actions";

/**
 * Backwards-compatible wrapper delegating to seedTunisianOpportunitiesAction.
 * Strictly enforces manager authorization via isAuthorizedOpportunityManager.
 */
export async function seedDemoOpportunities(): Promise<{
  success?: boolean;
  message?: string;
  error?: string;
}> {
  return seedTunisianOpportunitiesAction();
}

export async function seedDemoOpportunitiesAction(): Promise<void> {
  await seedDemoOpportunities();
}
