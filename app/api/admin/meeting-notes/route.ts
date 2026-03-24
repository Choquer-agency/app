import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

// POST: Save a meeting transcript
export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { teamMemberIds, teamMemberId, transcript, meetingDate, source } = await request.json();

    // Support both single ID and array of IDs
    const memberIds: string[] = teamMemberIds || (teamMemberId ? [teamMemberId] : []);

    if (memberIds.length === 0 || !transcript?.trim()) {
      return NextResponse.json(
        { error: "At least one team member and transcript are required" },
        { status: 400 }
      );
    }

    const date = meetingDate || new Date().toISOString().split("T")[0];
    const src = source || "manual";
    const text = transcript.trim();

    const convex = getConvexClient();

    // Create a meeting note for each team member (same transcript, linked to each)
    const created: any[] = [];
    for (const memberId of memberIds) {
      const note = await convex.mutation(api.meetingNotes.create, {
        teamMemberId: memberId as any,
        createdById: session.teamMemberId as any,
        transcript: text,
        meetingDate: date,
        source: src,
      });
      created.push(note);
    }

    // Return the first one (used for extraction), but all are saved
    const first = created[0];
    return NextResponse.json(
      {
        id: first._id,
        team_member_id: first.teamMemberId,
        created_by_id: first.createdById,
        transcript: first.transcript,
        meeting_date: first.meetingDate,
        source: first.source,
        allIds: created.map((r: any) => r._id),
      },
      { status: 201 }
    );
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
    const convex = getConvexClient();

    let notes: any[];
    if (memberId) {
      notes = await convex.query(api.meetingNotes.listByMember, {
        teamMemberId: memberId as any,
        limit: 50,
      });
    } else {
      notes = await convex.query(api.meetingNotes.listAll, { limit: 50 });
    }

    // Fetch team member names for display
    const allMembers = await convex.query(api.teamMembers.list, {});
    const memberMap = new Map<string, string>();
    for (const m of allMembers as any[]) {
      memberMap.set(m._id, m.name);
    }

    const rows = (notes as any[]).map((n: any) => ({
      id: n._id,
      team_member_id: n.teamMemberId,
      created_by_id: n.createdById,
      transcript: n.transcript,
      summary: n.summary || null,
      raw_extraction: n.rawExtraction || null,
      meeting_date: n.meetingDate,
      source: n.source,
      created_at: n._creationTime ? new Date(n._creationTime).toISOString() : null,
      member_name: memberMap.get(n.teamMemberId) || "Unknown",
    }));

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

    const convex = getConvexClient();
    await convex.mutation(api.meetingNotes.remove, { id: id as any });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete meeting note:", error);
    return NextResponse.json({ error: "Failed to delete meeting note" }, { status: 500 });
  }
}
