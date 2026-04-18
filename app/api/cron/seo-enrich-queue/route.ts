import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { enrichSeoStrategyMonth } from "@/lib/seo-month-enrichment";
import type { SeoStrategyMonth } from "@/lib/seo-strategy-months";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const IDLE_DEBOUNCE_MS = 4 * 60 * 1000;
const BATCH_LIMIT = 5;

function rowToMonth(row: any): SeoStrategyMonth {
  return {
    id: row._id,
    clientId: row.clientId,
    clientSlug: row.clientSlug,
    year: row.year,
    month: row.month,
    monthKey: row.monthKey,
    status: row.status,
    rawContent: row.rawContent,
    rawContentHash: row.rawContentHash,
    lastEditedAt: row.lastEditedAt,
    lastEditedBy: row.lastEditedBy,
    enrichmentState: row.enrichmentState,
    enrichmentQueuedAt: row.enrichmentQueuedAt,
    enrichmentStartedAt: row.enrichmentStartedAt,
    enrichmentCompletedAt: row.enrichmentCompletedAt,
    enrichmentError: row.enrichmentError,
    lastEnrichedHash: row.lastEnrichedHash,
  };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const isDev = process.env.NODE_ENV === "development";
  if (!isDev && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const convex = getConvexClient();
    const olderThanMs = Date.now() - IDLE_DEBOUNCE_MS;
    const claimed = await convex.mutation(api.seoStrategyMonths.claimNextEnrichmentBatch, {
      olderThanMs,
      limit: BATCH_LIMIT,
    });

    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ processed: 0 });
    }

    const results: { monthKey: string; success: boolean; error?: string }[] = [];
    for (const raw of claimed) {
      const row = rowToMonth(raw);
      try {
        await enrichSeoStrategyMonth(row);
        results.push({ monthKey: row.monthKey, success: true });
      } catch (err) {
        results.push({
          monthKey: row.monthKey,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({ processed: claimed.length, results });
  } catch (error) {
    console.error("seo-enrich-queue cron failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cron failed" },
      { status: 500 }
    );
  }
}
