import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { getSession } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch tags from DB (not stored in cookie)
  let tags: string[] = [];
  try {
    const { rows } = await sql`SELECT tags FROM team_members WHERE id = ${session.teamMemberId}`;
    if (rows.length > 0 && Array.isArray(rows[0].tags)) {
      tags = rows[0].tags as string[];
    }
  } catch {
    // tags column may not exist yet
  }

  return NextResponse.json({
    teamMemberId: session.teamMemberId,
    name: session.name,
    email: session.email,
    roleLevel: session.roleLevel,
    tags,
  });
}
