import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import {
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
} from "@/lib/notifications";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || "30");
    const offset = Number(url.searchParams.get("offset") || "0");

    const [notifications, unreadCount] = await Promise.all([
      getNotifications(session.teamMemberId, limit, offset),
      getUnreadCount(session.teamMemberId),
    ]);

    return NextResponse.json({ notifications, unreadCount });
  } catch (err) {
    console.error("[notifications] GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, id } = body;

    if (action === "markRead" && id) {
      await markRead(id);
    } else if (action === "markAllRead") {
      await markAllRead(session.teamMemberId);
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[notifications] PUT error:", err);
    return NextResponse.json(
      { error: "Failed to update notification" },
      { status: 500 }
    );
  }
}
