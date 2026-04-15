/**
 * Visitor Identification — Business logic for IP-to-company enrichment.
 * Uses IPinfo API for reverse IP lookup.
 */

import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { getDecryptedCredentials } from "@/lib/connections";

export interface IPInfoCompanyResult {
  ip: string;
  hostname?: string;
  company?: {
    name: string;
    domain: string;
    type: string; // "isp" | "business" | "education" | "hosting"
  };
  city?: string;
  region?: string;
  country?: string;
  // Free-tier fields:
  org?: string; // "AS15169 Google LLC"
  postal?: string;
  loc?: string; // "lat,lng"
  timezone?: string;
}

// Lowercase substrings that mark a company name as a consumer ISP, mobile
// carrier, hosting provider, or VPN — visitors from these IPs aren't a
// "lead" because the IP doesn't represent the underlying business.
const ISP_AND_CARRIER_KEYWORDS = [
  // US consumer ISPs
  "comcast", "spectrum", "charter", "cox communications", "verizon",
  "at&t", "atlantic broadband", "altice", "optimum", "frontier",
  "centurylink", "windstream", "mediacom", "wow! internet", "earthlink",
  "rcn corp", "consolidated communications", "midco", "ziply fiber",
  "armstrong cable", "wave broadband", "grande communications", "sonic",
  // Canadian ISPs
  "bell canada", "rogers communications", "telus", "shaw communications",
  "videotron", "cogeco", "fido", "freedom mobile",
  // EU / UK ISPs
  "vodafone", "deutsche telekom", "orange", "telefonica", "bt group",
  "british telecommunications", "virgin media", "sky uk", "talktalk",
  "free sas", "swisscom", "kpn", "telia",
  // Mobile / wireless carriers
  "t-mobile", "sprint", "u.s. cellular", "tmobile", "boost mobile",
  "cricket wireless", "metro by t-mobile", "google fi",
  // Cloud / hosting (not legitimate B2B visitors)
  "amazon.com", "amazon technologies", "amazon data services",
  "google llc", "google cloud", "microsoft corporation",
  "microsoft azure", "digitalocean", "linode", "hetzner",
  "ovh sas", "ovh hosting", "vultr", "cloudflare", "fastly",
  "akamai", "alibaba cloud", "tencent", "oracle cloud",
  "godaddy", "hostgator", "bluehost", "namecheap", "dreamhost",
  "leaseweb", "scaleway", "contabo",
  // VPN / proxy
  "nordvpn", "expressvpn", "private internet access", "mullvad",
  "surfshark", "protonvpn", "windscribe", "ipvanish",
];

/**
 * Strip the leading "AS{number} " from an IPinfo `org` value.
 * "AS15169 Google LLC" → "Google LLC"
 */
function cleanOrgName(org: string): string {
  return org.replace(/^AS\d+\s+/i, "").trim();
}

/**
 * Pull a company name + domain from an IPinfo response, working across
 * Free (org-only) and Business (structured company) tiers.
 */
export function extractCompany(
  result: IPInfoCompanyResult,
): { name: string; domain?: string; companyType?: string } | null {
  // Business tier — structured field
  if (result.company?.name) {
    return {
      name: result.company.name,
      domain: result.company.domain || undefined,
      companyType: result.company.type,
    };
  }
  // Free tier — parse org string
  if (result.org) {
    const name = cleanOrgName(result.org);
    if (name) return { name };
  }
  return null;
}

/**
 * Check whether a name belongs to a consumer ISP / carrier / cloud / VPN
 * provider — visitors with these orgs aren't business prospects.
 */
export function isConsumerOrISP(
  name: string | undefined,
  companyType?: string,
): boolean {
  if (!name) return true;
  if (companyType === "isp" || companyType === "hosting") return true;
  const lower = name.toLowerCase();
  return ISP_AND_CARRIER_KEYWORDS.some((kw) => lower.includes(kw));
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
 * Back-compat wrapper. Prefer extractCompany + isConsumerOrISP for new code.
 */
export function isConsumerISP(result: IPInfoCompanyResult): boolean {
  const company = extractCompany(result);
  if (!company) return true;
  return isConsumerOrISP(company.name, company.companyType);
}
