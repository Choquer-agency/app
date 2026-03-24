import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { getSession } from "@/lib/admin-auth";
import { stopTimerByMember } from "@/lib/time-entries";
import { hasPermission } from "@/lib/permissions";

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entry = await stopTimerByMember(session.teamMemberId);
  if (!entry) {
    return NextResponse.json({ error: "No running timer" }, { status: 404 });
  }
  return NextResponse.json(entry);
}

// DELETE: cleanup — remove all completed entries except the most recent valid ones
// Pass ?reset=true to wipe all entries (for fixing bad test data)
export async function DELETE(request: NextRequest) {
  const session = getSession(request);
  if (!session || !hasPermission(session.roleLevel, "time:delete_entries")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  if (searchParams.get("reset") === "true") {
    // Nuclear option: delete ALL time entries
    const { rowCount } = await sql`DELETE FROM time_entries`;
    return NextResponse.json({ cleaned: rowCount, mode: "reset" });
  }

  // Default: delete entries with suspiciously long durations (> 1 hour when actual time range is < 15 min)
  const { rowCount } = await sql`
    DELETE FROM time_entries
    WHERE end_time IS NOT NULL
      AND duration_seconds > 3600
      AND EXTRACT(EPOCH FROM end_time - start_time) < 900
  `;

  return NextResponse.json({ cleaned: rowCount });
}
