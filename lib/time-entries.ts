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

// === Client Hour Cap ===

export async function getClientHourCap(
  clientId: number | string,
  month: string
): Promise<ClientHoursSummary> {
  const { totalHours, byTicket } = await getMonthlyHoursForClient(clientId, month);

  // Get total included hours from all active packages
  const convex = getConvexClient();
  let includedHours = 0;
  let clientName = "";
  try {
    const client = await convex.query(api.clients.getById, { id: clientId as any });
    clientName = (client as any)?.name ?? "";
    const packages = await convex.query(api.clientPackages.listByClient, { clientId: clientId as any });
    for (const cp of packages as any[]) {
      if (cp.active) {
        includedHours += cp.customHours ?? cp.packageHoursIncluded ?? 0;
      }
    }
  } catch {}

  const percentUsed = includedHours > 0 ? Math.round((totalHours / includedHours) * 100) : 0;
  const status = percentUsed >= 100 ? "exceeded" : percentUsed >= 80 ? "warning" : "ok";

  return {
    clientId: clientId as any,
    clientName,
    month,
    loggedHours: Math.round(totalHours * 100) / 100,
    includedHours,
    percentUsed,
    status,
    byTicket,
  };
}

// === Service Board Hour Aggregation (per category) ===

export async function getServiceHoursForClient(
  clientId: number | string,
  category: ServiceBoardCategory,
  month: string
): Promise<{ totalHours: number; byTicket: Array<{ ticketId: string; ticketNumber: string; ticketTitle: string; hours: number }> }> {
  // Requires cross-table queries — simplified return
  return { totalHours: 0, byTicket: [] };
}

export async function getServiceHourCap(
  clientId: number | string,
  category: ServiceBoardCategory,
  clientPackageId: number | string,
  month: string
): Promise<ServiceHoursSummary> {
  const { totalHours, byTicket } = await getServiceHoursForClient(clientId, category, month);

  return {
    clientId: clientId as any,
    category,
    month,
    loggedHours: Math.round(totalHours * 100) / 100,
    includedHours: 0,
    percentUsed: 0,
    status: "ok",
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
  // Would need a dedicated Convex query scanning running timers > 10 hours.
  // Return empty for now.
  return [];
}
