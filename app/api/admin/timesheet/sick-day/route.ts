import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { markSickDay } from "@/lib/timesheet";

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const date = body.date ?? new Date().toISOString().split("T")[0];
  const isHalf = body.isHalf ?? false;

  const entry = await markSickDay(session.teamMemberId, date, isHalf);
  if (!entry) {
    return NextResponse.json({ error: "Failed to mark sick day" }, { status: 500 });
  }
  return NextResponse.json(entry);
}
