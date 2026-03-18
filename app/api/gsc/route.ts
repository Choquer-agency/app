import { NextRequest, NextResponse } from "next/server";
import { getGSCTimeSeries, getGSCTopPages, getDateRange } from "@/lib/gsc";
import { getGA4TimeSeries } from "@/lib/ga4";
import { getClientBySlug } from "@/lib/clients";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  const range = request.nextUrl.searchParams.get("range") || "6m";

  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  try {
    const client = await getClientBySlug(slug);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const { startDate, endDate } = getDateRange(range);

    const [timeSeries, topPages, sessions] = await Promise.all([
      getGSCTimeSeries(client.gscSiteUrl, startDate, endDate),
      getGSCTopPages(client.gscSiteUrl, startDate, endDate, 10),
      getGA4TimeSeries(client.ga4PropertyId, startDate, endDate),
    ]);

    return NextResponse.json({ timeSeries, topPages, sessions });
  } catch (error) {
    console.error("GSC API error:", error);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
