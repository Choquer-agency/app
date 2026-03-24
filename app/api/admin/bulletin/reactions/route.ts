import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { getSession } from "@/lib/admin-auth";

// Toggle a reaction (add if not exists, remove if exists)
export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { announcementId, emoji } = await request.json();
    if (!announcementId || !emoji) {
      return NextResponse.json({ error: "announcementId and emoji are required" }, { status: 400 });
    }

    // Check if reaction already exists
    const { rows: existing } = await sql`
      SELECT id FROM announcement_reactions
      WHERE announcement_id = ${announcementId}
        AND team_member_id = ${session.teamMemberId}
        AND emoji = ${emoji}
    `;

    if (existing.length > 0) {
      // Remove it (toggle off)
      await sql`DELETE FROM announcement_reactions WHERE id = ${existing[0].id}`;
      return NextResponse.json({ action: "removed" });
    } else {
      // Add it
      await sql`
        INSERT INTO announcement_reactions (announcement_id, team_member_id, emoji)
        VALUES (${announcementId}, ${session.teamMemberId}, ${emoji})
      `;
      return NextResponse.json({ action: "added" });
    }
  } catch (error) {
    console.error("Reaction error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to toggle reaction" },
      { status: 500 }
    );
  }
}
