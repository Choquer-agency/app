import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import { isOverdueEligible } from "@/types";

// === Types ===

export interface UtilizationMember {
  teamMemberId: string;
  memberName: string;
  memberColor: string;
  totalHours: number;
  availableHours: number;
  utilizationPct: number;
  byClient: Array<{ clientId: string | null; clientName: string | null; hours: number }>;
}

export interface UtilizationReport {
  members: UtilizationMember[];
  period: { start: string; end: string };
  totalTeamHours: number;
  avgUtilization: number;
}

export interface ProfitabilityClient {
  clientId: string;
  clientName: string;
  includedHours: number;
  loggedHours: number;
  overage: number;
  overageCost: number;
  monthlyRevenue: number;
  status: "ok" | "warning" | "exceeded";
  monthlyRetainerHours: number;
  unusedMonthlyHours: number;
  oneTimeBalance: number;
}

export interface ProfitabilityTrendMonth {
  month: string;
  clients: Array<{ clientId: string; clientName: string; loggedHours: number; includedHours: number }>;
}

export interface ProfitabilityReport {
  clients: ProfitabilityClient[];
  trends: ProfitabilityTrendMonth[];
  month: string;
}

export interface VelocityResolution {
  clientId: string | null;
  clientName: string | null;
  projectId: string | null;
  projectName: string | null;
  ticketsClosed: number;
  avgResolutionHours: number;
}

export interface VelocityReport {
  avgResolution: VelocityResolution[];
  weeklyThroughput: Array<{ weekStart: string; ticketsClosed: number }>;
  statusDurations: Array<{ status: string; avgHours: number }>;
  overallAvgHours: number;
  totalClosed: number;
}

export interface PerformanceMember {
  teamMemberId: string;
  memberName: string;
  memberColor: string;
  memberProfilePicUrl: string;
  availableHoursPerWeek: number;
  ticketsClosed: number;
  avgResolutionHours: number;
  hoursLogged: number;
  overdueTickets: number;
  openTickets: number;
  avgOpenHours: number;
  onTimeCount: number;
  withDueDateCount: number;
  onTimePct: number;
}

export interface PerformanceOpenTicket {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  clientName: string | null;
}

export interface PerformanceReport {
  members: PerformanceMember[];
  openTickets: PerformanceOpenTicket[];
  period: { start: string; end: string };
}

export interface RevenueReport {
  currentMrr: number;
  mrrTrend: Array<{ month: string; mrr: number }>;
  revenueByCategory: Array<{ category: string; revenue: number }>;
  clientLtv: Array<{ clientId: string; clientName: string; mrr: number; monthsActive: number; ltv: number }>;
  projectedAnnualRevenue: number;
}

export interface ForecastDeadline {
  ticketId: string;
  ticketNumber: string;
  title: string;
  dueDate: string;
  status: string;
  priority: string;
  clientName: string | null;
  assigneeNames: string[];
}

export interface ForecastWorkload {
  teamMemberId: string;
  memberName: string;
  memberColor: string;
  openTickets: number;
  overdueTickets: number;
  hoursLoggedThisWeek: number;
  availableHours: number;
  remainingCapacity: number;
  capacityStatus: "overloaded" | "balanced" | "available";
}

export interface ForecastingReport {
  upcomingDeadlines: ForecastDeadline[];
  teamWorkload: ForecastWorkload[];
  deadlineHeatmap: Array<{ date: string; count: number }>;
}

// === Report Functions ===
// These compute reports from Convex data. Complex aggregations are done in JS.

