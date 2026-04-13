import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

type MemberStatus = "idle" | "break" | "offline" | "done";

interface TeamMemberStatusEntry {
  id: string;
  name: string;
  profilePicUrl: string | null;
  color: string | null;
  role: string;
  status: MemberStatus;
  clockInTime: string | null;
}

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const convex = getConvexClient();

  // Fetch active team members
  const members = await convex.query(api.teamMembers.list, {
    activeOnly: true,
  });

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Vancouver" });

  // Fetch today's timesheet entries for all members
  const timesheetEntries = await convex.query(
    api.timesheetEntries.listByDateRange,
    { startDate: today, endDate: today }
  );

  // Build status per member. Intentionally no visibility into running
  // ticket timers — timers are private per user.
  const teamStatus: TeamMemberStatusEntry[] = [];

  // Filter out members on leave/terminated/past and bookkeepers
  const eligibleMembers = (members as any[]).filter((member) => {
    const status = member.employeeStatus || "active";
    if (status !== "active") return false;
    if (member.roleLevel === "bookkeeper") return false;
    return true;
  });

  for (const member of eligibleMembers) {
    const shift = (timesheetEntries as any[]).find(
      (e) => e.teamMemberId === member._id && !e.clockOutTime
    );

    const completedShift = (timesheetEntries as any[]).find(
      (e) => e.teamMemberId === member._id && e.clockOutTime
    );

    let status: MemberStatus = "offline";

    if (shift) {
      status = "idle"; // clocked in (available)
      // Check for active break
      try {
        const breaks = await convex.query(api.timesheetBreaks.listByEntry, {
          timesheetEntryId: shift._id,
        });
        const activeBreak = (breaks as any[]).find(
          (b) => b.endTime === undefined
        );
        if (activeBreak) {
          status = "break";
        }
      } catch {}
    } else if (completedShift) {
      status = "done";
    }

    teamStatus.push({
      id: member._id,
      name: member.name,
      profilePicUrl: member.profilePicUrl ?? null,
      color: member.color ?? null,
      role: member.role ?? "",
      status,
      clockInTime: shift?.clockInTime ?? null,
    });
  }

  // Sort: idle (available) first, then break, then done, then offline
  const statusOrder: Record<MemberStatus, number> = {
    idle: 0,
    break: 1,
    done: 2,
    offline: 3,
  };
  teamStatus.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  return NextResponse.json(teamStatus);
}
