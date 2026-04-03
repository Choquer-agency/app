import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import { TimeEntry, RunningTimer, ClientHoursSummary, TeamTimeReportEntry, ServiceHoursSummary, ServiceBoardCategory } from "@/types";

// === Doc Mapper ===

function docToTimeEntry(doc: any): TimeEntry {
  return {
    id: doc._id,
    ticketId: doc.ticketId,
    teamMemberId: doc.teamMemberId,
    startTime: doc.startTime ?? "",
    endTime: doc.endTime ?? null,
    durationSeconds: doc.durationSeconds ?? null,
    isManual: doc.isManual ?? false,
    note: doc.note ?? "",
    createdAt: doc._creationTime
      ? new Date(doc._creationTime).toISOString()
      : "",
    // Joined fields (not available from basic Convex queries)
    memberName: doc.memberName ?? undefined,
    memberColor: doc.memberColor ?? undefined,
    memberProfilePicUrl: doc.memberProfilePicUrl ?? undefined,
    ticketNumber: doc.ticketNumber ?? undefined,
    ticketTitle: doc.ticketTitle ?? undefined,
    clientId: doc.clientId ?? null,
    clientName: doc.clientName ?? null,
  };
}

// === Timer Operations ===

export async function startTimer(
  ticketId: number | string,
  teamMemberId: number | string
): Promise<TimeEntry> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.timeEntries.start, {
    ticketId: ticketId as any,
    teamMemberId: teamMemberId as any,
  });
  return docToTimeEntry(doc);
}

export async function stopTimer(entryId: number | string): Promise<TimeEntry | null> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.timeEntries.stop, {
    id: entryId as any,
  });
  if (!doc) return null;
  return docToTimeEntry(doc);
}

export async function stopTimerByMember(teamMemberId: number | string): Promise<TimeEntry | null> {
  const convex = getConvexClient();
  // Get the running timer first, then stop it
  const running = await convex.query(api.timeEntries.getRunning, {
    teamMemberId: teamMemberId as any,
  });
  if (!running) return null;

  const doc = await convex.mutation(api.timeEntries.stop, {
    id: running._id as any,
  });
  if (!doc) return null;
  return docToTimeEntry(doc);
}

export async function getRunningTimer(teamMemberId: number | string): Promise<RunningTimer | null> {
  const convex = getConvexClient();
  const entry = await convex.query(api.timeEntries.getRunning, {
    teamMemberId: teamMemberId as any,
  });
  if (!entry) return null;

  return {
    entryId: entry._id,
    ticketId: entry.ticketId,
    ticketNumber: (entry as any).ticketNumber ?? "",
    ticketTitle: (entry as any).ticketTitle ?? "",
    startTime: entry.startTime,
    clientName: (entry as any).clientName ?? null,
    serviceCategory: (entry as any).serviceCategory ?? null,
    clientId: (entry as any).clientId ?? null,
  };
}

// === Manual Entry ===

export async function addManualEntry(data: {
  ticketId: number | string;
  teamMemberId: number | string;
  startTime: string;
  endTime: string;
  note?: string;
}): Promise<TimeEntry> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.timeEntries.create, {
    ticketId: data.ticketId as any,
    teamMemberId: data.teamMemberId as any,
    startTime: data.startTime,
    endTime: data.endTime,
    note: data.note,
  });
  return docToTimeEntry(doc);
}

// === CRUD ===

export async function editTimeEntry(
  entryId: number | string,
  data: { startTime?: string; endTime?: string; note?: string }
): Promise<TimeEntry | null> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.timeEntries.update, {
    id: entryId as any,
    startTime: data.startTime,
    endTime: data.endTime,
    note: data.note,
  });
  if (!doc) return null;
  return docToTimeEntry(doc);
}

export async function deleteTimeEntry(entryId: number | string): Promise<boolean> {
  const convex = getConvexClient();
  try {
    await convex.mutation(api.timeEntries.remove, { id: entryId as any });
    return true;
  } catch {
    return false;
  }
}

// === Queries ===

export async function getTimeEntriesForTicket(ticketId: number | string): Promise<TimeEntry[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.timeEntries.listByTicket, {
    ticketId: ticketId as any,
  });
  return docs.map(docToTimeEntry);
}

