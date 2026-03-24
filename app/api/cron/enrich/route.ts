import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { getClientPageData, countCheckboxesInMarkdown, splitByMonthSections } from "@/lib/notion-pages";
import { enrichClientContent } from "@/lib/claude-enrichment";
import { getActiveClients } from "@/lib/clients";
import { autoApproveStalePending } from "@/lib/db";
import crypto from "crypto";

function stripCheckboxes(md: string): string {
  return md.replace(/\[x\]/g, "[ ]");
}

export async function GET(request: NextRequest) {
  // Verify cron secret (skip in dev for manual testing)
  const authHeader = request.headers.get("authorization");
  const isDev = process.env.NODE_ENV === "development";

  if (!isDev && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const convex = getConvexClient();

    // Auto-approve any pending approvals older than 7 days
    const autoApproved = await autoApproveStalePending();

    const clients = await getActiveClients();

    if (clients.length === 0) {
      return NextResponse.json({ error: "No active clients with Notion page IDs" }, { status: 400 });
    }

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const results: string[] = [];
    let skipped = 0;
    let checkboxOnly = 0;
    let partialEnrich = 0;
    let fullEnrich = 0;

    for (const client of clients) {
      try {
        // Step 1: Fetch Notion page content
        const { markdown: rawMarkdown } = await getClientPageData(client.notionPageId);

        if (!rawMarkdown.trim() || rawMarkdown.trim().length < 50) {
          // Create/update onboarding placeholder so dashboard shows "coming soon"
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

          results.push(`${client.slug}: ONBOARDING (empty page)`);
          continue;
        }

        // Step 2: Count task completion from current month's checkboxes only
        const { currentMonthSection } = splitByMonthSections(rawMarkdown);
        const taskCompletion = countCheckboxesInMarkdown(currentMonthSection);

        // Step 3: Compute hash and check for changes
        const newHash = crypto.createHash("md5").update(rawMarkdown).digest("hex");

        // Get existing enriched content for this client/month
        const existing = await convex.query(api.enrichedContent.getForMonth, {
          clientSlug: client.slug,
          month: monthKey,
        });

        const existingHash = existing?.enrichedData?.rawContentHash || null;

        if (existingHash && existingHash === newHash) {
          // Layer A: Content unchanged — skip entirely
          skipped++;
          results.push(`${client.slug}: SKIPPED (content unchanged)`);
          continue;
        }

        // Step 4: Check if only checkboxes changed (Layer C)
        if (existing?.rawContent && stripCheckboxes(rawMarkdown) === stripCheckboxes(existing.rawContent)) {
          // Layer C: Only checkbox states changed — update taskCompletion without Claude
          const updatedData = {
            ...existing.enrichedData,
            currentMonth: {
              ...existing.enrichedData.currentMonth,
              taskCompletion,
              isComplete: taskCompletion.total > 0 && taskCompletion.completed === taskCompletion.total,
            },
            rawContentHash: newHash,
            processedAt: new Date().toISOString(),
          };

          await convex.mutation(api.enrichedContent.upsert, {
            clientSlug: client.slug,
            month: monthKey,
            rawContent: rawMarkdown,
            enrichedData: updatedData as any,
          });

          checkboxOnly++;
          results.push(`${client.slug}: CHECKBOX UPDATE (${taskCompletion.completed}/${taskCompletion.total} tasks, no Claude call)`);
          continue;
        }

        // Step 5: Determine enrichment mode
        const isMonthRollover = existing && !existingHash;
        let mode: "full" | "current-month" = "full";
        let markdownToProcess = rawMarkdown;

        if (!isMonthRollover && existing?.enrichedData) {
          const { currentMonthSection } = splitByMonthSections(rawMarkdown);

          if (currentMonthSection.length < rawMarkdown.length * 0.8) {
            mode = "current-month";
            markdownToProcess = currentMonthSection;
            partialEnrich++;
          } else {
            fullEnrich++;
          }
        } else {
          fullEnrich++;
        }

        // Step 6: Run Claude enrichment pipeline
        const enrichedData = await enrichClientContent(markdownToProcess, client, {
          taskCompletion,
          mode,
          existingData: mode === "current-month" ? existing?.enrichedData : undefined,
        });

        // Step 7: Store in database
        await convex.mutation(api.enrichedContent.upsert, {
          clientSlug: client.slug,
          month: monthKey,
          rawContent: rawMarkdown,
          enrichedData: enrichedData as any,
        });

        const modeLabel = mode === "current-month" ? "PARTIAL" : "FULL";
        results.push(`${client.slug}: OK [${modeLabel}] (${taskCompletion.completed}/${taskCompletion.total} tasks, ${enrichedData.goals.length} goals, ${enrichedData.analyticsEnrichments.length} enrichments)`);
      } catch (error) {
        console.error(`Enrichment error for ${client.slug}:`, error);
        results.push(`${client.slug}: ERROR - ${error instanceof Error ? error.message : "Unknown"}`);
      }
    }

    return NextResponse.json({
      results,
      month: monthKey,
      summary: { total: clients.length, skipped, checkboxOnly, partialEnrich, fullEnrich, autoApproved },
    });
  } catch (error) {
    console.error("Cron enrich error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
