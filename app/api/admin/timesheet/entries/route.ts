import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import { getAllTimesheetEntries, adminEditEntry } from "@/lib/timesheet";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session || !hasPermission(session.roleLevel, "timesheet:view_all")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "startDate and endDate required" },
      { status: 400 }
    );
  }

  const entries = await getAllTimesheetEntries(startDate, endDate);
  return NextResponse.json(entries);
}

export async function PATCH(request: NextRequest) {
  const session = getSession(request);
  if (!session || !hasPermission(session.roleLevel, "timesheet:manage")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  if (!body.entryId) {
    return NextResponse.json({ error: "entryId required" }, { status: 400 });
  }

  const result = await adminEditEntry(body.entryId, {
    clockInTime: body.clockInTime,
    clockOutTime: body.clockOutTime,
    note: body.note,
    isSickDay: body.isSickDay,
    isHalfSickDay: body.isHalfSickDay,
    isVacation: body.isVacation,
  });
  return NextResponse.json(result);
}
