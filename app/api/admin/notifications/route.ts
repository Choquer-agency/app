import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import {
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  markReadByTicket,
  deleteNotification,
} from "@/lib/notifications";
import { hasMinRole } from "@/lib/permissions";

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

export async function DELETE(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Owner-only: delete any notification
  if (!hasMinRole(session.roleLevel, "owner")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    await deleteNotification(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[notifications] DELETE error:", err);
    return NextResponse.json(
      { error: "Failed to delete notification" },
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
    } else if (action === "markReadByTicket" && body.ticketId) {
      await markReadByTicket(session.teamMemberId, body.ticketId);
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