export async function getTotalSecondsForTicket(ticketId: number | string): Promise<number> {
  const convex = getConvexClient();
  const docs = await convex.query(api.timeEntries.listByTicket, {
    ticketId: ticketId as any,
  });
  let total = 0;
  for (const doc of docs) {
    if (doc.endTime && doc.startTime) {
      const start = new Date(doc.startTime).getTime();
      const end = new Date(doc.endTime).getTime();
      total += Math.round((end - start) / 1000);
    }
  }
  return total;
}

// === Monthly Hours (with month-boundary clamping) ===

export async function getMonthlyHoursForClient(
  clientId: number | string,
  month: string
): Promise<{ totalHours: number; byTicket: Array<{ ticketId: string; ticketNumber: string; ticketTitle: string; hours: number }> }> {
  const convex = getConvexClient();
  const monthStart = new Date(month);
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);

  // Get all tickets for this client
  const tickets = await convex.query(api.tickets.list, {
    clientId: clientId as any,
    archived: false,
    limit: 500,
  });

  const byTicket: Array<{ ticketId: string; ticketNumber: string; ticketTitle: string; hours: number }> = [];
  let totalSeconds = 0;

  for (const ticket of tickets as any[]) {
    const entries = await convex.query(api.timeEntries.listByTicket, {
      ticketId: ticket._id,
    });

    let ticketSeconds = 0;
    for (const entry of entries as any[]) {
      if (!entry.startTime) continue;
      const start = new Date(entry.startTime);
      const end = entry.endTime ? new Date(entry.endTime) : new Date();
      if (start >= monthEnd || end <= monthStart) continue;
      const clampedStart = start < monthStart ? monthStart : start;
      const clampedEnd = end > monthEnd ? monthEnd : end;
      ticketSeconds += (clampedEnd.getTime() - clampedStart.getTime()) / 1000;
    }

    if (ticketSeconds > 0) {
      const hours = Math.round((ticketSeconds / 3600) * 100) / 100;
      byTicket.push({
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber ?? "",
        ticketTitle: ticket.title ?? "",
        hours,
      });
      totalSeconds += ticketSeconds;
    }
  }

  return {
    totalHours: Math.round((totalSeconds / 3600) * 100) / 100,
    byTicket,
  };
}

export async function getMonthlyHoursForMember(
  teamMemberId: number | string,
  month: string
): Promise<number> {
  const convex = getConvexClient();
  const monthStart = new Date(month);
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);

  const docs = await convex.query(api.timeEntries.listByMember, {
    teamMemberId: teamMemberId as any,
    limit: 1000,
  });

  let totalSeconds = 0;
  for (const doc of docs) {
    if (!doc.startTime) continue;
    const start = new Date(doc.startTime);
    const end = doc.endTime ? new Date(doc.endTime) : new Date();

    if (start >= monthEnd || end <= monthStart) continue;

    const clampedStart = start < monthStart ? monthStart : start;
    const clampedEnd = end > monthEnd ? monthEnd : end;
    totalSeconds += (clampedEnd.getTime() - clampedStart.getTime()) / 1000;
  }

  return Math.round((totalSeconds / 3600) * 100) / 100;
}

// === Bulk Hours In Range (for one-time balance calculation) ===

async function getClientHoursInRange(
  clientId: number | string,
  startDate: Date,
  endDate: Date
): Promise<Map<string, number>> {
  const convex = getConvexClient();
  const tickets = await convex.query(api.tickets.list, {
    clientId: clientId as any,
    archived: false,
    limit: 500,
  });

  // Collect all time entries across all tickets in one pass
  const monthlySeconds = new Map<string, number>();

  for (const ticket of tickets as any[]) {
    const entries = await convex.query(api.timeEntries.listByTicket, {
      ticketId: ticket._id,
    });

    for (const entry of entries as any[]) {
      if (!entry.startTime) continue;
      const start = new Date(entry.startTime);
      const end = entry.endTime ? new Date(entry.endTime) : new Date();
      if (start >= endDate || end <= startDate) continue;

      const clampedStart = start < startDate ? startDate : start;
      const clampedEnd = end > endDate ? endDate : end;
      const seconds = (clampedEnd.getTime() - clampedStart.getTime()) / 1000;
      if (seconds <= 0) continue;

      // Bucket by month — an entry spanning months gets split
      let cursor = new Date(clampedStart);
      while (cursor < clampedEnd) {
        const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
        const monthBoundary = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        const segEnd = monthBoundary < clampedEnd ? monthBoundary : clampedEnd;
        const segSeconds = (segEnd.getTime() - cursor.getTime()) / 1000;
        monthlySeconds.set(monthKey, (monthlySeconds.get(monthKey) ?? 0) + segSeconds);
        cursor = segEnd;
      }
    }
  }

  // Convert seconds to hours
  const monthlyHours = new Map<string, number>();
  for (const [key, secs] of monthlySeconds) {
    monthlyHours.set(key, Math.round((secs / 3600) * 100) / 100);
  }
  return monthlyHours;
}

