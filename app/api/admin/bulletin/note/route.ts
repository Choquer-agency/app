import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { getSession } from "@/lib/admin-auth";

export async function PUT(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { content } = await request.json();
    if (typeof content !== "string") {
      return NextResponse.json({ error: "content must be a string" }, { status: 400 });
    }

    await sql`
      INSERT INTO personal_notes (team_member_id, content, updated_at)
      VALUES (${session.teamMemberId}, ${content}, NOW())
      ON CONFLICT (team_member_id)
      DO UPDATE SET content = ${content}, updated_at = NOW()
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Save personal note error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save note" },
      { status: 500 }
    );
  }
}
