import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getPerformanceReport } from "@/lib/reports";
import { hasPermission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session || !hasPermission(session.roleLevel, "report:performance")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!start || !end) {
    return NextResponse.json({ error: "start and end params required" }, { status: 400 });
  }

  // Employees can only see their own stats
  const isEmployee = !hasPermission(session.roleLevel, "team:view") || session.roleLevel === "employee";
  const requestedMemberId = searchParams.get("memberId");

  // If employee, force to their own ID. Otherwise, use requested filter (or undefined for all)
  const memberId = isEmployee
    ? session.teamMemberId
    : requestedMemberId ? Number(requestedMemberId) : undefined;

  const report = await getPerformanceReport(start, end, memberId);
  return NextResponse.json(report);
}
