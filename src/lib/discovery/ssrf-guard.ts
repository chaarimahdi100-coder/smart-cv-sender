import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";

/**
 * Server-Side Request Forgery (SSRF) Defense, DNS Rebinding Guard, and Safe HTTP Client.
 *
 * Ensures external opportunity URLs never target localhost, private cloud metadata endpoints,
 * RFC 1918 private subnets, link-local addresses, carrier-grade NAT, multicast, reserved ranges,
 * or non-HTTP protocols.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "metadata.google.internal",
  "instance-data",
]);

const BLOCKED_EXTENSIONS = [
  ".local",
  ".internal",
  ".lan",
  ".home",
  ".corp",
  ".test",
  ".invalid",
  ".example",
  ".arpa",
  ".onion",
  ".localdomain",
];

/**
 * Validates whether an IPv4 address belongs to a private, loopback, link-local,
 * multicast, carrier-grade NAT, or reserved/special network.
 */
export function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Fail closed on malformed IPv4
  }

  const [a, b, c] = parts;

  // 0.0.0.0/8 (Current network / "this" host / broadcast)
  if (a === 0) return true;
  // 10.0.0.0/8 (Private RFC 1918)
  if (a === 10) return true;
  // 100.64.0.0/10 (Shared Address Space / Carrier-Grade NAT RFC 6598: 100.64.0.0 - 100.127.255.255)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8 (Loopback RFC 1122)
  if (a === 127) return true;
  // 169.254.0.0/16 (Link-local RFC 3927 / Cloud metadata: 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 (Private RFC 1918: 172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (a === 192 && b === 0 && c === 0) return true;
  // 192.0.2.0/24 (TEST-NET-1 documentation)
  if (a === 192 && b === 0 && c === 2) return true;
  // 192.88.99.0/24 (6to4 Relay Anycast RFC 3068)
  if (a === 192 && b === 88 && c === 99) return true;
  // 192.168.0.0/16 (Private RFC 1918)
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 (Benchmarking RFC 2544: 198.18.0.0 - 198.19.255.255)
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 198.51.100.0/24 (TEST-NET-2 documentation)
  if (a === 198 && b === 51 && c === 100) return true;
  // 203.0.113.0/24 (TEST-NET-3 documentation)
  if (a === 203 && b === 0 && c === 113) return true;
  // 224.0.0.0/4 (Multicast RFC 5771: 224.0.0.0 - 239.255.255.255)
  if (a >= 224 && a <= 239) return true;
  // 240.0.0.0/4 (Reserved for future use RFC 1112 + Broadcast 255.255.255.255)
  if (a >= 240) return true;

  return false;
}

/**
 * Parses any standard, compressed, or embedded IPv6 address into its 8 16-bit word integers.
 * Returns null if the address format is invalid, malformed, or ambiguous.
 */
