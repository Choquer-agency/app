import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  const month = request.nextUrl.searchParams.get("month");

  if (!slug || !month) {
    return NextResponse.json({ error: "Missing slug or month" }, { status: 400 });
  }

  try {
    const result = await sql`
      SELECT * FROM monthly_snapshots
      WHERE client_slug = ${slug} AND month = ${month}
      LIMIT 1
    `;

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
    }

    const row = result.rows[0];
    return NextResponse.json({
      clientSlug: row.client_slug,
      month: row.month,
      gscData: row.gsc_data,
      ga4Data: row.ga4_data,
      keywordData: row.keyword_data,
      kpiSummary: row.kpi_summary,
    });
  } catch (error) {
    console.error("Snapshot API error:", error);
    return NextResponse.json({ error: "Failed to fetch snapshot" }, { status: 500 });
  }
}
