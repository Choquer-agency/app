import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import {
  getTimeEntriesForTicket,
  getTotalSecondsForTicket,
  startTimer,
  addManualEntry,
} from "@/lib/time-entries";
import { getActiveShift } from "@/lib/timesheet";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const ticketId = id;

  const [entries, totalSeconds] = await Promise.all([
    getTimeEntriesForTicket(ticketId),
    getTotalSecondsForTicket(ticketId),
  ]);

  return NextResponse.json({ entries, totalSeconds });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const ticketId = id;

  try {
    const body = await request.json();

    // Manual entry
    if (body.type === "manual") {
      if (!body.startTime || !body.endTime) {
        return NextResponse.json(
          { error: "startTime and endTime required for manual entry" },
          { status: 400 }
        );
      }
      const entry = await addManualEntry({
        ticketId,
        teamMemberId: session.teamMemberId,
        startTime: body.startTime,
        endTime: body.endTime,
        note: body.note,
      });
      return NextResponse.json(entry, { status: 201 });
    }

    // Enforce: must be clocked in to start a ticket timer
    const activeShift = await getActiveShift(session.teamMemberId);
    if (!activeShift) {
      return NextResponse.json(
        { error: "You must clock in before tracking time on tickets." },
        { status: 403 }
      );
    }

    // Start timer
    const entry = await startTimer(ticketId, session.teamMemberId);
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error("Time entry error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create time entry" },
      { status: 500 }
    );
  }
}
