import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getServiceBoardEntries } from "@/lib/service-board";
import { getTickets } from "@/lib/tickets";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const month = url.searchParams.get("month");

    if (!month) {
      return NextResponse.json(
        { error: "month is required" },
        { status: 400 }
      );
    }

    // Get service board entries (hour tracking, status, email)
    const entries = await getServiceBoardEntries("retainer", month);

    // For each entry, get their retainer tickets
    const enriched = await Promise.all(
      entries.map(async (entry) => {
        const tickets = await getTickets(
          {
            clientId: entry.clientId,
            serviceCategory: "retainer",
            archived: false,
            limit: 100,
          },
          { teamMemberId: session.teamMemberId, roleLevel: session.roleLevel }
        );

        return {
          ...entry,
          tickets,
        };
      })
    );

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("Retainer board GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch retainer board" },
      { status: 500 }
    );
  }
}
