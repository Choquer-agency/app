import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getActiveShift, getActiveBreak } from "@/lib/timesheet";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeShift = await getActiveShift(session.teamMemberId);
  let activeBreak = null;
  if (activeShift) {
    activeBreak = await getActiveBreak(activeShift.id);
  }

  return NextResponse.json({
    isClockedIn: !!activeShift,
    isOnBreak: !!activeBreak,
    activeShift,
    activeBreak,
  });
}
