import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getMonth } from "@/lib/seo-strategy-months";
import { enrichSeoStrategyMonth } from "@/lib/seo-month-enrichment";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; monthKey: string }> }
) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { clientId, monthKey } = await params;
    const month = await getMonth(clientId, monthKey);
    if (!month) {
      return NextResponse.json({ error: "Month not found" }, { status: 404 });
    }

    const convex = getConvexClient();
    await convex.mutation(api.seoStrategyMonths.requeue, {
      id: month.id as Id<"seoStrategyMonths">,
    });

    const fresh = await getMonth(clientId, monthKey);
    if (!fresh) throw new Error("Month vanished after requeue");

    await enrichSeoStrategyMonth({ ...fresh, enrichmentState: "running" });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Manual SEO month enrichment failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Enrichment failed" },
      { status: 500 }
    );
  }
}