export function parseIpv6ToWords(ip: string): number[] | null {
  if (!ip || typeof ip !== "string") return null;
  const clean = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!clean) return null;

  let head = clean;
  let tailWords: number[] = [];

  // Check if there is an embedded dotted-decimal IPv4 address at the end
  const lastColon = clean.lastIndexOf(":");
  if (lastColon !== -1) {
    const afterLastColon = clean.slice(lastColon + 1);
    if (afterLastColon.includes(".")) {
      const rawV4Parts = afterLastColon.split(".");
      if (rawV4Parts.length !== 4) return null;
      const v4Parts: number[] = [];
      for (let i = 0; i < 4; i++) {
        const rawPart = rawV4Parts[i];
        if (!/^\d+$/.test(rawPart)) return null;
        const num = parseInt(rawPart, 10);
        if (isNaN(num) || num < 0 || num > 255 || String(num) !== rawPart) return null;
        v4Parts.push(num);
      }
      tailWords = [
        ((v4Parts[0] << 8) | v4Parts[1]) >>> 0,
        ((v4Parts[2] << 8) | v4Parts[3]) >>> 0,
      ];
      head = clean.slice(0, lastColon);
      if (head.endsWith(":") && !head.endsWith("::")) {
        head += ":";
      }
    }
  }

  const isValidHexWord = (h: string) => /^[0-9a-f]{1,4}$/i.test(h);

  const doubleColonIndex = head.indexOf("::");
  if (doubleColonIndex !== -1) {
    if (head.indexOf("::", doubleColonIndex + 1) !== -1) return null; // Only one '::' permitted
    const leftPart = head.slice(0, doubleColonIndex);
    const rightPart = head.slice(doubleColonIndex + 2);

    const leftWordsRaw = leftPart ? leftPart.split(":") : [];
    const rightWordsRaw = rightPart ? rightPart.split(":") : [];

    if (leftWordsRaw.some((h) => !isValidHexWord(h))) return null;
    if (rightWordsRaw.some((h) => !isValidHexWord(h))) return null;

    const leftWords = leftWordsRaw.map((h) => parseInt(h, 16));
    const rightWords = rightWordsRaw.map((h) => parseInt(h, 16));

    const totalWords = leftWords.length + rightWords.length + tailWords.length;
    if (totalWords > 8) return null;
    const fillZeros = new Array(8 - totalWords).fill(0);
    return [...leftWords, ...fillZeros, ...rightWords, ...tailWords];
  } else {
    const wordsRaw = head.split(":");
    if (wordsRaw.some((h) => !isValidHexWord(h))) return null;
    const words = wordsRaw.map((h) => parseInt(h, 16));
    const combined = [...words, ...tailWords];
    if (combined.length !== 8) return null;
    return combined;
  }
}

/**
 * Validates whether an IPv6 address belongs to a loopback, unique-local, link-local,
 * multicast, IPv4-mapped, IPv4-compatible, NAT64, 6to4, Teredo, or reserved/special network.
 */
export function isPrivateIpv6(ip: string): boolean {
  const words = parseIpv6ToWords(ip);
  if (!words) {
    return true; // Fail closed on malformed or ambiguous IPv6
  }

  // 1. Unspecified address (::/128)
  if (words.every((w) => w === 0)) return true;

  // 2. Loopback address (::1/128)
  if (words.slice(0, 7).every((w) => w === 0) && words[7] === 1) return true;

  // Helper to reassemble embedded IPv4 from two 16-bit words
  const wordsToIpv4 = (w1: number, w2: number): string =>
    `${(w1 >> 8) & 0xff}.${w1 & 0xff}.${(w2 >> 8) & 0xff}.${w2 & 0xff}`;

  // 3. IPv4-compatible IPv6 (::/96) (RFC 4291)
  // Covers ::127.0.0.1, ::10.0.0.1, ::7f00:1, etc.
  if (words.slice(0, 6).every((w) => w === 0)) {
    return isPrivateIpv4(wordsToIpv4(words[6], words[7]));
  }

  // 4. IPv4-mapped IPv6 (::ffff:0:0/96) (RFC 4291)
  // Covers ::ffff:127.0.0.1, ::ffff:10.0.0.1, ::ffff:7f00:1, etc.
  if (words.slice(0, 5).every((w) => w === 0) && words[5] === 0xffff) {
    return isPrivateIpv4(wordsToIpv4(words[6], words[7]));
  }

  // 5. NAT64 prefixes (RFC 6052, RFC 8215)
  // 5a. Local-use NAT64 prefix (64:ff9b:1::/48) is strictly local-use / non-public (RFC 8215)
  if (words[0] === 0x0064 && words[1] === 0xff9b && words[2] === 0x0001) {
    return true;
  }

  // 5b. Well-known NAT64 prefix (64:ff9b::/96) (RFC 6052)
  if (
    words[0] === 0x0064 &&
    words[1] === 0xff9b &&
    words[2] === 0 &&
    words[3] === 0 &&
    words[4] === 0 &&
    words[5] === 0
  ) {
    return isPrivateIpv4(wordsToIpv4(words[6], words[7]));
  }

  // 5c. Any other 64:ff9b:: sub-allocations are reserved / non-public
  if (words[0] === 0x0064 && words[1] === 0xff9b) {
    return true;
  }

  // 6. Unique Local Addresses (ULA: fc00::/7 - fc00: through fdff:) (RFC 4193)
  if ((words[0] & 0xfe00) === 0xfc00) return true;

  // 7. Link-local unicast (fe80::/10 - fe80: through febf:) (RFC 4291)
  if ((words[0] & 0xffc0) === 0xfe80) return true;

  // 8. Multicast (ff00::/8) (RFC 4291)
  if ((words[0] & 0xff00) === 0xff00) return true;

  // 9. Documentation prefix (2001:db8::/32) (RFC 3849)
  if (words[0] === 0x2001 && words[1] === 0x0db8) return true;

  // 10. Discard Prefix (100::/64) (RFC 6666)
  if (words[0] === 0x0100 && words[1] === 0 && words[2] === 0 && words[3] === 0) return true;

  // 11. 6to4 Relay Anycast (2002::/16) (RFC 3056)
  if (words[0] === 0x2002) {
    return isPrivateIpv4(wordsToIpv4(words[1], words[2]));
  }

  // 12. Teredo tunneling (2001:0000::/32) (RFC 4380)
  if (words[0] === 0x2001 && words[1] === 0x0000) {
    const serverV4 = wordsToIpv4(words[2], words[3]);
    if (isPrivateIpv4(serverV4)) return true;
    const clientWord6 = words[6] ^ 0xffff;
    const clientWord7 = words[7] ^ 0xffff;
    const clientV4 = wordsToIpv4(clientWord6, clientWord7);
    if (isPrivateIpv4(clientV4)) return true;
  }

  // 13. Benchmarking (2001:2::/48) (RFC 5180)
  if (words[0] === 0x2001 && words[1] === 0x0002) return true;

  // 14. ORCHIDv2 (2001:20::/28) (RFC 7343)
  if (words[0] === 0x2001 && (words[1] & 0xfff0) === 0x0020) return true;

  return false;
}

