import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

type MemberStatus = "working" | "idle" | "break" | "offline" | "done";

interface TeamMemberStatusEntry {
  id: string;
  name: string;
  profilePicUrl: string | null;
  color: string | null;
  role: string;
  status: MemberStatus;
  clockInTime: string | null;
  activeTicketId: string | null;
  activeTicketNumber: string | null;
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

  const today = new Date().toISOString().split("T")[0];

  // Fetch today's timesheet entries for all members
  const timesheetEntries = await convex.query(
    api.timesheetEntries.listByDateRange,
    { startDate: today, endDate: today }
  );

  // Fetch all running ticket timers
  const runningTimers = await convex.query(api.timeEntries.listRunning, {});

  // Build status per member
  const teamStatus: TeamMemberStatusEntry[] = [];

  for (const member of members as any[]) {
    const shift = (timesheetEntries as any[]).find(
      (e) => e.teamMemberId === member._id && !e.clockOutTime
    );

    const completedShift = (timesheetEntries as any[]).find(
      (e) => e.teamMemberId === member._id && e.clockOutTime
    );

    const runningTimer = (runningTimers as any[]).find(
      (t) => t.teamMemberId === member._id
    );

    let status: MemberStatus = "offline";

    if (shift) {
      status = "idle"; // clocked in but no active timer
      if (runningTimer) {
        status = "working";
      }
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

    // Fetch ticket number if there's an active timer
    let activeTicketNumber: string | null = null;
    if (runningTimer) {
      try {
        const ticket = await convex.query(api.tickets.getById, {
          id: runningTimer.ticketId,
        });
        activeTicketNumber = (ticket as any)?.ticketNumber ?? null;
      } catch {}
    }

    teamStatus.push({
      id: member._id,
      name: member.name,
      profilePicUrl: member.profilePicUrl ?? null,
      color: member.color ?? null,
      role: member.role ?? "",
      status,
      clockInTime: shift?.clockInTime ?? null,
      activeTicketId: runningTimer?.ticketId ?? null,
      activeTicketNumber,
    });
  }

  // Sort: working first, then idle, then break, then done, then offline
  const statusOrder: Record<MemberStatus, number> = {
    working: 0,
    idle: 1,
    break: 2,
    done: 3,
    offline: 4,
  };
  teamStatus.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  return NextResponse.json(teamStatus);
}
