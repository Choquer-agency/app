import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getTimesheetHistory } from "@/lib/timesheet";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate") ?? undefined;
  const endDate = searchParams.get("endDate") ?? undefined;
  const memberId = searchParams.get("memberId") ?? session.teamMemberId;

  const entries = await getTimesheetHistory(memberId, startDate, endDate);
  return NextResponse.json(entries);
}