/**
 * Checks if a given IP address (v4 or v6) is non-public, private, loopback, or reserved.
 */
export function isPrivateOrNonPublicIp(ip: string): boolean {
  if (!ip || typeof ip !== "string") return true;
  const cleanIp = ip.trim().replace(/^\[|\]$/g, "");
  const family = net.isIP(cleanIp);
  if (family === 4) return isPrivateIpv4(cleanIp);
  if (family === 6) return isPrivateIpv6(cleanIp);
  const words = parseIpv6ToWords(cleanIp);
  if (words) {
    return isPrivateIpv6(cleanIp);
  }
  return true; // Not a valid IP format, fail closed
}

/**
 * Validates whether a target URL is safe to fetch from server-side processes.
 * Enforces strict protocol, port, hostname, userinfo, and static IP filtering.
 */
export function isSafePublicHttpUrl(urlString: string, allowLoopback: boolean = false): boolean {
  if (!urlString || typeof urlString !== "string") return false;

  let parsed: URL;
  try {
    parsed = new URL(urlString.trim());
  } catch {
    return false;
  }

  // 1. Protocol must strictly be http: or https:
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  // 2. Reject credentials in URL (e.g. http://user:pass@evil.com)
  if (parsed.username || parsed.password) {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase().trim();
  const rawCleanHost = hostname.replace(/^\[|\]$/g, "");
  let ipFamily = net.isIP(rawCleanHost);
  if (ipFamily === 0 && parseIpv6ToWords(rawCleanHost)) {
    ipFamily = 6;
  }

  // 3. Port restrictions: allow only standard web ports (80, 443) unless explicitly allowed in test runner
  const isLoopbackTarget = hostname === "localhost" || rawCleanHost === "127.0.0.1" || rawCleanHost === "::1";
  const permitLocalPort = allowLoopback && isLoopbackTarget;

  if (parsed.port && parsed.port !== "80" && parsed.port !== "443" && !permitLocalPort) {
    return false;
  }

  // 4. Reject known dangerous hostnames unless explicitly allowed in test runner
  if (BLOCKED_HOSTNAMES.has(hostname) && !permitLocalPort) {
    return false;
  }

  // 5. Reject private domain suffixes
  for (const ext of BLOCKED_EXTENSIONS) {
    if (hostname.endsWith(ext)) return false;
  }

  // 6. Direct IP addresses check
  if (ipFamily !== 0) {
    if (isLoopbackTarget && permitLocalPort) {
      // Loopback allowed specifically for local test server
    } else if (isPrivateOrNonPublicIp(hostname)) {
      return false;
    }
  }

  // 7. Check for raw numeric dword or hex hostnames not fully caught by URL parser
  if (/^0x[0-9a-f]+$/i.test(hostname) || /^\d+$/.test(hostname)) {
    return false;
  }

  // 8. Domain name must contain at least one dot (e.g., example.com) and valid label chars
  // Direct IPv6 hostnames do not contain dots, so rule applies only when ipFamily === 0
  if (ipFamily === 0 && !permitLocalPort && !hostname.includes(".")) {
    return false;
  }

  // 9. Hostname must not contain whitespace or forbidden control characters
  if (/[\s\r\n\t]/.test(hostname)) {
    return false;
  }

  return true;
}

export interface SafeFetchOptions {
  maxRedirects?: number;
  maxBytes?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /**
   * Internal test flag strictly scoped to test runner environment.
   * Allows connecting to temporary local test servers on loopback ports.
   */
  allowLoopbackForTesting?: boolean;
}

export interface SafeFetchResponse {
  ok: boolean;
  status: number;
  html: string;
  finalUrl: string;
  redirectCount: number;
  truncated: boolean;
}

/**
 * Secure HTTP client for fetching external URLs with:
 * - Connection-level IP validation in lookup callback (DNS rebinding defense)
 * - Socket-level remoteAddress inspection before body ingestion
 * - Strict redirect limits with mandatory re-validation of each redirect target
 * - Bounded streaming strictly limited to maxBytes (default 512 KB) to prevent memory exhaustion
 * - Fail-closed security architecture
 */
export async function safeFetchPublicUrl(
  initialUrl: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResponse> {
  const maxRedirects = options.maxRedirects ?? 3;
  const maxBytes = options.maxBytes ?? 512 * 1024; // 512 KB
  const timeoutMs = options.timeoutMs ?? 8000;

  const isTestRunner = process.env.NODE_ENV === "test" || Boolean(process.env.NODE_TEST_CONTEXT);
  const allowLoopback = Boolean(options.allowLoopbackForTesting && isTestRunner);

  let currentUrl = initialUrl.trim();
  let redirectCount = 0;

  while (true) {
    if (!isSafePublicHttpUrl(currentUrl, allowLoopback)) {
      throw new Error(`SSRF blocked: URL target is forbidden or non-public (${currentUrl})`);
    }

    const parsed = new URL(currentUrl);
    const isHttps = parsed.protocol === "https:";
    const client = isHttps ? https : http;

    const response = await new Promise<{
      status: number;
      headers: http.IncomingHttpHeaders;
      body: string;
      truncated: boolean;
    }>((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void) => {
        if (!settled) {
          settled = true;
          fn();
        }
      };

      const req = client.request(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: "GET",
          headers: {
            "User-Agent":
              options.headers?.["User-Agent"] ||
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 SmartCV-Importer/1.0",
            Accept: options.headers?.Accept || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            ...options.headers,
          },
          // Connection-level DNS resolution guard
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          lookup: (lookupHostname: string, lookupOpts: any, callback: any) => {
            dns.lookup(lookupHostname, lookupOpts, (err, address, family) => {
              if (err) return callback(err, address, family);

              const isIpAllowed = (targetIp: string): boolean => {
                if (allowLoopback) {
                  const clean = targetIp.trim().replace(/^\[|\]$/g, "");
                  if (
                    clean === "127.0.0.1" ||
                    clean === "::1" ||
                    clean.startsWith("127.") ||
                    clean === "::ffff:127.0.0.1"
                  ) {
                    return true;
                  }
                }
                return !isPrivateOrNonPublicIp(targetIp);
              };

              if (Array.isArray(address)) {
                for (const entry of address) {
                  const targetIp = typeof entry === "string" ? entry : (entry as { address?: string })?.address;
                  if (!targetIp || !isIpAllowed(targetIp)) {
                    return callback(
                      new Error(`SSRF blocked: Host ${lookupHostname} resolved to non-public IP ${targetIp}`),
                      "",
                      family
                    );
                  }
                }
                return callback(null, address, family);
              }

              const targetIp = typeof address === "string" ? address : (address as { address?: string })?.address;
              if (!targetIp || !isIpAllowed(targetIp)) {
                return callback(
                  new Error(`SSRF blocked: Host ${lookupHostname} resolved to non-public IP ${targetIp}`),
                  "",
                  family
                );
              }
              callback(null, address, family);
            });
          },
        },
        (res) => {
          // Socket remoteAddress validation immediately upon connection
          const remoteIp = res.socket?.remoteAddress;
          if (remoteIp) {
            const isAllowed = allowLoopback
              ? (remoteIp === "127.0.0.1" ||
                 remoteIp === "::1" ||
                 remoteIp.startsWith("127.") ||
                 remoteIp === "::ffff:127.0.0.1" ||
                 !isPrivateOrNonPublicIp(remoteIp))
              : !isPrivateOrNonPublicIp(remoteIp);
            if (!isAllowed) {
              res.socket.destroy();
              finish(() =>
                reject(new Error(`SSRF blocked: Socket connected to non-public IP ${remoteIp}`))
              );
              return;
            }
          }

          const statusCode = res.statusCode || 200;

          // If redirect response, discard body and resolve immediately for outer loop
          if ([301, 302, 303, 307, 308].includes(statusCode)) {
            res.resume();
            finish(() =>
              resolve({
                status: statusCode,
                headers: res.headers,
                body: "",
                truncated: false,
              })
            );
            return;
          }

          // Bounded body streaming
          let totalBytes = 0;
          const chunks: Buffer[] = [];
          let wasTruncated = false;

          res.on("data", (chunk: Buffer) => {
            totalBytes += chunk.length;
            if (totalBytes > maxBytes) {
              wasTruncated = true;
              const remaining = Math.max(0, maxBytes - (totalBytes - chunk.length));
              if (remaining > 0) {
                chunks.push(chunk.subarray(0, remaining));
              }
              res.destroy(); // Cease receiving data from socket immediately
              finish(() =>
                resolve({
                  status: statusCode,
                  headers: res.headers,
                  body: Buffer.concat(chunks).toString("utf-8"),
                  truncated: true,
                })
              );
              return;
            }
            chunks.push(chunk);
          });

          res.on("end", () => {
            finish(() =>
              resolve({
                status: statusCode,
                headers: res.headers,
                body: Buffer.concat(chunks).toString("utf-8"),
                truncated: wasTruncated,
              })
            );
          });

          res.on("error", (err) => {
            finish(() => reject(err));
          });
        }
      );

      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
      });

      if (options.signal) {
        options.signal.addEventListener("abort", () => {
          req.destroy(new Error("Request aborted by caller"));
        });
      }

      req.on("error", (err) => {
        finish(() => reject(err));
      });

      req.end();
    });

    // Check for redirect status
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.location;
      if (!location) {
        return {
          ok: false,
          status: response.status,
          html: "",
          finalUrl: currentUrl,
          redirectCount,
          truncated: false,
        };
      }

      redirectCount++;
      if (redirectCount > maxRedirects) {
        throw new Error(`SSRF safety: Exceeded maximum redirect limit of ${maxRedirects}`);
      }

      const nextUrl = new URL(location, currentUrl).toString();
      if (!isSafePublicHttpUrl(nextUrl, allowLoopback)) {
        throw new Error(`SSRF blocked: Redirect target is forbidden or non-public (${nextUrl})`);
      }

      currentUrl = nextUrl;
      continue;
    }

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      html: response.body,
      finalUrl: currentUrl,
      redirectCount,
      truncated: response.truncated,
    };
  }
}

