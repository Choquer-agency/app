import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { clockOut, getActiveShift } from "@/lib/timesheet";
import { stopTimerByMember } from "@/lib/time-entries";

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find active shift for this user
  const active = await getActiveShift(session.teamMemberId);
  if (!active) {
    return NextResponse.json({ error: "No active shift" }, { status: 404 });
  }

  // Auto-stop any running ticket timer when clocking out
  await stopTimerByMember(session.teamMemberId);

  const entry = await clockOut(active.id);
  if (!entry) {
    return NextResponse.json({ error: "Failed to clock out" }, { status: 500 });
  }
  return NextResponse.json(entry);
}
