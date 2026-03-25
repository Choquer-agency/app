import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { endBreak } from "@/lib/timesheet";

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  if (!body.breakId) {
    return NextResponse.json({ error: "breakId required" }, { status: 400 });
  }

  const brk = await endBreak(body.breakId);
  if (!brk) {
    return NextResponse.json({ error: "No active break" }, { status: 404 });
  }
  return NextResponse.json(brk);
}
