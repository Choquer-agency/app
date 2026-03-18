import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { getClientPageData, countCheckboxesInMarkdown, splitByMonthSections } from "@/lib/notion-pages";
import { enrichClientContent } from "@/lib/claude-enrichment";
import { getActiveClients } from "@/lib/clients";
import { getExistingContentHash, getExistingEnrichedData } from "@/lib/db";
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

        if (!rawMarkdown.trim()) {
          results.push(`${client.slug}: EMPTY PAGE`);
          continue;
        }

        // Step 2: Count task completion from current month's checkboxes only
        const { currentMonthSection } = splitByMonthSections(rawMarkdown);
        const taskCompletion = countCheckboxesInMarkdown(currentMonthSection);

        // Step 3: Compute hash and check for changes
        const newHash = crypto.createHash("md5").update(rawMarkdown).digest("hex");
        const existingHash = await getExistingContentHash(client.slug, monthKey);

        if (existingHash && existingHash === newHash) {
          // Layer A: Content unchanged — skip entirely
          skipped++;
          results.push(`${client.slug}: SKIPPED (content unchanged)`);
          continue;
        }

        // Step 4: Check if only checkboxes changed (Layer C)
        const existing = await getExistingEnrichedData(client.slug, monthKey);

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

          await sql`
            INSERT INTO enriched_content (client_slug, month, raw_content, enriched_data)
            VALUES (${client.slug}, ${monthKey}, ${rawMarkdown}, ${JSON.stringify(updatedData)})
            ON CONFLICT (client_slug, month)
            DO UPDATE SET
              raw_content = EXCLUDED.raw_content,
              enriched_data = EXCLUDED.enriched_data,
              processed_at = NOW()
          `;

          checkboxOnly++;
          results.push(`${client.slug}: CHECKBOX UPDATE (${taskCompletion.completed}/${taskCompletion.total} tasks, no Claude call)`);
          continue;
        }

        // Step 5: Determine enrichment mode
        // If the stored month matches current month and we have existing data, use current-month-only mode
        // If it's a new month (rollover), force full enrichment
        const isMonthRollover = existing && !existingHash; // No existing hash means first run of new month
        let mode: "full" | "current-month" = "full";
        let markdownToProcess = rawMarkdown;

        if (!isMonthRollover && existing?.enrichedData) {
          // Layer B: Try current-month-only enrichment
          const { currentMonthSection } = splitByMonthSections(rawMarkdown);

          // Only use partial mode if we successfully isolated the current month section
          // (i.e., it's meaningfully smaller than the full page)
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
      summary: { total: clients.length, skipped, checkboxOnly, partialEnrich, fullEnrich },
    });
  } catch (error) {
    console.error("Cron enrich error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
