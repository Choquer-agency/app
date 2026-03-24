import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getVelocityReport } from "@/lib/reports";
import { hasPermission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session || !hasPermission(session.roleLevel, "report:velocity")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const weeks = parseInt(searchParams.get("weeks") || "12", 10);

  const report = await getVelocityReport(Math.min(weeks, 52));
  return NextResponse.json(report);
}