// === Client Hour Cap ===

export async function getClientHourCap(
  clientId: number | string,
  month: string
): Promise<ClientHoursSummary> {
  const { totalHours, byTicket } = await getMonthlyHoursForClient(clientId, month);

  const convex = getConvexClient();
  let clientName = "";
  let monthlyRetainerHours = 0;
  let oneTimeTotal = 0;
  let hasHourCap = false;
  let earliestOneTimeDate: string | null = null;

  try {
    const client = await convex.query(api.clients.getById, { id: clientId as any });
    clientName = (client as any)?.name ?? "";
    const packages = await convex.query(api.clientPackages.listByClient, { clientId: clientId as any });

    for (const cp of packages as any[]) {
      if (!cp.active) continue;
      const hours = cp.customHours ?? cp.packageHoursIncluded ?? null;
      if (hours === null) continue;

      hasHourCap = true;

      if (cp.isOneTime) {
        oneTimeTotal += hours;
        const oneTimeStart = cp.paidDate ?? cp.signupDate ?? null;
        if (oneTimeStart && (!earliestOneTimeDate || oneTimeStart < earliestOneTimeDate)) {
          earliestOneTimeDate = oneTimeStart;
        }
      } else {
        monthlyRetainerHours += hours;
      }
    }
  } catch {}

  // Calculate one-time balance by computing historical spillover
  let oneTimeBalanceHours = oneTimeTotal;

  if (oneTimeTotal > 0 && earliestOneTimeDate) {
    const rangeStart = new Date(earliestOneTimeDate.slice(0, 7) + "-01");
    const currentMonth = new Date(month);
    const rangeEnd = new Date(currentMonth);
    rangeEnd.setMonth(rangeEnd.getMonth() + 1);

    const monthlyHoursMap = await getClientHoursInRange(clientId, rangeStart, rangeEnd);

    // Iterate each historical month (before current) to compute spillover
    const cursor = new Date(rangeStart);
    const currentMonthKey = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}`;

    while (cursor < currentMonth) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      if (key !== currentMonthKey) {
        const hoursLogged = monthlyHoursMap.get(key) ?? 0;
        const spillover = Math.max(0, hoursLogged - monthlyRetainerHours);
        oneTimeBalanceHours = Math.max(0, oneTimeBalanceHours - spillover);
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  // Current month deduction: monthly retainer consumed first, then one-time
  const monthlyUsed = Math.min(totalHours, monthlyRetainerHours);
  const monthlyUnused = monthlyRetainerHours - monthlyUsed;
  const currentSpillover = Math.max(0, totalHours - monthlyRetainerHours);
  const oneTimeUsedThisMonth = Math.min(currentSpillover, oneTimeBalanceHours);
  const oneTimeRemainingAfter = oneTimeBalanceHours - oneTimeUsedThisMonth;

  // Total available = monthly retainer + remaining one-time (before this month)
  const includedHours = monthlyRetainerHours + oneTimeBalanceHours;
  const percentUsed = hasHourCap && includedHours > 0 ? Math.round((totalHours / includedHours) * 100) : 0;
  const status = !hasHourCap ? "ok" : percentUsed >= 100 ? "exceeded" : percentUsed >= 80 ? "warning" : "ok";

  return {
    clientId: clientId as any,
    clientName,
    month,
    loggedHours: Math.round(totalHours * 100) / 100,
    includedHours,
    percentUsed,
    status,
    byTicket,
    monthlyRetainerHours,
    oneTimeBalanceHours: Math.round(oneTimeRemainingAfter * 100) / 100,
    oneTimeUsedThisMonth: Math.round(oneTimeUsedThisMonth * 100) / 100,
    monthlyUnused: Math.round(monthlyUnused * 100) / 100,
  };
}

// === Service Board Hour Aggregation (per category) ===

export async function getServiceHoursForClient(
  clientId: number | string,
  category: ServiceBoardCategory,
  month: string
): Promise<{ totalHours: number; byTicket: Array<{ ticketId: string; ticketNumber: string; ticketTitle: string; hours: number }> }> {
  const convex = getConvexClient();
  const monthStart = new Date(month);
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);

  const tickets = await convex.query(api.tickets.list, {
    clientId: clientId as any,
    archived: false,
    limit: 500,
  });

  // Filter tickets by service category
  const categoryTickets = (tickets as any[]).filter((t) => t.serviceCategory === category);

  const byTicket: Array<{ ticketId: string; ticketNumber: string; ticketTitle: string; hours: number }> = [];
  let totalSeconds = 0;

  for (const ticket of categoryTickets) {
    const entries = await convex.query(api.timeEntries.listByTicket, {
      ticketId: ticket._id,
    });

    let ticketSeconds = 0;
    for (const entry of entries as any[]) {
      if (!entry.startTime) continue;
      const start = new Date(entry.startTime);
      const end = entry.endTime ? new Date(entry.endTime) : new Date();
      if (start >= monthEnd || end <= monthStart) continue;
      const clampedStart = start < monthStart ? monthStart : start;
      const clampedEnd = end > monthEnd ? monthEnd : end;
      ticketSeconds += (clampedEnd.getTime() - clampedStart.getTime()) / 1000;
    }

    if (ticketSeconds > 0) {
      const hours = Math.round((ticketSeconds / 3600) * 100) / 100;
      byTicket.push({ ticketId: ticket._id, ticketNumber: ticket.ticketNumber ?? "", ticketTitle: ticket.title ?? "", hours });
      totalSeconds += ticketSeconds;
    }
  }

  return { totalHours: Math.round((totalSeconds / 3600) * 100) / 100, byTicket };
}

export async function getServiceHourCap(
  clientId: number | string,
  category: ServiceBoardCategory,
  clientPackageId: number | string,
  month: string
): Promise<ServiceHoursSummary> {
  const { totalHours, byTicket } = await getServiceHoursForClient(clientId, category, month);

  // Get the package to find included hours
  const convex = getConvexClient();
  let includedHours = 0;
  try {
    const cp = await convex.query(api.clientPackages.listByClient, { clientId: clientId as any });
    const match = (cp as any[]).find((c) => c._id === clientPackageId);
    includedHours = match?.customHours ?? match?.packageHoursIncluded ?? 0;
  } catch {}

  const percentUsed = includedHours > 0 ? Math.round((totalHours / includedHours) * 100) : 0;
  const status = percentUsed >= 100 ? "exceeded" : percentUsed >= 80 ? "warning" : "ok";

  return {
    clientId: clientId as any,
    category,
    month,
    loggedHours: Math.round(totalHours * 100) / 100,
    includedHours,
    percentUsed,
    status,
    byTicket,
  };
}

// === Team Report ===

export async function getTeamTimeReport(
  period: "week" | "month"
): Promise<TeamTimeReportEntry[]> {
  // This requires cross-table joins (time_entries + team_members + tickets + clients).
  // Would need a dedicated Convex action. Return empty for now.
  return [];
}

// === Runaway Timer Detection ===

export async function checkRunawayTimers(): Promise<TimeEntry[]> {
  const convex = getConvexClient();
  const running = await convex.query(api.timeEntries.listRunning, {});
  const now = Date.now();
  const TEN_HOURS = 10 * 60 * 60 * 1000;

  return (running as any[])
    .filter((e) => {
      const start = new Date(e.startTime).getTime();
      return (now - start) > TEN_HOURS;
    })
    .map(docToTimeEntry);
}
