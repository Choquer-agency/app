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

export async function stopTimer(
  entryId: number | string,
  teamMemberId: number | string
): Promise<TimeEntry | null> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.timeEntries.stop, {
    id: entryId as any,
    teamMemberId: teamMemberId as any,
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
    teamMemberId: teamMemberId as any,
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

export type ClientHourEntry = {
  id: string;
  memberId: string | null;
  memberName: string;
  memberColor?: string;
  ticketId: string;
  ticketNumber: string;
  ticketTitle: string;
  start: number;
  end: number | null;
  seconds: number;
};

export async function getMonthlyHoursForClient(
  clientId: number | string,
  month: string
): Promise<{
  totalHours: number;
  byTicket: Array<{ ticketId: string; ticketNumber: string; ticketTitle: string; hours: number }>;
  entries: ClientHourEntry[];
}> {
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

  // Fetch all time entries in parallel
  const ticketEntries = await Promise.all(
    (tickets as any[]).map((ticket) =>
      convex.query(api.timeEntries.listByTicket, { ticketId: ticket._id })
        .then((entries) => ({ ticket, entries: entries as any[] }))
    )
  );

  // Team-member lookup for names
  const members = (await convex.query(api.teamMembers.list, { activeOnly: false })) as any[];
  const memberMap = new Map<string, { name: string; color?: string }>();
  for (const m of members) {
    memberMap.set(String(m._id), { name: m.name ?? "Unknown", color: m.color });
  }

  const byTicket: Array<{ ticketId: string; ticketNumber: string; ticketTitle: string; hours: number }> = [];
  const entries: ClientHourEntry[] = [];
  let totalSeconds = 0;

  for (const { ticket, entries: tentries } of ticketEntries) {
    let ticketSeconds = 0;
    for (const entry of tentries) {
      if (!entry.startTime) continue;
      const start = new Date(entry.startTime);
      const end = entry.endTime ? new Date(entry.endTime) : new Date();
      if (start >= monthEnd || end <= monthStart) continue;
      const clampedStart = start < monthStart ? monthStart : start;
      const clampedEnd = end > monthEnd ? monthEnd : end;
      const rate = entry.rate ?? 1.0;
      const seconds = ((clampedEnd.getTime() - clampedStart.getTime()) / 1000) * rate;
      ticketSeconds += seconds;

      const memberInfo = entry.teamMemberId ? memberMap.get(String(entry.teamMemberId)) : undefined;
      entries.push({
        id: String(entry._id),
        memberId: entry.teamMemberId ? String(entry.teamMemberId) : null,
        memberName: memberInfo?.name ?? "Unknown",
        memberColor: memberInfo?.color,
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber ?? "",
        ticketTitle: ticket.title ?? "",
        start: clampedStart.getTime(),
        end: entry.endTime ? clampedEnd.getTime() : null,
        seconds,
      });
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

  // Newest entries first
  entries.sort((a, b) => b.start - a.start);

  return {
    totalHours: Math.round((totalSeconds / 3600) * 100) / 100,
    byTicket,
    entries,
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

  // Fetch all time entries in parallel
  const allEntries = await Promise.all(
    (tickets as any[]).map((ticket) =>
      convex.query(api.timeEntries.listByTicket, { ticketId: ticket._id })
    )
  );

  const monthlySeconds = new Map<string, number>();

  for (const entries of allEntries) {
    for (const entry of entries as any[]) {
      if (!entry.startTime) continue;
      const start = new Date(entry.startTime);
      const end = entry.endTime ? new Date(entry.endTime) : new Date();
      if (start >= endDate || end <= startDate) continue;

      const clampedStart = start < startDate ? startDate : start;
      const clampedEnd = end > endDate ? endDate : end;
      const rate = entry.rate ?? 1.0;
      const seconds = ((clampedEnd.getTime() - clampedStart.getTime()) / 1000) * rate;
      if (seconds <= 0) continue;

      // Bucket by month — an entry spanning months gets split
      let cursor = new Date(clampedStart);
      while (cursor < clampedEnd) {
        const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
        const monthBoundary = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        const segEnd = monthBoundary < clampedEnd ? monthBoundary : clampedEnd;
        const segSeconds = ((segEnd.getTime() - cursor.getTime()) / 1000) * rate;
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
  const { totalHours, byTicket, entries } = await getMonthlyHoursForClient(clientId, month);

  const convex = getConvexClient();
  let clientName = "";
  let monthlyRetainerHours = 0;
  let oneTimeTotal = 0;
  let hasHourCap = false;
  let earliestOneTimeDate: string | null = null;

  type RecurringPkg = { id: string; name: string; hours: number };
  type OneTimePkg = { id: string; name: string; hours: number; date: string | null };
  const recurringPkgs: RecurringPkg[] = [];
  const oneTimePkgs: OneTimePkg[] = [];
  let earliestPackageDate: string | null = null;

  try {
    const client = await convex.query(api.clients.getById, { id: clientId as any });
    clientName = (client as any)?.name ?? "";
    const packages = await convex.query(api.clientPackages.listByClient, { clientId: clientId as any });

    for (const cp of packages as any[]) {
      if (!cp.active) continue;
      const pkgStart = cp.paidDate ?? cp.signupDate ?? null;
      if (pkgStart && (!earliestPackageDate || pkgStart < earliestPackageDate)) {
        earliestPackageDate = pkgStart;
      }
      const hours = cp.customHours ?? cp.packageHoursIncluded ?? null;
      if (hours === null) continue;

      hasHourCap = true;
      const name = cp.packageName ?? cp.name ?? (cp.isOneTime ? "Top-up" : "Retainer");

      if (cp.isOneTime) {
        oneTimeTotal += hours;
        if (pkgStart && (!earliestOneTimeDate || pkgStart < earliestOneTimeDate)) {
          earliestOneTimeDate = pkgStart;
        }
        oneTimePkgs.push({ id: String(cp._id), name, hours, date: pkgStart });
      } else {
        monthlyRetainerHours += hours;
        recurringPkgs.push({ id: String(cp._id), name, hours });
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

  // Build per-pool cards
  const pools: ClientHoursSummary["pools"] = [];
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const statusFor = (percent: number): "ok" | "warning" | "exceeded" =>
    percent >= 100 ? "exceeded" : percent >= 80 ? "warning" : "ok";

  // Recurring: proportional allocation of monthlyUsed
  for (const pkg of recurringPkgs) {
    const share = monthlyRetainerHours > 0 ? pkg.hours / monthlyRetainerHours : 0;
    const used = round2(monthlyUsed * share);
    const included = round2(pkg.hours);
    const percent = included > 0 ? Math.round((used / included) * 100) : 0;
    pools.push({
      id: pkg.id,
      name: pkg.name,
      type: "recurring",
      included,
      used,
      remaining: round2(included - used),
      percent,
      status: statusFor(percent),
    });
  }

  // One-time: lifetime consumption (month-invariant) — top-ups are persistent buckets
  // Compute total one-time hours consumed from earliest purchase to now (not just selected month)
  let lifetimeOneTimeConsumed = 0;
  if (oneTimeTotal > 0 && earliestOneTimeDate) {
    const liftStart = new Date(earliestOneTimeDate.slice(0, 7) + "-01");
    const nowDate = new Date();
    const liftEnd = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 1);
    const liftHoursByMonth = await getClientHoursInRange(clientId, liftStart, liftEnd);
    let totalSpill = 0;
    for (const [, hrs] of liftHoursByMonth) {
      totalSpill += Math.max(0, hrs - monthlyRetainerHours);
    }
    lifetimeOneTimeConsumed = Math.min(totalSpill, oneTimeTotal);
  }

  const oneTimeSorted = [...oneTimePkgs].sort((a, b) => {
    const da = a.date ?? "";
    const db = b.date ?? "";
    return da < db ? -1 : da > db ? 1 : 0;
  });
  let lifetimeRem = lifetimeOneTimeConsumed;
  for (const pkg of oneTimeSorted) {
    const consumed = Math.min(lifetimeRem, pkg.hours);
    lifetimeRem -= consumed;
    const included = round2(pkg.hours);
    const used = round2(consumed);
    const percent = included > 0 ? Math.round((used / included) * 100) : 0;
    pools.push({
      id: pkg.id,
      name: pkg.name,
      type: "one_time",
      included,
      used,
      remaining: round2(included - used),
      percent,
      status: statusFor(percent),
    });
  }

  // Total available = monthly retainer + remaining one-time (before this month)
  const includedHours = monthlyRetainerHours + oneTimeBalanceHours;
  const percentUsed = hasHourCap && includedHours > 0 ? Math.round((totalHours / includedHours) * 100) : 0;
  const status = !hasHourCap ? "ok" : percentUsed >= 100 ? "exceeded" : percentUsed >= 80 ? "warning" : "ok";

  // Navigation bounds
  const now = new Date();
  const maxMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  let minMonth = maxMonth;
  if (earliestPackageDate) {
    minMonth = earliestPackageDate.slice(0, 7) + "-01";
  }

  return {
    clientId: clientId as any,
    clientName,
    month,
    loggedHours: Math.round(totalHours * 100) / 100,
    includedHours,
    percentUsed,
    status,
    byTicket,
    entries,
    pools,
    minMonth,
    maxMonth,
    monthlyRetainerHours,
    oneTimeBalanceHours: Math.round(oneTimeRemainingAfter * 100) / 100,
    oneTimeUsedThisMonth: Math.round(oneTimeUsedThisMonth * 100) / 100,
    monthlyUnused: Math.round(monthlyUnused * 100) / 100,
  };
}

// === Service Board Hour Aggregation (per client package, with cascade) ===

// Earlier categories fill first; overflow spills to the next. Unknown categories go to the tail.
const PACKAGE_CASCADE_ORDER: readonly string[] = [
  "website",
  "seo",
  "retainer",
  "google_ads",
  "blog",
  "hosting",
  "ai",
  "ai_chat",
];

function cascadeRank(category: string | undefined): number {
  const idx = PACKAGE_CASCADE_ORDER.indexOf(category ?? "");
  return idx === -1 ? PACKAGE_CASCADE_ORDER.length : idx;
}

type CascadePackage = {
  id: string;
  category: string;
  allocatedHours: number;
};

/**
 * Allocate a client's total monthly logged hours across their packages in cascade order.
 * Each package soaks up to its `allocatedHours`; remainder spills to the next. Any final
 * overflow lands on the last package so its battery visibly exceeds 100%.
 */
export function allocateClientHoursByCascade(
  totalLoggedHours: number,
  clientPackages: CascadePackage[]
): Map<string, number> {
  const result = new Map<string, number>();
  if (clientPackages.length === 0) return result;

  const sorted = [...clientPackages].sort((a, b) => cascadeRank(a.category) - cascadeRank(b.category));
  let remaining = totalLoggedHours;

  for (const pkg of sorted) {
    const cap = Math.max(0, pkg.allocatedHours);
    const take = Math.min(remaining, cap);
    result.set(pkg.id, take);
    remaining -= take;
    if (remaining <= 0) break;
  }

  // Overflow beyond every package's cap lands on the last (lowest-priority) package
  if (remaining > 0) {
    const last = sorted[sorted.length - 1];
    result.set(last.id, (result.get(last.id) ?? 0) + remaining);
  }

  return result;
}

/**
 * Returns the hours allocated to a specific client package via the cascade for the given month.
 * All client-tagged tickets contribute to the shared pool regardless of serviceCategory.
 */
export async function getCascadedHoursForPackage(
  clientId: number | string,
  clientPackageId: number | string,
  month: string
): Promise<{ totalHours: number; byTicket: Array<{ ticketId: string; ticketNumber: string; ticketTitle: string; hours: number }> }> {
  const convex = getConvexClient();

  // 1. Total pool of client hours this month (all tagged tickets)
  const pool = await getMonthlyHoursForClient(clientId, month);

  // 2. Client's active packages with their category + allocated hours
  const allPackages = (await convex.query(api.clientPackages.listByClient, {
    clientId: clientId as any,
  })) as any[];
  const activePackages = allPackages.filter((cp) => cp.active && !cp.isOneTime);

  if (activePackages.length === 0) {
    return { totalHours: 0, byTicket: pool.byTicket };
  }

  const cascade = allocateClientHoursByCascade(
    pool.totalHours,
    activePackages.map((cp) => ({
      id: String(cp._id),
      category: cp.packageCategory ?? "other",
      allocatedHours: cp.customHours ?? cp.packageHoursIncluded ?? 0,
    }))
  );

  const targetId = String(clientPackageId);
  const totalHours = cascade.get(targetId) ?? 0;

  return {
    totalHours: Math.round(totalHours * 100) / 100,
    byTicket: pool.byTicket,
  };
}

export async function getServiceHourCap(
  clientId: number | string,
  category: ServiceBoardCategory,
  clientPackageId: number | string,
  month: string
): Promise<ServiceHoursSummary> {
  const { totalHours, byTicket } = await getCascadedHoursForPackage(clientId, clientPackageId, month);

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
// Iterates active team members and asks for each one's running timer.
// We deliberately don't expose a cross-team "list all running" query
// because running timers are private per user in the client API.

export async function checkRunawayTimers(): Promise<TimeEntry[]> {
  const convex = getConvexClient();
  const members = await convex.query(api.teamMembers.list, { activeOnly: true });
  const now = Date.now();
  const TEN_HOURS = 10 * 60 * 60 * 1000;

  const runaways: TimeEntry[] = [];
  for (const member of members as any[]) {
    const running = await convex.query(api.timeEntries.listRunningByMember, {
      teamMemberId: member._id,
    });
    for (const entry of running as any[]) {
      const start = new Date(entry.startTime).getTime();
      if (now - start > TEN_HOURS) {
        runaways.push(docToTimeEntry(entry));
      }
    }
  }
  return runaways;
}
