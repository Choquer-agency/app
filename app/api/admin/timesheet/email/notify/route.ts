import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import {
  sendMissingClockoutAlert,
  sendChangeRequestNotification,
  sendChangeApproval,
  sendVacationRequestNotification,
  sendVacationApproval,
  sendPartialSickNotification,
  sendPartialSickApproval,
} from "@/lib/email";

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { type, ...data } = body;

    switch (type) {
      case "missing-clockout":
        await sendMissingClockoutAlert(data);
        break;
      case "change-request":
        await sendChangeRequestNotification(data);
        break;
      case "change-approval":
        await sendChangeApproval(data);
        break;
      case "vacation-request":
        await sendVacationRequestNotification(data);
        break;
      case "vacation-approval":
        await sendVacationApproval(data);
        break;
      case "partial-sick-request":
        await sendPartialSickNotification(data);
        break;
      case "partial-sick-approval":
        await sendPartialSickApproval(data);
        break;
      default:
        return NextResponse.json({ error: `Unknown email type: ${type}` }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to send notification:", error);
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 });
  }
}