export async function getUtilizationReport(start: string, end: string): Promise<UtilizationReport> {
  const convex = getConvexClient();
  const members = await convex.query(api.teamMembers.list, { activeOnly: true });

  const startDate = new Date(start);
  const endDate = new Date(end);
  const weeks = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)));

  // Fetch all time entries for the period
  const allEntries = await convex.query(api.timeEntries.listAll, { limit: 5000 });

  // Build a ticket->client map for entries in range
  const ticketClientMap = new Map<string, { clientId: string | null; clientName: string | null }>();

  const memberList: UtilizationMember[] = [];

  for (const m of members as any[]) {
    const memberEntries = (allEntries as any[]).filter((e) => {
      if (e.teamMemberId !== m._id) return false;
      if (!e.startTime) return false;
      const eStart = new Date(e.startTime);
      const eEnd = e.endTime ? new Date(e.endTime) : new Date();
      return eStart < endDate && eEnd > startDate;
    });

    // Compute hours per client
    const clientHoursMap = new Map<string, { clientId: string | null; clientName: string | null; seconds: number }>();

    for (const entry of memberEntries) {
      const eStart = new Date(entry.startTime);
      const eEnd = entry.endTime ? new Date(entry.endTime) : new Date();
      const clampedStart = eStart < startDate ? startDate : eStart;
      const clampedEnd = eEnd > endDate ? endDate : eEnd;
      const seconds = (clampedEnd.getTime() - clampedStart.getTime()) / 1000;
      if (seconds <= 0) continue;

      // Resolve ticket -> client
      let clientInfo = ticketClientMap.get(entry.ticketId);
      if (!clientInfo) {
        try {
          const ticket = await convex.query(api.tickets.getById, { id: entry.ticketId });
          if (ticket && (ticket as any).clientId) {
            const client = await convex.query(api.clients.getById, { id: (ticket as any).clientId });
            clientInfo = { clientId: (ticket as any).clientId, clientName: (client as any)?.name ?? null };
          } else {
            clientInfo = { clientId: null, clientName: null };
          }
        } catch {
          clientInfo = { clientId: null, clientName: null };
        }
        ticketClientMap.set(entry.ticketId, clientInfo);
      }

      const key = clientInfo.clientId ?? "none";
      const existing = clientHoursMap.get(key);
      if (existing) {
        existing.seconds += seconds;
      } else {
        clientHoursMap.set(key, { ...clientInfo, seconds });
      }
    }

    const byClient = Array.from(clientHoursMap.values()).map((c) => ({
      clientId: c.clientId,
      clientName: c.clientName,
      hours: Math.round((c.seconds / 3600) * 100) / 100,
    }));

    const totalHours = byClient.reduce((sum, c) => sum + c.hours, 0);
    const availableHours = (m.availableHoursPerWeek ?? 40) * weeks;
    const utilizationPct = availableHours > 0 ? Math.round((totalHours / availableHours) * 100) : 0;

    memberList.push({
      teamMemberId: m._id,
      memberName: m.name,
      memberColor: m.color || "#6B7280",
      totalHours: Math.round(totalHours * 100) / 100,
      availableHours,
      utilizationPct,
      byClient,
    });
  }

  const totalTeamHours = memberList.reduce((sum, m) => sum + m.totalHours, 0);
  const avgUtilization = memberList.length > 0
    ? Math.round(memberList.reduce((sum, m) => sum + m.utilizationPct, 0) / memberList.length)
    : 0;

  return {
    members: memberList,
    period: { start, end },
    totalTeamHours: Math.round(totalTeamHours * 100) / 100,
    avgUtilization,
  };
}

