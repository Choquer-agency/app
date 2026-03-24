import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import {
  bulkUpdateStatus,
  bulkUpdatePriority,
  bulkAssign,
} from "@/lib/tickets";
import { TicketStatus, TicketPriority } from "@/types";

export async function PUT(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { ticketIds, action, value } = body;

    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      return NextResponse.json({ error: "ticketIds array is required" }, { status: 400 });
    }

    if (!action || !value) {
      return NextResponse.json({ error: "action and value are required" }, { status: 400 });
    }

    const actor = { id: session.teamMemberId, name: session.name };
    let updated = 0;

    switch (action) {
      case "status":
        updated = await bulkUpdateStatus(ticketIds, value as TicketStatus, actor);
        break;
      case "priority":
        updated = await bulkUpdatePriority(ticketIds, value as TicketPriority, actor);
        break;
      case "assign":
        updated = await bulkAssign(ticketIds, Number(value), "add", actor);
        break;
      case "unassign":
        updated = await bulkAssign(ticketIds, Number(value), "remove", actor);
        break;
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ updated });
  } catch (error) {
    console.error("Failed to bulk update tickets:", error);
    return NextResponse.json({ error: "Failed to bulk update" }, { status: 500 });
  }
}
