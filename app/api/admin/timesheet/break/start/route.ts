import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { startBreak, getActiveShift } from "@/lib/timesheet";
import { stopTimerByMember } from "@/lib/time-entries";

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const active = await getActiveShift(session.teamMemberId);
  if (!active) {
    return NextResponse.json({ error: "No active shift" }, { status: 404 });
  }

  // Auto-stop any running ticket timer when starting a break
  const stoppedTimer = await stopTimerByMember(session.teamMemberId);

  const brk = await startBreak(active.id);
  if (!brk) {
    return NextResponse.json({ error: "Failed to start break" }, { status: 500 });
  }
  return NextResponse.json({
    ...brk,
    stoppedTimerTicketId: stoppedTimer?.ticketId ?? null,
  });
}
