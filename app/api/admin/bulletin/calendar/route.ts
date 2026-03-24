import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { getSession } from "@/lib/admin-auth";
import { hasMinRole, type RoleLevel } from "@/lib/permissions";

// GET — list all calendar events
export async function GET(request: NextRequest) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { rows } = await sql`
      SELECT id, title, event_date, event_type, recurrence
      FROM calendar_events
      ORDER BY event_date ASC
    `;
    return NextResponse.json(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        eventDate: (r.event_date as Date).toISOString().split("T")[0],
        eventType: r.event_type,
        recurrence: r.recurrence || "none",
      }))
    );
  } catch (error) {
    console.error("Calendar fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch calendar" }, { status: 500 });
  }
}

// POST — add a calendar event (owner/c_suite only)
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

    // If id is provided, update existing event
    if (id) {
      await sql`
        UPDATE calendar_events
        SET title = ${title}, event_date = ${eventDate}, event_type = ${eventType || "custom"}, recurrence = ${recurrence || "none"}
        WHERE id = ${id}
      `;
      return NextResponse.json({ id });
    }

    const { rows } = await sql`
      INSERT INTO calendar_events (title, event_date, event_type, recurrence)
      VALUES (${title}, ${eventDate}, ${eventType || "custom"}, ${recurrence || "none"})
      RETURNING id
    `;

    return NextResponse.json({ id: rows[0].id });
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

    await sql`DELETE FROM calendar_events WHERE id = ${parseInt(id)}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Calendar delete error:", error);
    return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
  }
}
