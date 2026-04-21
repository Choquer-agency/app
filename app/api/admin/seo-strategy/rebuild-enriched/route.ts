import { NextRequest, NextResponse, after } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getClientById } from "@/lib/clients";
import { enrichSeoStrategyMonth } from "@/lib/seo-month-enrichment";
import type { SeoStrategyMonth } from "@/lib/seo-strategy-months";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  if (!hasPermission(session.roleLevel, "seo_import:use")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const clientId = body?.clientId as string | undefined;
    if (!clientId) {
      return NextResponse.json({ error: "clientId required" }, { status: 400 });
    }

    const client = await getClientById(clientId);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const convex = getConvexClient();
    const rawRows = await convex.query(api.seoStrategyMonths.listByClient, {
      clientId: clientId as Id<"clients">,
    });
    const rows = (rawRows as unknown[])
      .map((r) => rowToMonth(r))
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey));

    if (rows.length === 0) {
      return NextResponse.json({ rebuilt: 0, total: 0 });
    }

    await convex.mutation(api.enrichedContent.resetForRebuild, {
      clientSlug: client.slug,
    });

    after(async () => {
      for (const row of rows) {
        try {
          await enrichSeoStrategyMonth(row);
        } catch (err) {
          console.error(
            "[rebuild-enriched] failed",
            row.clientSlug,
            row.monthKey,
            err instanceof Error ? err.message : err
          );
        }
      }
    });

    return NextResponse.json({
      clientSlug: client.slug,
      total: rows.length,
      backgrounded: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
