import { NextRequest, NextResponse, after } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { enrichSeoStrategyMonth } from "@/lib/seo-month-enrichment";
import type { SeoStrategyMonth } from "@/lib/seo-strategy-months";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

// No debounce — bulk import + manual flush should run immediately.
const NO_DEBOUNCE = 0;
const BATCH_LIMIT = 50;

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

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.roleLevel, "clients:edit")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const convex = getConvexClient();
    const now = Date.now();
    const claimed = await convex.mutation(api.seoStrategyMonths.claimNextEnrichmentBatch, {
      olderThanMs: now - NO_DEBOUNCE,
      limit: BATCH_LIMIT,
    });

    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ claimed: 0 });
    }

    // Run serially in the background after responding so the UI isn't blocked.
    after(async () => {
      for (const raw of claimed) {
        const row = rowToMonth(raw);
        try {
          await enrichSeoStrategyMonth(row);
        } catch (err) {
          console.error(
            "[process-queue] failed",
            row.clientSlug,
            row.monthKey,
            err instanceof Error ? err.message : err
          );
        }
      }
    });

    return NextResponse.json({ claimed: claimed.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
