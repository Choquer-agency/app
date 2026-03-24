import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { getActiveClients } from "@/lib/clients";
import { getGSCPerformance, getGSCTimeSeries, getGSCTopPages } from "@/lib/gsc";
import { getGA4Sessions, getGA4TimeSeries } from "@/lib/ga4";
import { getKeywordRankings } from "@/lib/serankings";

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const convex = getConvexClient();
    const clients = await getActiveClients();

    // Calculate prior month date range
    const now = new Date();
    const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastOfLastMonth = new Date(firstOfThisMonth.getTime() - 86400000);
    const firstOfTwoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);

    const startDate = firstOfLastMonth.toISOString().split("T")[0];
    const endDate = lastOfLastMonth.toISOString().split("T")[0];
    const prevStartDate = firstOfTwoMonthsAgo.toISOString().split("T")[0];
    const prevEndDate = new Date(firstOfLastMonth.getTime() - 86400000).toISOString().split("T")[0];
    const monthKey = startDate; // e.g., "2026-02-01"

    const results: string[] = [];

    for (const client of clients) {
      try {
        // Fetch all data for the prior month
        const [gscPerf, gscPrevPerf, gscTimeSeries, gscTopPages, ga4Sessions, ga4PrevSessions, ga4TimeSeries, keywords] =
          await Promise.all([
            getGSCPerformance(client.gscSiteUrl, startDate, endDate),
            getGSCPerformance(client.gscSiteUrl, prevStartDate, prevEndDate),
            getGSCTimeSeries(client.gscSiteUrl, startDate, endDate),
            getGSCTopPages(client.gscSiteUrl, startDate, endDate, 10),
            getGA4Sessions(client.ga4PropertyId, startDate, endDate),
            getGA4Sessions(client.ga4PropertyId, prevStartDate, prevEndDate),
            getGA4TimeSeries(client.ga4PropertyId, startDate, endDate),
            getKeywordRankings(client.seRankingsProjectId),
          ]);

        const keywordsImproved = keywords.filter((kw: any) => kw.change > 0).length;

        function pctChange(curr: number, prev: number): number {
          if (prev === 0) return 0;
          return ((curr - prev) / prev) * 100;
        }

        const kpiSummary = [
          {
            label: "Total Clicks",
            value: gscPerf.clicks,
            previousValue: gscPrevPerf.clicks,
            changePercent: pctChange(gscPerf.clicks, gscPrevPerf.clicks),
            format: "number",
          },
          {
            label: "Total Impressions",
            value: gscPerf.impressions,
            previousValue: gscPrevPerf.impressions,
            changePercent: pctChange(gscPerf.impressions, gscPrevPerf.impressions),
            format: "number",
          },
          {
            label: "Organic Sessions",
            value: ga4Sessions.organicSessions,
            previousValue: ga4PrevSessions.organicSessions,
            changePercent: pctChange(ga4Sessions.organicSessions, ga4PrevSessions.organicSessions),
            format: "number",
          },
          {
            label: "Keywords Improved",
            value: keywordsImproved,
            previousValue: 0,
            changePercent: 0,
            format: "number",
          },
        ];

        // Upsert snapshot
        await convex.mutation(api.monthlySnapshots.upsert, {
          clientSlug: client.slug,
          month: monthKey,
          gscData: { performance: gscPerf, timeSeries: gscTimeSeries, topPages: gscTopPages } as any,
          ga4Data: { sessions: ga4Sessions, timeSeries: ga4TimeSeries } as any,
          keywordData: keywords as any,
          kpiSummary: kpiSummary as any,
        });

        results.push(`${client.slug}: OK`);
      } catch (error) {
        console.error(`Snapshot error for ${client.slug}:`, error);
        results.push(`${client.slug}: ERROR`);
      }
    }

    return NextResponse.json({ results, month: monthKey });
  } catch (error) {
    console.error("Cron snapshot error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
