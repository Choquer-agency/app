import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getRunningTimer } from "@/lib/time-entries";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const timer = await getRunningTimer(session.teamMemberId);
  return NextResponse.json({ timer });
}
