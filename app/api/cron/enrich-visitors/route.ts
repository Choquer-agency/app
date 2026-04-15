import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import {
  getIPInfoToken,
  batchLookupIPs,
  extractCompany,
  isConsumerOrISP,
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
    // Also keep the IPinfo location data so we can backfill it onto visitors.
    const ipHashEnrichment = new Map<
      string,
      {
        companyId: string | null;
        country?: string;
        region?: string;
        city?: string;
      }
    >();
    let companiesCreated = 0;
    let ispFiltered = 0;

    for (const row of pending as any[]) {
      const result = lookupResults.get(row.rawIp);

      if (!result) {
        // Lookup failed — purge the raw IP so we don't retry forever.
        await convex.mutation(api.ipLookupCache.purgeRawIp, { id: row._id });
        ipHashEnrichment.set(row.ipHash, { companyId: null });
        continue;
      }

      const company = extractCompany(result);
      const isp = isConsumerOrISP(company?.name, company?.companyType);
      let companyId: string | null = null;

      if (!isp && company) {
        companyId = (await convex.mutation(api.identifiedCompanies.upsertByDomain, {
          name: company.name,
          domain: company.domain,
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

      ipHashEnrichment.set(row.ipHash, {
        companyId,
        country: result.country,
        region: result.region,
        city: result.city,
      });
    }

    // 4. Apply enrichment (company link + location) to existing visitors.
    const sites = await convex.query(api.trackedSites.list, {});
    const activeSites = sites.filter((s: any) => s.active);
    let visitorsLinked = 0;
    let visitorsLocated = 0;

    for (const site of activeSites) {
      const unenriched = await convex.query(api.siteVisitors.listUnenriched, {
        siteId: site._id,
        limit: 500,
      });

      for (const visitor of unenriched) {
        const enrichment = ipHashEnrichment.get(visitor.ipHash);
        if (!enrichment) continue;

        await convex.mutation(api.siteVisitors.applyEnrichment, {
          id: visitor._id,
          companyId: enrichment.companyId
            ? (enrichment.companyId as any)
            : undefined,
          country: enrichment.country,
          region: enrichment.region,
          city: enrichment.city,
        });

        if (enrichment.companyId) visitorsLinked++;
        if (enrichment.country || enrichment.city) visitorsLocated++;
      }
    }

    return NextResponse.json({
      message: "Visitor enrichment complete",
      batchSize: uniqueRawIps.length,
      companiesCreated,
      ispFiltered,
      visitorsLinked,
      visitorsLocated,
      sites: activeSites.length,
    });
  } catch (err) {
    console.error("Visitor enrichment cron error:", err);
    return NextResponse.json({ error: "Enrichment failed" }, { status: 500 });
  }
}
