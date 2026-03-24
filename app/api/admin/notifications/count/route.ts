import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getUnreadCount } from "@/lib/notifications";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const unreadCount = await getUnreadCount(session.teamMemberId);
    return NextResponse.json({ unreadCount });
  } catch (err) {
    console.error("[notifications] count error:", err);
    return NextResponse.json({ unreadCount: 0 });
  }
}
