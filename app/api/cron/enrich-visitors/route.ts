import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import {
  getIPInfoToken,
  batchLookupIPs,
  isConsumerISP,
} from "@/lib/visitor-identification";

export async function GET(request: NextRequest) {
  // Verify cron secret (skip in dev for manual testing)
  const authHeader = request.headers.get("authorization");
  const isDev = process.env.NODE_ENV === "development";

  if (!isDev && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = await getIPInfoToken();
  if (!token) {
    return NextResponse.json({
      message: "IPinfo not configured — add API key in Settings > Connections",
      enriched: 0,
    });
  }

  const convex = getConvexClient();

  try {
    // 1. Pull all pending raw IPs queued by the ingest endpoint.
    const pending = await convex.query(api.ipLookupCache.listPendingRawIps, {
      limit: 1000,
    });

    if (pending.length === 0) {
      return NextResponse.json({
        message: "No pending IPs to enrich",
        enriched: 0,
        skipped: 0,
        batchSize: 0,
      });
    }

    // 2. Batch lookup via IPinfo (unique raw IPs only).
    const uniqueRawIps = Array.from(
      new Set(pending.map((p: any) => p.rawIp as string)),
    );
    const lookupResults = await batchLookupIPs(uniqueRawIps, token);

    // 3. Resolve each pending cache row → upsert company, cache result, purge raw IP.
    const ipHashToCompanyId = new Map<string, string | null>();
    let companiesCreated = 0;
    let ispFiltered = 0;

    for (const row of pending as any[]) {
      const result = lookupResults.get(row.rawIp);

      if (!result) {
        // Lookup failed — purge the raw IP so we don't retry forever.
        await convex.mutation(api.ipLookupCache.purgeRawIp, { id: row._id });
        ipHashToCompanyId.set(row.ipHash, null);
        continue;
      }

      const isp = isConsumerISP(result);
      let companyId: string | null = null;

      if (!isp && result.company) {
        companyId = (await convex.mutation(api.identifiedCompanies.upsertByDomain, {
          name: result.company.name,
          domain: result.company.domain || undefined,
          source: "ipinfo",
          city: result.city,
          region: result.region,
          country: result.country,
        })) as unknown as string;
        companiesCreated++;
      } else {
        ispFiltered++;
      }

      // upsert clears rawIp + rawIpExpiresAt and stores the enrichment result.
      await convex.mutation(api.ipLookupCache.upsert, {
        ipHash: row.ipHash,
        companyId: companyId as any,
        raw: result,
        isIsp: isp,
      });

      ipHashToCompanyId.set(row.ipHash, companyId);
    }

    // 4. Link unenriched visitors to the newly identified companies.
    const sites = await convex.query(api.trackedSites.list, {});
    const activeSites = sites.filter((s: any) => s.active);
    let visitorsLinked = 0;

    for (const site of activeSites) {
      const unenriched = await convex.query(api.siteVisitors.listUnenriched, {
        siteId: site._id,
        limit: 500,
      });

      for (const visitor of unenriched) {
        const companyId = ipHashToCompanyId.get(visitor.ipHash);
        if (companyId) {
          await convex.mutation(api.siteVisitors.linkCompany, {
            id: visitor._id,
            companyId: companyId as any,
          });
          visitorsLinked++;
        }
      }
    }

    return NextResponse.json({
      message: "Visitor enrichment complete",
      batchSize: uniqueRawIps.length,
      companiesCreated,
      ispFiltered,
      visitorsLinked,
      sites: activeSites.length,
    });
  } catch (err) {
    console.error("Visitor enrichment cron error:", err);
    return NextResponse.json({ error: "Enrichment failed" }, { status: 500 });
  }
}
