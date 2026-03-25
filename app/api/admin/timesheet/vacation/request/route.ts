import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { createVacationRequest, getMyVacationRequests } from "@/lib/timesheet";
import { notifyVacationRequested } from "@/lib/notification-triggers";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requests = await getMyVacationRequests(session.teamMemberId);
  return NextResponse.json(requests);
}

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  if (!body.startDate || !body.endDate || !body.totalDays) {
    return NextResponse.json(
      { error: "startDate, endDate, and totalDays required" },
      { status: 400 }
    );
  }

  try {
    const result = await createVacationRequest(
      session.teamMemberId,
      body.startDate,
      body.endDate,
      body.totalDays,
      body.reason
    );
    // Notify admins about vacation request
    notifyVacationRequested(session.name, session.teamMemberId);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
