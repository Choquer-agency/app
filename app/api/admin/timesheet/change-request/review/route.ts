import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import { approveChangeRequest, denyChangeRequest } from "@/lib/timesheet";
import { notifyTimeAdjustmentResolved } from "@/lib/notification-triggers";
import { markReadByType } from "@/lib/notifications";

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session || !hasPermission(session.roleLevel, "timesheet:manage")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  if (!body.requestId || !body.action) {
    return NextResponse.json(
      { error: "requestId and action (approve|deny) required" },
      { status: 400 }
    );
  }

  let result;
  if (body.action === "approve") {
    result = await approveChangeRequest(
      body.requestId,
      session.teamMemberId,
      body.reviewNote
    );
    if (result) {
      notifyTimeAdjustmentResolved(result.teamMemberId, "approved", session.name);
    }
    // Auto-dismiss stale time adjustment notifications for the reviewer
    markReadByType(session.teamMemberId, "time_adjustment_requested").catch(() => {});
  } else if (body.action === "deny") {
    result = await denyChangeRequest(
      body.requestId,
      session.teamMemberId,
      body.reviewNote
    );
    if (result) {
      notifyTimeAdjustmentResolved(result.teamMemberId, "denied", session.name);
    }
    markReadByType(session.teamMemberId, "time_adjustment_requested").catch(() => {});
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  return NextResponse.json(result);
}
