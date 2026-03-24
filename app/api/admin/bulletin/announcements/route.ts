import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { getSession } from "@/lib/admin-auth";
import { hasMinRole, type RoleLevel } from "@/lib/permissions";

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // All team members can post announcements
  try {
    const { title, content, pinned } = await request.json();
    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    // Default expiry: end of today
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const expiresAt = endOfDay.toISOString();

    const result = await sql`
      INSERT INTO announcements (author_id, title, content, pinned, source, announcement_type, expires_at)
      VALUES (${session.teamMemberId}, ${title}, ${content || ""}, ${pinned || false}, 'manual', 'general', ${expiresAt})
      RETURNING id, created_at
    `;

    return NextResponse.json({
      id: result.rows[0].id,
      createdAt: result.rows[0].created_at,
    });
  } catch (error) {
    console.error("Create announcement error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create announcement" },
      { status: 500 }
    );
  }
}

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
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await sql`DELETE FROM announcements WHERE id = ${parseInt(id)}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete announcement error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete announcement" },
      { status: 500 }
    );
  }
}
