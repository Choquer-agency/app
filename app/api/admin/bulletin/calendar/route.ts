import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { hasMinRole, type RoleLevel } from "@/lib/permissions";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

// GET — list all calendar events
export async function GET(request: NextRequest) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const convex = getConvexClient();
    const events = await convex.query(api.bulletin.listCalendarEvents, {});

    return NextResponse.json(
      (events as any[]).map((r: any) => ({
        id: r._id,
        title: r.title,
        eventDate: r.eventDate,
        eventType: r.eventType,
        recurrence: r.recurrence || "none",
      }))
    );
  } catch (error) {
    console.error("Calendar fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch calendar" }, { status: 500 });
  }
}

// POST — add or update a calendar event (owner/c_suite only)
export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasMinRole(session.roleLevel as RoleLevel, "c_suite")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  try {
    const { id, title, eventDate, eventType, recurrence } = await request.json();
    if (!title || !eventDate) {
      return NextResponse.json({ error: "title and eventDate are required" }, { status: 400 });
    }

    const convex = getConvexClient();

    // If id is provided, update existing event
    if (id) {
      await convex.mutation(api.bulletin.updateCalendarEvent, {
        id: id as any,
        title,
        eventDate,
        eventType: eventType || "custom",
        recurrence: recurrence || "none",
      });
      return NextResponse.json({ id });
    }

    const newId = await convex.mutation(api.bulletin.createCalendarEvent, {
      title,
      eventDate,
      eventType: eventType || "custom",
      recurrence: recurrence || "none",
    });

    return NextResponse.json({ id: newId });
  } catch (error) {
    console.error("Calendar create error:", error);
    return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
  }
}

// DELETE — remove a calendar event (owner/c_suite only)
export async function DELETE(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasMinRole(session.roleLevel as RoleLevel, "c_suite")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const convex = getConvexClient();
    await convex.mutation(api.bulletin.deleteCalendarEvent, { id: id as any });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Calendar delete error:", error);
    return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
  }
}
