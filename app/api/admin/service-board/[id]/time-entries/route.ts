import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getServiceBoardEntryById, getOrCreateServiceTicket } from "@/lib/service-board";
import { getServiceHoursForClient } from "@/lib/time-entries";
import { getTimeEntriesForTicket, startTimer, addManualEntry } from "@/lib/time-entries";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const entry = await getServiceBoardEntryById(Number(id));
    if (!entry) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const hours = await getServiceHoursForClient(
      entry.clientId,
      entry.category,
      entry.month
    );

    return NextResponse.json(hours);
  } catch (error) {
    console.error("Service board time entries GET error:", error);
    return NextResponse.json({ error: "Failed to fetch time entries" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const entry = await getServiceBoardEntryById(Number(id));
    if (!entry) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const action = body.action; // "start_timer" or "manual_entry"

    // Get or create the service ticket for this client/category/month
    const { ticketId } = await getOrCreateServiceTicket(
      entry.clientId,
      entry.category,
      entry.month,
      session.teamMemberId
    );

    if (action === "start_timer") {
      const timeEntry = await startTimer(ticketId, session.teamMemberId);
      return NextResponse.json(timeEntry);
    } else if (action === "manual_entry") {
      const timeEntry = await addManualEntry({
        ticketId,
        teamMemberId: session.teamMemberId,
        startTime: body.startTime,
        endTime: body.endTime,
        note: body.note,
      });
      return NextResponse.json(timeEntry);
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Service board time entry POST error:", error);
    return NextResponse.json({ error: "Failed to create time entry" }, { status: 500 });
  }
}
