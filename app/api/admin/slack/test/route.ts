import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import { sendSlackDM, logSlackMessage } from "@/lib/slack";

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session || !hasPermission(session.roleLevel, "team:manage_roles")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { teamMemberId, slackUserId, message } = await request.json();

    if (!slackUserId) {
      return NextResponse.json({ error: "slackUserId is required" }, { status: 400 });
    }

    const text = message || "This is a test message from InsightPulse. Slack integration is working!";
    const result = await sendSlackDM(slackUserId, text);

    if (result.ok) {
      if (teamMemberId) {
        await logSlackMessage(teamMemberId, "test", text, result.ts);
      }
      return NextResponse.json({ success: true, ts: result.ts });
    }

    return NextResponse.json({ error: result.error || "Failed to send" }, { status: 500 });
  } catch (error) {
    console.error("Slack test error:", error);
    return NextResponse.json({ error: "Failed to send test message" }, { status: 500 });
  }
}
