import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { stopTimerByMember } from "@/lib/time-entries";
import { hasPermission } from "@/lib/permissions";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

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
  const convex = getConvexClient();

  // Get all time entries to filter/delete
  // We need to fetch all and then delete matching ones
  const allMembers = await convex.query(api.teamMembers.list, {});
  let cleaned = 0;

  for (const member of allMembers as any[]) {
    const entries = await convex.query(api.timeEntries.listByMember, {
      teamMemberId: member._id as any,
    });

    for (const entry of entries as any[]) {
      if (searchParams.get("reset") === "true") {
        // Nuclear option: delete ALL time entries
        await convex.mutation(api.timeEntries.remove, { id: entry._id as any });
        cleaned++;
      } else {
        // Delete entries with suspiciously long durations (> 1 hour when actual time range is < 15 min)
        if (entry.endTime && entry.durationSeconds > 3600) {
          const startMs = new Date(entry.startTime).getTime();
          const endMs = new Date(entry.endTime).getTime();
          const actualSeconds = (endMs - startMs) / 1000;
          if (actualSeconds < 900) {
            await convex.mutation(api.timeEntries.remove, { id: entry._id as any });
            cleaned++;
          }
        }
      }
    }
  }

  const mode = searchParams.get("reset") === "true" ? "reset" : "cleanup";
  return NextResponse.json({ cleaned, mode });
}
