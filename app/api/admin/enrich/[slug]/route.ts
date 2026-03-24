import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { getClientBySlug } from "@/lib/clients";
import { getClientPageData, countCheckboxesInMarkdown, splitByMonthSections } from "@/lib/notion-pages";
import { enrichClientContent } from "@/lib/claude-enrichment";
import { getSession } from "@/lib/admin-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const isDev = process.env.NODE_ENV === "development";
  if (!isDev && !getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const convex = getConvexClient();
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

    const isMinimalContent = !rawMarkdown.trim() || rawMarkdown.trim().length < 50;

    if (isMinimalContent) {
      // Create an "onboarding" placeholder so the dashboard shows a "coming soon" state
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const currentMonthLabel = now.toLocaleString("en-US", { month: "long", year: "numeric" });

      const onboardingData = {
        _onboarding: true,
        currentMonth: {
          label: currentMonthLabel,
          summary: "",
          strategy: "",
          tasks: [],
          isComplete: false,
        },
        goals: [],
        pastMonths: [],
        upcomingMonths: [],
        detectedEntities: { pages: [], keywords: [], metrics: [] },
        approvals: [],
        analyticsEnrichments: [],
        processedAt: new Date().toISOString(),
        rawContentHash: "",
      };

      await convex.mutation(api.enrichedContent.upsert, {
        clientSlug: client.slug,
        month: monthKey,
        rawContent: rawMarkdown || "",
        enrichedData: onboardingData as any,
      });

      return NextResponse.json({
        success: true,
        slug: client.slug,
        onboarding: true,
        processedAt: new Date().toISOString(),
      });
    }

    // Step 2: Count task completion from current month's checkboxes only
    const { currentMonthSection } = splitByMonthSections(rawMarkdown);
    const taskCompletion = countCheckboxesInMarkdown(currentMonthSection);

    // Step 3: Run Claude enrichment pipeline (always full refresh for manual trigger)
    const enrichedData = await enrichClientContent(rawMarkdown, client, { taskCompletion });

    // Step 4: Store in database
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    await convex.mutation(api.enrichedContent.upsert, {
      clientSlug: client.slug,
      month: monthKey,
      rawContent: rawMarkdown,
      enrichedData: enrichedData as any,
    });

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