export async function getProfitabilityReport(month: string): Promise<ProfitabilityReport> {
  const convex = getConvexClient();
  const monthStr = month.slice(0, 7); // "YYYY-MM"
  const monthStart = new Date(monthStr + "-01");
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);

  const clients = await convex.query(api.clients.list, {});
  const profClients: ProfitabilityClient[] = [];

  for (const client of clients as any[]) {
    // Get packages for this client — split by type
    const packages = await convex.query(api.clientPackages.listByClient, { clientId: client._id });
    let monthlyRetainerHours = 0;
    let oneTimeHours = 0;
    let monthlyRevenue = 0;
    for (const cp of packages as any[]) {
      if (cp.active) {
        const hours = cp.customHours ?? cp.packageHoursIncluded ?? 0;
        if (cp.isOneTime) {
          oneTimeHours += hours;
        } else {
          monthlyRetainerHours += hours;
        }
        monthlyRevenue += cp.customPrice ?? cp.packageDefaultPrice ?? 0;
      }
    }

    const includedHours = monthlyRetainerHours + oneTimeHours;
    if (monthlyRevenue === 0 && includedHours === 0) continue;

    // Get tickets for this client to compute logged hours
    const tickets = await convex.query(api.tickets.list, {
      clientId: client._id,
      archived: false,
      limit: 500,
    });

    // Fetch all time entries in parallel
    const allEntries = await Promise.all(
      (tickets as any[]).map((ticket) =>
        convex.query(api.timeEntries.listByTicket, { ticketId: ticket._id })
      )
    );

    let totalSeconds = 0;
    for (const entries of allEntries) {
      for (const entry of entries as any[]) {
        if (!entry.startTime) continue;
        const start = new Date(entry.startTime);
        const end = entry.endTime ? new Date(entry.endTime) : new Date();
        if (start >= monthEnd || end <= monthStart) continue;
        const clampedStart = start < monthStart ? monthStart : start;
        const clampedEnd = end > monthEnd ? monthEnd : end;
        totalSeconds += (clampedEnd.getTime() - clampedStart.getTime()) / 1000;
      }
    }

    const loggedHours = Math.round((totalSeconds / 3600) * 100) / 100;
    const monthlyUsed = Math.min(loggedHours, monthlyRetainerHours);
    const unusedMonthlyHours = Math.round((monthlyRetainerHours - monthlyUsed) * 100) / 100;
    const overage = Math.max(0, loggedHours - includedHours);
    const overageCost = Math.round(overage * 75 * 100) / 100; // $75/hr assumed overage rate
    const status = includedHours > 0
      ? (loggedHours / includedHours >= 1 ? "exceeded" : loggedHours / includedHours >= 0.8 ? "warning" : "ok")
      : "ok";

    profClients.push({
      clientId: client._id,
      clientName: client.name,
      includedHours,
      loggedHours,
      overage,
      overageCost,
      monthlyRevenue,
      status: status as "ok" | "warning" | "exceeded",
      monthlyRetainerHours,
      unusedMonthlyHours,
      oneTimeBalance: oneTimeHours,
    });
  }

  return { clients: profClients, trends: [], month: monthStr };
}

