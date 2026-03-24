import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getForecastingReport } from "@/lib/reports";
import { hasPermission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session || !hasPermission(session.roleLevel, "report:forecasting")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const report = await getForecastingReport();
  return NextResponse.json(report);
}
