import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { getSession } from "@/lib/admin-auth";

// POST: Save a meeting transcript
export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { teamMemberIds, teamMemberId, transcript, meetingDate, source } = await request.json();

    // Support both single ID and array of IDs
    const memberIds: number[] = teamMemberIds || (teamMemberId ? [teamMemberId] : []);

    if (memberIds.length === 0 || !transcript?.trim()) {
      return NextResponse.json(
        { error: "At least one team member and transcript are required" },
        { status: 400 }
      );
    }

    const date = meetingDate || new Date().toISOString().split("T")[0];
    const src = source || "manual";
    const text = transcript.trim();

    // Create a meeting note for each team member (same transcript, linked to each)
    const created = [];
    for (const memberId of memberIds) {
      const { rows } = await sql`
        INSERT INTO meeting_notes (team_member_id, created_by_id, transcript, meeting_date, source)
        VALUES (${memberId}, ${session.teamMemberId}, ${text}, ${date}, ${src})
        RETURNING *
      `;
      created.push(rows[0]);
    }

    // Return the first one (used for extraction), but all are saved
    return NextResponse.json({ ...created[0], allIds: created.map((r) => r.id) }, { status: 201 });
  } catch (error) {
    console.error("Failed to save meeting note:", error);
    return NextResponse.json({ error: "Failed to save meeting note" }, { status: 500 });
  }
}

// GET: List meeting notes (optionally filtered by team member)
export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const memberId = request.nextUrl.searchParams.get("memberId");

    const { rows } = memberId
      ? await sql`
          SELECT mn.*, tm.name AS member_name
          FROM meeting_notes mn
          JOIN team_members tm ON tm.id = mn.team_member_id
          WHERE mn.team_member_id = ${Number(memberId)}
          ORDER BY mn.meeting_date DESC, mn.created_at DESC
          LIMIT 50
        `
      : await sql`
          SELECT mn.*, tm.name AS member_name
          FROM meeting_notes mn
          JOIN team_members tm ON tm.id = mn.team_member_id
          ORDER BY mn.meeting_date DESC, mn.created_at DESC
          LIMIT 50
        `;

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Failed to fetch meeting notes:", error);
    return NextResponse.json({ error: "Failed to fetch meeting notes" }, { status: 500 });
  }
}

// DELETE: Remove a meeting note
export async function DELETE(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await sql`DELETE FROM meeting_notes WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete meeting note:", error);
    return NextResponse.json({ error: "Failed to delete meeting note" }, { status: 500 });
  }
}