export async function getVelocityReport(weeks: number = 12): Promise<VelocityReport> {
  const convex = getConvexClient();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - weeks * 7);
  const cutoffStr = cutoff.toISOString();

  // Fetch closed tickets
  const allTickets = await convex.query(api.tickets.list, {
    status: "closed",
    archived: false,
    limit: 500,
  });

  // Filter to tickets closed within the time window
  const closedTickets = (allTickets as any[]).filter((t) => {
    return t.closedAt && t.closedAt >= cutoffStr;
  });

  // Calculate resolution times
  const resolutionHours: number[] = [];
  const byClient = new Map<string, { clientId: string | null; clientName: string | null; projectId: string | null; projectName: string | null; ticketsClosed: number; totalHours: number }>();

  for (const t of closedTickets) {
    const created = new Date(t._creationTime).getTime();
    const closed = new Date(t.closedAt).getTime();
    const hours = (closed - created) / (1000 * 60 * 60);
    resolutionHours.push(hours);

    const key = t.clientId ?? "none";
    const existing = byClient.get(key);
    if (existing) {
      existing.ticketsClosed++;
      existing.totalHours += hours;
    } else {
      byClient.set(key, {
        clientId: t.clientId ?? null,
        clientName: t.clientName ?? null,
        projectId: t.projectId ?? null,
        projectName: t.projectName ?? null,
        ticketsClosed: 1,
        totalHours: hours,
      });
    }
  }

  const avgResolution: VelocityResolution[] = Array.from(byClient.values()).map((c) => ({
    clientId: c.clientId,
    clientName: c.clientName,
    projectId: c.projectId,
    projectName: c.projectName,
    ticketsClosed: c.ticketsClosed,
    avgResolutionHours: c.ticketsClosed > 0 ? Math.round((c.totalHours / c.ticketsClosed) * 10) / 10 : 0,
  }));

  // Weekly throughput
  const weeklyMap = new Map<string, number>();
  for (const t of closedTickets) {
    const closedDate = new Date(t.closedAt);
    const day = closedDate.getDay();
    const weekStart = new Date(closedDate);
    weekStart.setDate(weekStart.getDate() - day);
    const weekKey = weekStart.toISOString().split("T")[0];
    weeklyMap.set(weekKey, (weeklyMap.get(weekKey) ?? 0) + 1);
  }
  const weeklyThroughput = Array.from(weeklyMap.entries())
    .map(([weekStart, ticketsClosed]) => ({ weekStart, ticketsClosed }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  const overallAvgHours = resolutionHours.length > 0
    ? Math.round((resolutionHours.reduce((a, b) => a + b, 0) / resolutionHours.length) * 10) / 10
    : 0;

  return {
    avgResolution,
    weeklyThroughput,
    statusDurations: [],
    overallAvgHours,
    totalClosed: closedTickets.length,
  };
}

export async function getPerformanceReport(start: string, end: string, memberId?: string): Promise<PerformanceReport> {
  const convex = getConvexClient();
  const members = await convex.query(api.teamMembers.list, { activeOnly: true });
  const startDate = new Date(start);
  const endDate = new Date(end);
  const today = new Date().toISOString().split("T")[0];

  const filteredMembers = (members as any[]).filter((m) => !memberId || m._id === memberId);

  // Fetch all time entries for the period
  const allEntries = await convex.query(api.timeEntries.listAll, { limit: 5000 });

  const memberList: PerformanceMember[] = [];
  const allOpenTickets: PerformanceOpenTicket[] = [];

  for (const m of filteredMembers) {
    // Get tickets assigned to this member
    const tickets = await convex.query(api.tickets.listByAssignee, {
      teamMemberId: m._id,
      limit: 500,
    });

    const memberTickets = tickets as any[];
    const closedInPeriod = memberTickets.filter((t) => {
      return t.status === "closed" && t.closedAt && t.closedAt >= start && t.closedAt <= end;
    });
    const open = memberTickets.filter((t) => t.status !== "closed" && !t.archived);
    const overdue = open.filter((t) => t.dueDate && t.dueDate < today && isOverdueEligible(t.status));

    // Compute on-time rate for closed tickets
    let onTimeCount = 0;
    let withDueDateCount = 0;
    let totalResolutionHours = 0;
    for (const t of closedInPeriod) {
      if (t.dueDate) {
        withDueDateCount++;
        const closedDate = t.closedAt ? t.closedAt.split("T")[0] : "";
        if (closedDate <= t.dueDate) onTimeCount++;
      }
      if (t.closedAt) {
        const created = new Date(t._creationTime).getTime();
        const closed = new Date(t.closedAt).getTime();
        totalResolutionHours += (closed - created) / (1000 * 60 * 60);
      }
    }

    // Compute hours logged in period
    const memberEntries = (allEntries as any[]).filter((e) => {
      if (e.teamMemberId !== m._id || !e.startTime) return false;
      const eStart = new Date(e.startTime);
      const eEnd = e.endTime ? new Date(e.endTime) : new Date();
      return eStart < endDate && eEnd > startDate;
    });
    let totalSeconds = 0;
    for (const entry of memberEntries) {
      const eStart = new Date(entry.startTime);
      const eEnd = entry.endTime ? new Date(entry.endTime) : new Date();
      const clampedStart = eStart < startDate ? startDate : eStart;
      const clampedEnd = eEnd > endDate ? endDate : eEnd;
      totalSeconds += (clampedEnd.getTime() - clampedStart.getTime()) / 1000;
    }

    // Average open ticket age
    const now = Date.now();
    const avgOpenHours = open.length > 0
      ? Math.round(open.reduce((sum: number, t: any) => sum + (now - new Date(t._creationTime).getTime()) / (1000 * 60 * 60), 0) / open.length * 10) / 10
      : 0;

    memberList.push({
      teamMemberId: m._id,
      memberName: m.name,
      memberColor: m.color || "#6B7280",
      memberProfilePicUrl: m.profilePicUrl || "",
      availableHoursPerWeek: m.availableHoursPerWeek ?? 40,
      ticketsClosed: closedInPeriod.length,
      avgResolutionHours: closedInPeriod.length > 0 ? Math.round((totalResolutionHours / closedInPeriod.length) * 10) / 10 : 0,
      hoursLogged: Math.round((totalSeconds / 3600) * 100) / 100,
      overdueTickets: overdue.length,
      openTickets: open.length,
      avgOpenHours,
      onTimeCount,
      withDueDateCount,
      onTimePct: withDueDateCount > 0 ? Math.round((onTimeCount / withDueDateCount) * 100) : 0,
    });

    // Collect open tickets for the report
    for (const t of open) {
      allOpenTickets.push({
        id: t._id,
        ticketNumber: t.ticketNumber ?? "",
        title: t.title ?? "",
        status: t.status ?? "",
        priority: t.priority ?? "normal",
        dueDate: t.dueDate ?? null,
        clientName: t.clientName ?? null,
      });
    }
  }

  return { members: memberList, openTickets: allOpenTickets, period: { start, end } };
}

export async function getRevenueReport(months: number = 12): Promise<RevenueReport> {
  const convex = getConvexClient();
  const clients = await convex.query(api.clients.list, {});
  const allClients = clients as any[];
  const currentMrr = allClients.reduce((sum, c) => sum + (c.mrr || 0), 0);

  const now = new Date();

  // Compute MRR trend by looking at contractStartDate to estimate when each client started contributing
  const mrrTrend: Array<{ month: string; mrr: number }> = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = d.toISOString().slice(0, 7);
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);

    let monthMrr = 0;
    for (const c of allClients) {
      if (!c.mrr || c.mrr <= 0) continue;
      const startDate = c.contractStartDate ? new Date(c.contractStartDate) : new Date(c._creationTime);
      if (startDate < monthEnd) {
        // Check if client was still active in this month
        if (!c.contractEndDate || new Date(c.contractEndDate) >= d) {
          monthMrr += c.mrr;
        }
      }
    }
    mrrTrend.push({ month: monthStr, mrr: Math.round(monthMrr * 100) / 100 });
  }

  // Revenue by category from packages
  const categoryMap = new Map<string, number>();
  for (const c of allClients) {
    if (!c.mrr || c.mrr <= 0) continue;
    try {
      const packages = await convex.query(api.clientPackages.listByClient, { clientId: c._id });
      for (const cp of packages as any[]) {
        if (cp.active) {
          const category = cp.packageCategory ?? "other";
          const price = cp.customPrice ?? cp.packageDefaultPrice ?? 0;
          categoryMap.set(category, (categoryMap.get(category) ?? 0) + price);
        }
      }
    } catch {}
  }
  const revenueByCategory = Array.from(categoryMap.entries()).map(([category, revenue]) => ({
    category,
    revenue: Math.round(revenue * 100) / 100,
  }));

  // Client LTV
  const clientLtv = allClients
    .filter((c) => c.mrr > 0)
    .map((c) => {
      const startDate = c.contractStartDate ? new Date(c.contractStartDate) : new Date(c._creationTime);
      const monthsActive = Math.max(1, Math.round((now.getTime() - startDate.getTime()) / (30.44 * 24 * 60 * 60 * 1000)));
      return {
        clientId: c._id,
        clientName: c.name,
        mrr: c.mrr || 0,
        monthsActive,
        ltv: Math.round((c.mrr || 0) * monthsActive * 100) / 100,
      };
    });

  return {
    currentMrr,
    mrrTrend,
    revenueByCategory,
    clientLtv,
    projectedAnnualRevenue: Math.round(currentMrr * 12 * 100) / 100,
  };
}

