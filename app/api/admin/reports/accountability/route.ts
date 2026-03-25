import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.roleLevel as any, "report:accountability")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const startDate = url.searchParams.get("start");
  const endDate = url.searchParams.get("end");

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "start and end query params required" },
      { status: 400 }
    );
  }

  const convex = getConvexClient();

  // Fetch team members
  const members = await convex.query(api.teamMembers.list, {
    activeOnly: true,
  });

  // Fetch timesheet entries for the period
  const timesheetEntries = await convex.query(
    api.timesheetEntries.listByDateRange,
    { startDate, endDate }
  );

  // Fetch all time entries (ticket work) — we need all recent ones
  const allTimeEntries = await convex.query(api.timeEntries.listAll, {
    limit: 5000,
  });

  // Filter time entries to the date range
  const periodStart = new Date(startDate).getTime();
  const periodEnd = new Date(endDate + "T23:59:59").getTime();

  const filteredTimeEntries = (allTimeEntries as any[]).filter((e) => {
    if (!e.startTime) return false;
    const start = new Date(e.startTime).getTime();
    return start >= periodStart && start <= periodEnd;
  });

  // Build per-member accountability data
  const report = (members as any[]).map((member) => {
    // Timesheet: total clocked-in minutes for period
    const memberShifts = (timesheetEntries as any[]).filter(
      (e) => e.teamMemberId === member._id
    );

    let clockedMinutes = 0;
    let breakMinutes = 0;
    let workDays = 0;
    const dailyBreakdown: Array<{
      date: string;
      clockedMinutes: number;
      loggedMinutes: number;
      breakMinutes: number;
      gapMinutes: number;
    }> = [];

    for (const shift of memberShifts) {
      if (shift.isSickDay || shift.isVacation) continue;
      workDays++;
      const shiftWorkedMinutes = shift.workedMinutes ?? 0;
      const shiftBreakMinutes = shift.totalBreakMinutes ?? 0;
      clockedMinutes += shiftWorkedMinutes;
      breakMinutes += shiftBreakMinutes;

      // Compute logged minutes for this specific date
      const dayStart = new Date(shift.date + "T00:00:00").getTime();
      const dayEnd = new Date(shift.date + "T23:59:59").getTime();
      let dayLoggedSeconds = 0;
      for (const te of filteredTimeEntries) {
        if (te.teamMemberId !== member._id) continue;
        const teStart = new Date(te.startTime).getTime();
        if (teStart < dayStart || teStart > dayEnd) continue;
        if (te.endTime) {
          const teEnd = new Date(te.endTime).getTime();
          dayLoggedSeconds += Math.round((teEnd - teStart) / 1000);
        }
      }
      const dayLoggedMinutes = Math.round(dayLoggedSeconds / 60);
      const gapMinutes = Math.max(0, shiftWorkedMinutes - dayLoggedMinutes);

      dailyBreakdown.push({
        date: shift.date,
        clockedMinutes: shiftWorkedMinutes,
        loggedMinutes: dayLoggedMinutes,
        breakMinutes: shiftBreakMinutes,
        gapMinutes,
      });
    }

    // Time entries: total logged seconds for period
    const memberTimeEntries = filteredTimeEntries.filter(
      (e) => e.teamMemberId === member._id && e.endTime
    );
    let loggedSeconds = 0;
    for (const te of memberTimeEntries) {
      const start = new Date(te.startTime).getTime();
      const end = new Date(te.endTime).getTime();
      loggedSeconds += Math.round((end - start) / 1000);
    }
    const loggedMinutes = Math.round(loggedSeconds / 60);

    const gapMinutes = Math.max(0, clockedMinutes - loggedMinutes);
    const accountabilityPercent =
      clockedMinutes > 0
        ? Math.min(100, Math.round((loggedMinutes / clockedMinutes) * 100))
        : 0;

    // Sort daily breakdown by date desc
    dailyBreakdown.sort((a, b) => b.date.localeCompare(a.date));

    return {
      teamMemberId: member._id,
      memberName: member.name,
      profilePicUrl: member.profilePicUrl ?? null,
      color: member.color ?? null,
      clockedMinutes,
      loggedMinutes,
      breakMinutes,
      gapMinutes,
      accountabilityPercent,
      workDays,
      dailyBreakdown,
    };
  });

  // Filter out members with no work days and sort by accountability ascending
  const filtered = report.filter((r) => r.workDays > 0);
  filtered.sort((a, b) => a.accountabilityPercent - b.accountabilityPercent);

  return NextResponse.json(filtered);
}
