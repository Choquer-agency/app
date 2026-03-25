import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { clockIn } from "@/lib/timesheet";

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entry = await clockIn(session.teamMemberId);
  if (!entry) {
    return NextResponse.json({ error: "Failed to clock in" }, { status: 500 });
  }
  return NextResponse.json(entry);
}
