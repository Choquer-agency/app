import { NextRequest, NextResponse } from "next/server";
import { getClientBySlug } from "@/lib/clients";
import { getGSCKPIs, getGSCTopPages, getDateRange } from "@/lib/gsc";
import { getGA4KPIs, getGA4UsersTimeSeries, getGA4TrafficAcquisition } from "@/lib/ga4";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  const range = request.nextUrl.searchParams.get("range") || "28d";

  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  try {
    const client = await getClientBySlug(slug);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const { startDate, endDate } = getDateRange(range);

    const [gscKpis, ga4Kpis, usersTimeSeries, trafficChannels, topPages] = await Promise.all([
      getGSCKPIs(client.gscSiteUrl, range),
      getGA4KPIs(client.ga4PropertyId),
      getGA4UsersTimeSeries(client.ga4PropertyId, startDate, endDate),
      getGA4TrafficAcquisition(client.ga4PropertyId, startDate, endDate),
      getGSCTopPages(client.gscSiteUrl, startDate, endDate, 10),
    ]);

    const kpis = [
      gscKpis.clicks,
      gscKpis.impressions,
      {
        label: "CTR",
        value: gscKpis.clicks.value && gscKpis.impressions.value
          ? (gscKpis.clicks.value / gscKpis.impressions.value) * 100
          : 0,
        previousValue: 0,
        changePercent: 0,
        format: "percent",
      },
      ga4Kpis.organicSessions,
    ];

    return NextResponse.json({
      kpis,
      usersTimeSeries,
      trafficChannels,
      topPages,
    });
  } catch (error) {
    console.error("Metrics API error:", error);
    return NextResponse.json({ error: "Failed to fetch metrics" }, { status: 500 });
  }
}
