import { NextRequest, NextResponse } from "next/server";
import { getKeywordRankings } from "@/lib/serankings";
import { getClientBySlug } from "@/lib/clients";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");

  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  try {
    const client = await getClientBySlug(slug);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const rankings = await getKeywordRankings(client.seRankingsProjectId);
    return NextResponse.json({ rankings });
  } catch (error) {
    console.error("SE Rankings API error:", error);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
