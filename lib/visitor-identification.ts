/**
 * Visitor Identification — Business logic for IP-to-company enrichment.
 * Uses IPinfo API for reverse IP lookup.
 */

import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { getDecryptedCredentials } from "@/lib/connections";

interface IPInfoCompanyResult {
  ip: string;
  company?: {
    name: string;
    domain: string;
    type: string; // "isp" | "business" | "education" | "hosting"
  };
  city?: string;
  region?: string;
  country?: string;
  org?: string;
}

/**
 * Get the IPinfo API token from the connections hub.
 */
export async function getIPInfoToken(): Promise<string | null> {
  try {
    const convex = getConvexClient();
    // List all connections, then filter to ipinfo org-level
    const connections = await convex.query(api.apiConnections.list, {});
    const active = connections.find(
      (c: any) => c.platform === "ipinfo" && c.scope === "org" && c.status === "active"
    );
    if (!active) return null;

    const creds = await getDecryptedCredentials(active._id);
    return creds.apiKey || null;
  } catch {
    return null;
  }
}

/**
 * Batch lookup IPs via IPinfo batch endpoint.
 * Returns a map of IP -> IPInfoCompanyResult.
 */
export async function batchLookupIPs(
  ips: string[],
  token: string
): Promise<Map<string, IPInfoCompanyResult>> {
  const results = new Map<string, IPInfoCompanyResult>();

  if (ips.length === 0) return results;

  // IPinfo batch endpoint accepts up to 1000 IPs
  const batch = ips.slice(0, 1000);

  try {
    const res = await fetch(`https://ipinfo.io/batch?token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
    });

    if (!res.ok) {
      console.error(`IPinfo batch lookup failed: HTTP ${res.status}`);
      return results;
    }

    const data = await res.json();

    // Response is { "ip": { ...data }, "ip2": { ...data } }
    for (const [ip, info] of Object.entries(data)) {
      results.set(ip, info as IPInfoCompanyResult);
    }
  } catch (err) {
    console.error("IPinfo batch lookup error:", err);
  }

  return results;
}

/**
 * Single IP lookup via IPinfo.
 */
export async function lookupIP(
  ip: string,
  token: string
): Promise<IPInfoCompanyResult | null> {
  try {
    const res = await fetch(`https://ipinfo.io/${ip}?token=${token}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Determine employee count range from org string or IPinfo company data.
 */
export function parseEmployeeCount(companyType?: string): string | undefined {
  // IPinfo doesn't always provide employee count directly.
  // For now, return undefined and let Apollo/Hunter fill this in Phase 2.
  return undefined;
}

/**
 * Check if an IP lookup result represents a consumer ISP (not identifiable).
 */
export function isConsumerISP(result: IPInfoCompanyResult): boolean {
  if (!result.company) return true;
  return result.company.type === "isp";
}
