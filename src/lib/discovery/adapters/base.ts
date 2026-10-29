import type { DiscoveryLead } from "../types.ts";

/**
 * Base abstract provider class with rate-limiting, timeouts, retries, and error resilience.
 */
export abstract class BaseDiscoveryProvider {
  public abstract readonly id: string;
  public abstract readonly name: string;
  public abstract readonly rateLimitPerMinute: number;
  protected timeoutMs: number = 8000;

  /**
   * Safe fetch with timeout, user-agent, and exponential backoff retry.
   */
  protected async fetchWithRetry(
    url: string,
    options: RequestInit = {},
    maxRetries: number = 2
  ): Promise<Response> {
    let lastError: Error | null = null;
    let delay = 500;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            "User-Agent": "SmartCVSender-DiscoveryEngine/1.0 (+https://smartcv.tn/bot-policy)",
            Accept: "application/json, text/html, application/xml;q=0.9",
            ...(options.headers || {}),
          },
        });

        clearTimeout(timer);

        // If rate-limited (HTTP 429), respect Retry-After or exponential backoff
        if (response.status === 429 && attempt < maxRetries) {
          const retryAfter = response.headers.get("Retry-After");
          const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : delay;
          await new Promise((res) => setTimeout(res, waitTime));
          delay *= 2;
          continue;
        }

        return response;
      } catch (err) {
        clearTimeout(timer);
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries) {
          await new Promise((res) => setTimeout(res, delay));
          delay *= 2;
        }
      }
    }

    throw lastError || new Error(`Échec de connexion après ${maxRetries} tentatives.`);
  }

  /**
   * Discovers and yields raw leads from the provider.
   */
  public abstract discoverLeads(): Promise<DiscoveryLead[]>;
}
