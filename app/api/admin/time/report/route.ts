import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getTeamTimeReport } from "@/lib/time-entries";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const period = (searchParams.get("period") || "week") as "week" | "month";

  const report = await getTeamTimeReport(period);
  return NextResponse.json(report);
}