export async function getForecastingReport(): Promise<ForecastingReport> {
  const convex = getConvexClient();
  const today = new Date().toISOString().split("T")[0];
  const twoWeeksOut = new Date();
  twoWeeksOut.setDate(twoWeeksOut.getDate() + 14);
  const twoWeeksStr = twoWeeksOut.toISOString().split("T")[0];

  // Get all open tickets
  const allTickets = await convex.query(api.tickets.list, {
    archived: false,
    limit: 500,
  });
  const openTickets = (allTickets as any[]).filter((t) => t.status !== "closed");

  // Upcoming deadlines (tickets with due dates in next 2 weeks)
  const upcomingDeadlines: ForecastDeadline[] = openTickets
    .filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= twoWeeksStr)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
    .map((t) => ({
      ticketId: t._id,
      ticketNumber: t.ticketNumber ?? "",
      title: t.title ?? "",
      dueDate: t.dueDate ?? "",
      status: t.status ?? "",
      priority: t.priority ?? "normal",
      clientName: t.clientName ?? null,
      assigneeNames: [],
    }));

  // Deadline heatmap (count of deadlines per date)
  const heatmapMap = new Map<string, number>();
  for (const t of openTickets) {
    if (t.dueDate && t.dueDate >= today) {
      heatmapMap.set(t.dueDate, (heatmapMap.get(t.dueDate) ?? 0) + 1);
    }
  }
  const deadlineHeatmap = Array.from(heatmapMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Team workload
  const members = await convex.query(api.teamMembers.list, { activeOnly: true });
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const allEntries = await convex.query(api.timeEntries.listAll, { limit: 2000 });

  const teamWorkload: ForecastWorkload[] = [];

  for (const m of members as any[]) {
    // Count open/overdue tickets for this member
    const memberTickets = await convex.query(api.tickets.listByAssignee, {
      teamMemberId: m._id,
      archived: false,
    });
    const memberOpen = (memberTickets as any[]).filter((t) => t.status !== "closed");
    const memberOverdue = memberOpen.filter((t) => t.dueDate && t.dueDate < today);

    // Hours logged this week
    const memberEntries = (allEntries as any[]).filter((e) => {
      if (e.teamMemberId !== m._id || !e.startTime) return false;
      const eStart = new Date(e.startTime);
      const eEnd = e.endTime ? new Date(e.endTime) : new Date();
      return eStart < weekEnd && eEnd > weekStart;
    });
    let weekSeconds = 0;
    for (const entry of memberEntries) {
      const eStart = new Date(entry.startTime);
      const eEnd = entry.endTime ? new Date(entry.endTime) : new Date();
      const clampedStart = eStart < weekStart ? weekStart : eStart;
      const clampedEnd = eEnd > weekEnd ? weekEnd : eEnd;
      weekSeconds += (clampedEnd.getTime() - clampedStart.getTime()) / 1000;
    }

    const hoursLoggedThisWeek = Math.round((weekSeconds / 3600) * 100) / 100;
    const availableHours = m.availableHoursPerWeek ?? 40;
    const remainingCapacity = Math.round((availableHours - hoursLoggedThisWeek) * 100) / 100;
    const capacityStatus = remainingCapacity <= 0 ? "overloaded" : remainingCapacity <= availableHours * 0.2 ? "balanced" : "available";

    teamWorkload.push({
      teamMemberId: m._id,
      memberName: m.name,
      memberColor: m.color || "#6B7280",
      openTickets: memberOpen.length,
      overdueTickets: memberOverdue.length,
      hoursLoggedThisWeek,
      availableHours,
      remainingCapacity,
      capacityStatus: capacityStatus as "overloaded" | "balanced" | "available",
    });
  }

  return {
    upcomingDeadlines,
    teamWorkload,
    deadlineHeatmap,
  };
}
