import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getActiveShift, getActiveBreak, getBreaksForEntry } from "@/lib/timesheet";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeShift = await getActiveShift(session.teamMemberId);
  let activeBreak = null;
  let breakCount = 0;
  if (activeShift) {
    activeBreak = await getActiveBreak(activeShift.id);
    const breaks = await getBreaksForEntry(activeShift.id);
    breakCount = breaks.length;
  }

  return NextResponse.json({
    isClockedIn: !!activeShift,
    isOnBreak: !!activeBreak,
    activeShift: activeShift ? { ...activeShift, breakCount } : null,
    activeBreak,
  });
}
