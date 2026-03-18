import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { getClientBySlug } from "@/lib/clients";
import { getClientPageData, countCheckboxesInMarkdown, splitByMonthSections } from "@/lib/notion-pages";
import { enrichClientContent } from "@/lib/claude-enrichment";
import { getSession } from "@/lib/admin-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { slug } = await params;
    const client = await getClientBySlug(slug);

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    if (!client.notionPageId) {
      return NextResponse.json(
        { error: "No Notion page configured for this client" },
        { status: 400 }
      );
    }

    // Step 1: Fetch Notion page content
    const { markdown: rawMarkdown } = await getClientPageData(client.notionPageId);

    if (!rawMarkdown.trim()) {
      return NextResponse.json(
        { error: "Notion page is empty" },
        { status: 400 }
      );
    }

    // Step 2: Count task completion from current month's checkboxes only
    const { currentMonthSection } = splitByMonthSections(rawMarkdown);
    const taskCompletion = countCheckboxesInMarkdown(currentMonthSection);

    // Step 3: Run Claude enrichment pipeline (always full refresh for manual trigger)
    const enrichedData = await enrichClientContent(rawMarkdown, client, { taskCompletion });

    // Step 3: Store in database
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

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

    return NextResponse.json({
      success: true,
      slug: client.slug,
      tasks: enrichedData.currentMonth.tasks.length,
      goals: enrichedData.goals.length,
      enrichments: enrichedData.analyticsEnrichments.length,
      processedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Manual enrichment error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Enrichment failed" },
      { status: 500 }
    );
  }
}
