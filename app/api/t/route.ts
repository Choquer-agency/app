import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { createHash } from "crypto";
import {
  getIPInfoToken,
  lookupIP,
  extractCompany,
  isConsumerOrISP,
} from "@/lib/visitor-identification";
import { notifyHighIntentVisitor } from "@/lib/notification-triggers";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// In-memory cache for site keys (avoids DB lookup on every hit)
const siteKeyCache = new Map<string, { id: string; excludedIps: string[]; active: boolean; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

function hashFingerprint(ip: string, ua: string): string {
  return createHash("sha256").update(`${ip}|${ua}`).digest("hex");
}

function parseUserAgent(ua: string): { device: string; browser: string; os: string } {
  const device = /Mobile|Android|iPhone|iPad/i.test(ua)
    ? /iPad|Tablet/i.test(ua) ? "tablet" : "mobile"
    : "desktop";

  let browser = "unknown";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua)) browser = "Safari";

  let os = "unknown";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iOS|iPhone|iPad/i.test(ua)) os = "iOS";

  return { device, browser, os };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sk, type } = body;
    if (!sk) {
      return new NextResponse(null, { status: 400, headers: corsHeaders });
    }

    const convex = getConvexClient();

    // Validate site key (cached)
    let siteInfo = siteKeyCache.get(sk);
    if (!siteInfo || Date.now() - siteInfo.ts > CACHE_TTL) {
      const site = await convex.query(api.trackedSites.getByKey, { siteKey: sk });
      if (!site || !site.active) {
        return new NextResponse(null, { status: 404, headers: corsHeaders });
      }
      siteInfo = {
        id: site._id,
        excludedIps: (site.excludedIps as string[]) || [],
        active: site.active,
        ts: Date.now(),
      };
      siteKeyCache.set(sk, siteInfo);
    }

    // Extract IP
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
    const ua = request.headers.get("user-agent") || "";

    // Check excluded IPs
    if (siteInfo.excludedIps.includes(ip)) {
      return new NextResponse(null, { status: 204, headers: corsHeaders });
    }

    const ipHash = hashIp(ip);
    const fingerprint = hashFingerprint(ip, ua);
    const { device, browser, os } = parseUserAgent(ua);
    const timestamp = body.ts || new Date().toISOString();

    // Duration update — just update the latest page view for this session
    if (type === "duration") {
      // For duration updates, we just track that the visitor is still active
      // The actual duration is sent with the page view
      return new NextResponse(null, { status: 204, headers: corsHeaders });
    }

    // Upsert visitor + get intent info
    const visitorResult = await convex.mutation(api.siteVisitors.upsertByFingerprint, {
      siteId: siteInfo.id as any,
      fingerprint,
      ipHash,
      device,
      browser,
      os,
      timestamp,
    });

    // Create page view
    await convex.mutation(api.sitePageViews.create, {
      siteId: siteInfo.id as any,
      visitorId: visitorResult.id as any,
      url: body.u || "",
      path: body.p || "/",
      title: body.t,
      referrer: body.r,
      utmSource: body.utm_s,
      utmMedium: body.utm_m,
      utmCampaign: body.utm_c,
      sessionId: body.sid || fingerprint,
      durationSeconds: body.d,
      timestamp,
    });

    // Real-time IP enrichment for new visitors (best-effort, non-blocking for UX)
    if (visitorResult.isNew && ip !== "unknown") {
      let enriched = false;
      try {
        // Check IP cache first
        const cached = await convex.query(api.ipLookupCache.lookup, { ipHash });
        if (cached) {
          // Link cached company + apply any cached location to the visitor.
          const cachedRaw = (cached.raw || {}) as {
            city?: string;
            region?: string;
            country?: string;
          };
          await convex.mutation(api.siteVisitors.applyEnrichment, {
            id: visitorResult.id as any,
            companyId: cached.companyId && !cached.isIsp ? cached.companyId : undefined,
            country: cachedRaw.country,
            region: cachedRaw.region,
            city: cachedRaw.city,
          });
          enriched = true;
        } else {
          // Try real-time IPinfo lookup
          const token = await getIPInfoToken();
          if (token) {
            const ipData = await lookupIP(ip, token);
            if (ipData) {
              const company = extractCompany(ipData);
              const isp = isConsumerOrISP(company?.name, company?.companyType);
              let companyId: string | undefined = undefined;

              if (!isp && company) {
                companyId = (await convex.mutation(api.identifiedCompanies.upsertByDomain, {
                  name: company.name,
                  domain: company.domain,
                  source: "ipinfo",
                  city: ipData.city,
                  region: ipData.region,
                  country: ipData.country,
                })) as unknown as string;
              }

              // Save location + (optional) company on the visitor in one patch.
              await convex.mutation(api.siteVisitors.applyEnrichment, {
                id: visitorResult.id as any,
                companyId: companyId as any,
                country: ipData.country,
                region: ipData.region,
                city: ipData.city,
              });

              // Cache the result for next time.
              await convex.mutation(api.ipLookupCache.upsert, {
                ipHash,
                companyId: companyId as any,
                raw: ipData,
                isIsp: isp,
              });
              enriched = true;
            }
          }
        }
      } catch (err) {
        console.error("IP enrichment error (non-fatal):", err);
      }

      // If real-time enrichment didn't run (no token, lookup failed, rate limited,
      // etc.), stash the raw IP so the enrichment cron can batch-lookup later.
      if (!enriched) {
        try {
          await convex.mutation(api.ipLookupCache.queueRawIp, { ipHash, rawIp: ip });
        } catch (err) {
          console.error("Failed to queue raw IP for cron enrichment:", err);
        }
      }
    }

    // High-intent alert — only for IDENTIFIED companies. Unknown visitors are silent.
    if (
      visitorResult.intentLevel === "high_intent" &&
      visitorResult.previousIntent !== "high_intent" &&
      visitorResult.companyId
    ) {
      const shouldAlert =
        !visitorResult.lastAlertedAt ||
        Date.now() - new Date(visitorResult.lastAlertedAt).getTime() > 24 * 60 * 60 * 1000;

      if (shouldAlert) {
        try {
          const members = await convex.query(api.teamMembers.list, { activeOnly: true });
          const admins = (members as any[]).filter(
            (m) => m.roleLevel === "owner" || m.roleLevel === "c_suite"
          );

          const company = await convex.query(api.identifiedCompanies.get, {
            id: visitorResult.companyId as any,
          });
          const companyName = company?.name || "An identified company";

          for (const admin of admins) {
            await notifyHighIntentVisitor(
              admin._id,
              admin.roleLevel,
              companyName,
              visitorResult.visitCount ?? 1,
              body.p || "/"
            );
          }

          await convex.mutation(api.siteVisitors.updateAlertedAt, {
            id: visitorResult.id as any,
            lastAlertedAt: new Date().toISOString(),
          });
        } catch (err) {
          console.error("Failed to send high-intent alert:", err);
        }
      }
    }

    return new NextResponse(null, { status: 204, headers: corsHeaders });
  } catch (err) {
    console.error("Tracking ingest error:", err);
    return new NextResponse(null, { status: 500, headers: corsHeaders });
  }
}
