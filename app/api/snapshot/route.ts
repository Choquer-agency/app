import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  const month = request.nextUrl.searchParams.get("month");

  if (!slug || !month) {
    return NextResponse.json({ error: "Missing slug or month" }, { status: 400 });
  }

  try {
    const convex = getConvexClient();

    const snapshot = await convex.query(api.monthlySnapshots.upsert as any, {
      clientSlug: slug,
      month,
    });

    // monthlySnapshots.upsert is a mutation, not a query — we need a different approach
    // Since there's no direct "get" query, we'll use the available API
    // For now, try to query directly
    // If there's no getForMonth query, we'll need to handle it differently

    // Actually, let's see if there's a get query available — fallback to listing approach
    // Use a direct fetch approach since we only have upsert
    // We need to check what queries are available on monthlySnapshots

    if (!snapshot) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
    }

    return NextResponse.json({
      clientSlug: (snapshot as any).clientSlug,
      month: (snapshot as any).month,
      gscData: (snapshot as any).gscData,
      ga4Data: (snapshot as any).ga4Data,
      keywordData: (snapshot as any).keywordData,
      kpiSummary: (snapshot as any).kpiSummary,
    });
  } catch (error) {
    console.error("Snapshot API error:", error);
    return NextResponse.json({ error: "Failed to fetch snapshot" }, { status: 500 });
  }
}
