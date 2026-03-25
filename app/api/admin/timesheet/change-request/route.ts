import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { createChangeRequest } from "@/lib/timesheet";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const convex = getConvexClient();
  const requests = await convex.query(api.timesheetChangeRequests.listByMember, {
    teamMemberId: session.teamMemberId as any,
  });
  return NextResponse.json(requests);
}

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  if (!body.timesheetEntryId || !body.proposedClockIn || !body.reason) {
    return NextResponse.json(
      { error: "timesheetEntryId, proposedClockIn, and reason required" },
      { status: 400 }
    );
  }

  try {
    const result = await createChangeRequest(
      body.timesheetEntryId,
      session.teamMemberId,
      body.proposedClockIn,
      body.proposedClockOut,
      body.reason
    );
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
