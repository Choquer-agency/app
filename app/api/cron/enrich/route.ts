import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { getClientPageContent } from "@/lib/notion-pages";
import { enrichClientContent } from "@/lib/claude-enrichment";
import { getActiveClients } from "@/lib/clients";

export async function GET(request: NextRequest) {
  // Verify cron secret (skip in dev for manual testing)
  const authHeader = request.headers.get("authorization");
  const isDev = process.env.NODE_ENV === "development";

  if (!isDev && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const clients = await getActiveClients();

    if (clients.length === 0) {
      return NextResponse.json({ error: "No active clients with Notion page IDs" }, { status: 400 });
    }

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const results: string[] = [];

    for (const client of clients) {
      try {
        // Step 1: Fetch Notion page content
        const rawMarkdown = await getClientPageContent(client.notionPageId);

        if (!rawMarkdown.trim()) {
          results.push(`${client.slug}: EMPTY PAGE`);
          continue;
        }

        // Step 2: Run Claude enrichment pipeline
        const enrichedData = await enrichClientContent(rawMarkdown, client);

        // Step 3: Store in database
        await sql`
          INSERT INTO enriched_content (client_slug, month, raw_content, enriched_data)
          VALUES (
            ${client.slug},
            ${monthKey},
            ${rawMarkdown},
            ${JSON.stringify(enrichedData)}
          )
          ON CONFLICT (client_slug, month)
          DO UPDATE SET
            raw_content = EXCLUDED.raw_content,
            enriched_data = EXCLUDED.enriched_data,
            processed_at = NOW()
        `;

        results.push(`${client.slug}: OK (${enrichedData.currentMonth.tasks.length} tasks, ${enrichedData.goals.length} goals, ${enrichedData.analyticsEnrichments.length} enrichments)`);
      } catch (error) {
        console.error(`Enrichment error for ${client.slug}:`, error);
        results.push(`${client.slug}: ERROR - ${error instanceof Error ? error.message : "Unknown"}`);
      }
    }

    return NextResponse.json({ results, month: monthKey });
  } catch (error) {
    console.error("Cron enrich error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
