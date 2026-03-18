import { NextRequest, NextResponse } from "next/server";
import { getGA4TimeSeries, getGA4Sessions } from "@/lib/ga4";
import { getClientBySlug } from "@/lib/clients";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  const startDate = request.nextUrl.searchParams.get("startDate");
  const endDate = request.nextUrl.searchParams.get("endDate");

  if (!slug || !startDate || !endDate) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  try {
    const client = await getClientBySlug(slug);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const [timeSeries, sessions] = await Promise.all([
      getGA4TimeSeries(client.ga4PropertyId, startDate, endDate),
      getGA4Sessions(client.ga4PropertyId, startDate, endDate),
    ]);

    return NextResponse.json({ timeSeries, sessions });
  } catch (error) {
    console.error("GA4 API error:", error);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
