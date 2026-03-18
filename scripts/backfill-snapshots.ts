/**
 * Backfill historical snapshots from GSC + GA4 APIs.
 * Run manually: npx tsx scripts/backfill-snapshots.ts
 *
 * Requires .env.local to be loaded (use dotenv or set vars manually).
 * GSC supports up to 16 months of historical data.
 * GA4 supports 2+ years.
 */

import { sql } from "@vercel/postgres";

async function main() {
  console.log("Starting historical snapshot backfill...");
  console.log("Note: This script requires all API env vars to be set.");
  console.log("Import the actual lib functions when running in production.\n");

  // Dynamic imports to ensure env vars are loaded
  const { getActiveClients } = await import("../lib/clients");
  const { getGSCPerformance, getGSCTimeSeries, getGSCTopPages } = await import("../lib/gsc");
  const { getGA4Sessions, getGA4TimeSeries } = await import("../lib/ga4");
  const { getKeywordRankings } = await import("../lib/serankings");

  const clients = await getActiveClients();
  console.log(`Found ${clients.length} active clients.\n`);

  // Backfill last 16 months
  const months: string[] = [];
  const now = new Date();
  for (let i = 1; i <= 16; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toISOString().split("T")[0]);
  }

  for (const client of clients) {
    console.log(`Processing ${client.slug}...`);

    for (const monthStart of months) {
      const startDate = monthStart;
      const monthDate = new Date(monthStart);
      const endDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
        .toISOString()
        .split("T")[0];

      // Previous month for comparison
      const prevMonthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1);
      const prevStartDate = prevMonthDate.toISOString().split("T")[0];
      const prevEndDate = new Date(monthDate.getTime() - 86400000).toISOString().split("T")[0];

      try {
        // Check if snapshot already exists
        const existing = await sql`
          SELECT id FROM monthly_snapshots
          WHERE client_slug = ${client.slug} AND month = ${startDate}
        `;

        if (existing.rows.length > 0) {
          console.log(`  ${startDate}: already exists, skipping`);
          continue;
        }

        const [gscPerf, gscPrevPerf, gscTimeSeries, gscTopPages, ga4Sessions, ga4PrevSessions, ga4TimeSeries, keywords] =
          await Promise.all([
            getGSCPerformance(client.gscSiteUrl, startDate, endDate).catch(() => ({ clicks: 0, impressions: 0, ctr: 0, position: 0 })),
            getGSCPerformance(client.gscSiteUrl, prevStartDate, prevEndDate).catch(() => ({ clicks: 0, impressions: 0, ctr: 0, position: 0 })),
            getGSCTimeSeries(client.gscSiteUrl, startDate, endDate).catch(() => []),
            getGSCTopPages(client.gscSiteUrl, startDate, endDate, 10).catch(() => []),
            getGA4Sessions(client.ga4PropertyId, startDate, endDate).catch(() => ({ totalSessions: 0, organicSessions: 0, users: 0, newUsers: 0 })),
            getGA4Sessions(client.ga4PropertyId, prevStartDate, prevEndDate).catch(() => ({ totalSessions: 0, organicSessions: 0, users: 0, newUsers: 0 })),
            getGA4TimeSeries(client.ga4PropertyId, startDate, endDate).catch(() => []),
            getKeywordRankings(client.seRankingsProjectId).catch(() => []),
          ]);

        function pctChange(curr: number, prev: number): number {
          if (prev === 0) return 0;
          return ((curr - prev) / prev) * 100;
        }

        const kpiSummary = [
          { label: "Total Clicks", value: gscPerf.clicks, previousValue: gscPrevPerf.clicks, changePercent: pctChange(gscPerf.clicks, gscPrevPerf.clicks), format: "number" },
          { label: "Total Impressions", value: gscPerf.impressions, previousValue: gscPrevPerf.impressions, changePercent: pctChange(gscPerf.impressions, gscPrevPerf.impressions), format: "number" },
          { label: "Organic Sessions", value: ga4Sessions.organicSessions, previousValue: ga4PrevSessions.organicSessions, changePercent: pctChange(ga4Sessions.organicSessions, ga4PrevSessions.organicSessions), format: "number" },
          { label: "Keywords Improved", value: keywords.filter((kw) => kw.change > 0).length, previousValue: 0, changePercent: 0, format: "number" },
        ];

        await sql`
          INSERT INTO monthly_snapshots (client_slug, month, gsc_data, ga4_data, keyword_data, kpi_summary)
          VALUES (
            ${client.slug},
            ${startDate},
            ${JSON.stringify({ performance: gscPerf, timeSeries: gscTimeSeries, topPages: gscTopPages })},
            ${JSON.stringify({ sessions: ga4Sessions, timeSeries: ga4TimeSeries })},
            ${JSON.stringify(keywords)},
            ${JSON.stringify(kpiSummary)}
          )
        `;

        console.log(`  ${startDate}: OK`);
      } catch (error) {
        console.error(`  ${startDate}: ERROR`, error);
      }
    }

    console.log();
  }

  console.log("Backfill complete.");
}

main().catch(console.error);
