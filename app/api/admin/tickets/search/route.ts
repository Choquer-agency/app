import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { searchTickets } from "@/lib/tickets";

export async function GET(request: NextRequest) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q");

    if (!q?.trim()) {
      return NextResponse.json([]);
    }

    const limit = Number(url.searchParams.get("limit") || "20");
    const tickets = await searchTickets(q.trim(), limit);
    return NextResponse.json(tickets);
  } catch (error) {
    console.error("Failed to search tickets:", error);
    return NextResponse.json({ error: "Failed to search tickets" }, { status: 500 });
  }
}
