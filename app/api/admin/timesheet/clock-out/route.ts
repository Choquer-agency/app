import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { clockOut, getActiveShift } from "@/lib/timesheet";
import { stopTimerByMember } from "@/lib/time-entries";

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find active shift for this user (includes stale shifts from previous days)
  const active = await getActiveShift(session.teamMemberId);
  if (!active) {
    // No open shift — already clocked out, return success to prevent UI confusion
    return NextResponse.json({ alreadyClockedOut: true });
  }

  // Auto-stop any running ticket timer when clocking out
  await stopTimerByMember(session.teamMemberId);

  const entry = await clockOut(active.id);
  if (!entry) {
    // clockOut returns null if already closed — treat as success
    return NextResponse.json({ alreadyClockedOut: true });
  }
  return NextResponse.json(entry);
}
