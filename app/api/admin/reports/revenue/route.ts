import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getRevenueReport } from "@/lib/reports";
import { hasPermission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session || !hasPermission(session.roleLevel, "report:revenue")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const months = parseInt(searchParams.get("months") || "12", 10);

  const report = await getRevenueReport(Math.min(months, 24));
  return NextResponse.json(report);
}
