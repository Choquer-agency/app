import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import { isOverdueEligible } from "@/types";

// === Types ===

export interface UtilizationMember {
  teamMemberId: string;
  memberName: string;
  memberColor: string;
  totalHours: number;
  clockedHours: number;
  availableHours: number;
  utilizationPct: number;
  byClient: Array<{ clientId: string | null; clientName: string | null; hours: number }>;
}

export interface UtilizationReport {
  members: UtilizationMember[];
  period: { start: string; end: string };
  totalTeamHours: number;
  totalClockedHours: number;
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

export interface VelocityTicket {
  ticketId: string;
  ticketNumber: string;
  title: string;
  status: string;
  resolutionHours: number | null;
  assignees: Array<{ name: string; profilePicUrl: string }>;
}

export interface VelocityResolution {
  clientId: string | null;
  clientName: string | null;
  ticketsClosed: number;
  ticketsCreated: number;
  ticketsOpen: number;
  avgResolutionHours: number;
  tickets: VelocityTicket[];
}

export interface VelocityReport {
  avgResolution: VelocityResolution[];
  weeklyThroughput: Array<{ weekStart: string; ticketsClosed: number; ticketsCreated: number }>;
  statusDurations: Array<{ status: string; avgHours: number }>;
  overallAvgHours: number;
  totalClosed: number;
  totalCreated: number;
  totalOpen: number;
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
  lockedRevenue: number;
  remainingMonths: number;
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
  const allMembers = await convex.query(api.teamMembers.list, { activeOnly: true });

  const members = (allMembers as any[]).filter(
    (m) =>
      m.active !== false &&
      m.roleLevel !== "owner" &&
      m.roleLevel !== "bookkeeper" &&
      m.employeeStatus !== "terminated" &&
      m.employeeStatus !== "past_employee"
  );

  const startDate = new Date(start);
  const endDate = new Date(end);
  const weeks = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)));

  // Fetch all time entries for the period
  const allEntries = await convex.query(api.timeEntries.listAll, { limit: 5000 });

  // Fetch timesheet entries (clock-in/out) for the period to compute clocked hours
  const startDay = startDate.toISOString().slice(0, 10);
  const endDay = endDate.toISOString().slice(0, 10);
  const timesheetEntries = await convex.query(api.timesheetEntries.listByDateRange, {
    startDate: startDay,
    endDate: endDay,
    limit: 5000,
  });

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

    // Salaried employees: clocked = their goal (availableHoursPerWeek × weeks)
    // Hourly employees: clocked = actual timesheet clock-in/out minus breaks
    let clockedHours: number;
    if (m.payType === "salary") {
      clockedHours = availableHours;
    } else {
      const clockedMinutes = (timesheetEntries as any[])
        .filter((t) => t.teamMemberId === m._id)
        .reduce((sum, t) => sum + (t.workedMinutes ?? 0), 0);
      clockedHours = Math.round((clockedMinutes / 60) * 100) / 100;
    }

    memberList.push({
      teamMemberId: m._id,
      memberName: m.name,
      memberColor: m.color || "#6B7280",
      totalHours: Math.round(totalHours * 100) / 100,
      clockedHours,
      availableHours,
      utilizationPct,
      byClient,
    });
  }

  memberList.sort((a, b) => b.utilizationPct - a.utilizationPct);

  const totalTeamHours = memberList.reduce((sum, m) => sum + m.totalHours, 0);
  const totalClockedHours = memberList.reduce((sum, m) => sum + m.clockedHours, 0);
  const avgUtilization = memberList.length > 0
    ? Math.round(memberList.reduce((sum, m) => sum + m.utilizationPct, 0) / memberList.length)
    : 0;

  return {
    members: memberList,
    period: { start, end },
    totalTeamHours: Math.round(totalTeamHours * 100) / 100,
    totalClockedHours: Math.round(totalClockedHours * 100) / 100,
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

// === Billable Hours & Cost of Delivery ===

export interface BillableHoursMember {
  teamMemberId: string;
  memberName: string;
  memberColor: string;
  effectiveRate: number;
  totalHours: number;
  billableHours: number;
  internalHours: number;
  untrackedHours: number;
  utilizationPct: number;
  totalCost: number;
}

export interface BillableHoursTicket {
  ticketId: string;
  ticketNumber: string;
  title: string;
  hours: number;
  memberNames: string[];
}

export interface BillableHoursClient {
  clientId: string;
  clientName: string;
  billable: boolean;
  revenue: number;
  costOfDelivery: number;
  grossProfit: number;
  marginPct: number;
  loggedHours: number;
  includedHours: number;
  packageCategories: string[];
  byMember: Array<{ memberName: string; hours: number; cost: number }>;
  tickets: BillableHoursTicket[];
}

export interface BillableHoursReport {
  month: string;
  members: BillableHoursMember[];
  clients: BillableHoursClient[];
  summary: {
    totalBillableHours: number;
    totalInternalHours: number;
    totalCostOfDelivery: number;
    totalEmployeeCost: number;
    totalRevenue: number;
    blendedMarginPct: number;
  };
}

function getEffectiveHourlyRate(member: any): number {
  if (member.payType === "hourly" && member.hourlyRate) return member.hourlyRate;
  if (member.payType === "salary" && member.salary) {
    const weeklyHours = member.availableHoursPerWeek || 40;
    return member.salary / 52 / weeklyHours;
  }
  if (member.hourlyRate) return member.hourlyRate;
  return 0;
}

export async function getBillableHoursReport(month: string): Promise<BillableHoursReport> {
  const convex = getConvexClient();
  const monthStr = month.slice(0, 7);
  const monthStart = new Date(monthStr + "-01");
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);

  // Date strings for timesheet query (YYYY-MM-DD)
  const startDateStr = monthStr + "-01";
  const endDay = new Date(monthEnd.getTime() - 1);
  const endDateStr = `${endDay.getFullYear()}-${String(endDay.getMonth() + 1).padStart(2, "0")}-${String(endDay.getDate()).padStart(2, "0")}`;

  const allMembersRaw = await convex.query(api.teamMembers.list, { activeOnly: true });
  // Filter same as utilization report
  const allMembers = (allMembersRaw as any[]).filter(
    (m) =>
      m.active !== false &&
      m.roleLevel !== "owner" &&
      m.roleLevel !== "bookkeeper" &&
      m.employeeStatus !== "terminated" &&
      m.employeeStatus !== "past_employee"
  );
  const allClients = await convex.query(api.clients.list, {});

  // 1. Get TIMESHEET data (clock in/out) = total hours worked per employee
  const timesheetEntries = await convex.query(api.timesheetEntries.listByDateRange, {
    startDate: startDateStr,
    endDate: endDateStr,
    limit: 5000,
  });

  // 2. Get TICKET TIME ENTRIES = billable hours tracked per ticket
  const allTicketEntries = await convex.query(api.timeEntries.listAll, { limit: 10000 });
  const monthTicketEntries = (allTicketEntries as any[]).filter((e) => {
    if (!e.startTime) return false;
    const start = new Date(e.startTime);
    const end = e.endTime ? new Date(e.endTime) : new Date();
    return start < monthEnd && end > monthStart;
  });

  // Get all tickets referenced by entries
  const ticketIds = [...new Set(monthTicketEntries.map((e) => e.ticketId))];
  const ticketMap = new Map<string, any>();
  for (const tid of ticketIds) {
    try {
      const ticket = await convex.query(api.tickets.getById, { id: tid });
      if (ticket) ticketMap.set(tid, ticket);
    } catch {}
  }

  // Build lookups
  const clientNameMap = new Map<string, string>();
  for (const c of allClients as any[]) clientNameMap.set(c._id, c.name);

  const memberRateMap = new Map<string, { name: string; color: string; rate: number }>();
  for (const m of allMembers as any[]) {
    memberRateMap.set(m._id, {
      name: m.name,
      color: m.color || "#6B7280",
      rate: getEffectiveHourlyRate(m),
    });
  }

  // Accumulate TOTAL HOURS WORKED from timesheet (clock in/out)
  const memberWorkedMinutes = new Map<string, number>();
  for (const entry of timesheetEntries as any[]) {
    if (entry.isSickDay || entry.isVacation) continue; // Don't count sick/vacation
    const minutes = entry.workedMinutes || 0;
    memberWorkedMinutes.set(entry.teamMemberId, (memberWorkedMinutes.get(entry.teamMemberId) || 0) + minutes);
  }

  // Accumulate BILLABLE HOURS and INTERNAL HOURS from ticket time entries
  const memberBillableSeconds = new Map<string, number>();
  const memberInternalTicketSeconds = new Map<string, number>();
  const clientData = new Map<string, {
    seconds: number;
    byMember: Map<string, number>;
    byCategory: Map<string, number>;
    byTicket: Map<string, { seconds: number; members: Set<string> }>;
  }>();

  for (const entry of monthTicketEntries) {
    const start = new Date(entry.startTime);
    const end = entry.endTime ? new Date(entry.endTime) : new Date();
    const clampedStart = start < monthStart ? monthStart : start;
    const clampedEnd = end > monthEnd ? monthEnd : end;
    const seconds = Math.max(0, (clampedEnd.getTime() - clampedStart.getTime()) / 1000);
    if (seconds <= 0) continue;

    const memberId = entry.teamMemberId;
    const ticket = ticketMap.get(entry.ticketId);
    const clientId = ticket?.clientId || null;
    const category = ticket?.serviceCategory || "other";

    // Only count as billable if it's on a client ticket with a billable client
    const clientDoc = clientId ? (allClients as any[]).find((c) => c._id === clientId) : null;
    const isClientBillable = clientDoc ? (clientDoc.billable ?? true) : false;
    if (clientId) {
      if (isClientBillable) {
        memberBillableSeconds.set(memberId, (memberBillableSeconds.get(memberId) || 0) + seconds);
      }

      if (!clientData.has(clientId)) {
        clientData.set(clientId, { seconds: 0, byMember: new Map(), byCategory: new Map(), byTicket: new Map() });
      }
      const cd = clientData.get(clientId)!;
      cd.seconds += seconds;
      cd.byMember.set(memberId, (cd.byMember.get(memberId) || 0) + seconds);
      cd.byCategory.set(category, (cd.byCategory.get(category) || 0) + seconds);
      const ticketId = entry.ticketId;
      if (!cd.byTicket.has(ticketId)) {
        cd.byTicket.set(ticketId, { seconds: 0, members: new Set() });
      }
      const td = cd.byTicket.get(ticketId)!;
      td.seconds += seconds;
      if (memberId) td.members.add(memberId);
    } else {
      // No client = internal ticket work
      memberInternalTicketSeconds.set(memberId, (memberInternalTicketSeconds.get(memberId) || 0) + seconds);
    }
  }

  // Compute weeks in month for salary override
  const daysInMonth = (monthEnd.getTime() - monthStart.getTime()) / (24 * 60 * 60 * 1000);
  const weeksInMonth = Math.max(1, Math.round(daysInMonth / 7));

  // Build member results — include ALL filtered members
  const members: BillableHoursMember[] = [];

  for (const m of allMembers as any[]) {
    const memberId = m._id;
    const info = memberRateMap.get(memberId);
    if (!info) continue;

    // Salary employees: total hours = their weekly goal × weeks in month
    let totalHours: number;
    if (m.payType === "salary") {
      totalHours = (m.availableHoursPerWeek ?? 40) * weeksInMonth;
    } else {
      totalHours = Math.round(((memberWorkedMinutes.get(memberId) || 0) / 60) * 100) / 100;
    }

    const billableHours = Math.round(((memberBillableSeconds.get(memberId) || 0) / 3600) * 100) / 100;
    const internalHours = Math.round(((memberInternalTicketSeconds.get(memberId) || 0) / 3600) * 100) / 100;
    const untrackedHours = Math.max(0, Math.round((totalHours - billableHours - internalHours) * 100) / 100);

    members.push({
      teamMemberId: memberId,
      memberName: info.name,
      memberColor: info.color,
      effectiveRate: Math.round(info.rate * 100) / 100,
      totalHours,
      billableHours,
      internalHours,
      untrackedHours,
      utilizationPct: totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0,
      totalCost: Math.round(totalHours * info.rate * 100) / 100,
    });
  }
  members.sort((a, b) => b.totalHours - a.totalHours);

  // Build client results — include ALL clients with active packages
  const clients: BillableHoursClient[] = [];
  const clientBillableMap = new Map<string, boolean>();
  for (const c of allClients as any[]) {
    clientBillableMap.set(c._id, c.billable ?? true);
  }

  for (const c of allClients as any[]) {
    const clientId = c._id;
    const clientName = c.name;
    const isBillable = c.billable ?? true;

    // Get packages for this client
    let revenue = 0;
    let includedHours = 0;
    const packageCategories: string[] = [];
    let hasActivePackages = false;
    try {
      const packages = await convex.query(api.clientPackages.listByClient, { clientId: clientId as any });
      for (const cp of packages as any[]) {
        if (cp.active) {
          hasActivePackages = true;
          const pkgName = (cp.packageName || "").toLowerCase();
          const cat = pkgName.includes("hosting") ? "hosting" : (cp.packageCategory || "other");
          if (!packageCategories.includes(cat)) packageCategories.push(cat);
          if (!cp.isOneTime) {
            revenue += cp.customPrice ?? cp.packageDefaultPrice ?? 0;
            includedHours += cp.customHours ?? cp.packageHoursIncluded ?? 0;
          } else {
            // One-time packages: include hours for tracking but not monthly revenue
            includedHours += cp.customHours ?? cp.packageHoursIncluded ?? 0;
          }
        }
      }
    } catch {}

    // Skip clients with no active packages and no logged hours
    const cd = clientData.get(clientId);
    if (!hasActivePackages && !cd) continue;

    // Calculate cost of delivery from logged hours
    let costOfDelivery = 0;
    const byMember: Array<{ memberName: string; hours: number; cost: number }> = [];
    if (cd) {
      for (const [memberId, seconds] of cd.byMember) {
        const info = memberRateMap.get(memberId);
        if (!info) continue;
        const hours = Math.round((seconds / 3600) * 100) / 100;
        const cost = Math.round(hours * info.rate * 100) / 100;
        costOfDelivery += cost;
        byMember.push({ memberName: info.name, hours, cost });
      }
    }

    const loggedHours = cd ? Math.round((cd.seconds / 3600) * 100) / 100 : 0;
    const grossProfit = Math.round((revenue - costOfDelivery) * 100) / 100;
    const marginPct = revenue > 0 ? Math.round((grossProfit / revenue) * 100) : 0;

    // Build ticket breakdown
    const tickets: BillableHoursTicket[] = [];
    if (cd) {
      for (const [ticketId, td] of cd.byTicket) {
        const ticket = ticketMap.get(ticketId);
        tickets.push({
          ticketId,
          ticketNumber: ticket?.ticketNumber || "",
          title: ticket?.title || "Untitled",
          hours: Math.round((td.seconds / 3600) * 100) / 100,
          memberNames: [...td.members].map((mid) => memberRateMap.get(mid)?.name?.split(" ")[0] || "").filter(Boolean),
        });
      }
      tickets.sort((a, b) => b.hours - a.hours);
    }

    clients.push({
      clientId,
      clientName,
      billable: isBillable,
      revenue: Math.round(revenue * 100) / 100,
      costOfDelivery: Math.round(costOfDelivery * 100) / 100,
      grossProfit,
      marginPct,
      loggedHours,
      includedHours,
      packageCategories,
      byMember,
      tickets,
    });
  }
  clients.sort((a, b) => b.revenue - a.revenue);

  // Summary
  const totalBillableHours = members.reduce((s, m) => s + m.billableHours, 0);
  const totalInternalHours = members.reduce((s, m) => s + m.internalHours, 0);
  const totalCostOfDelivery = clients.reduce((s, c) => s + c.costOfDelivery, 0);
  const totalEmployeeCost = members.reduce((s, m) => s + m.totalCost, 0);
  const totalRevenue = clients.reduce((s, c) => s + c.revenue, 0);
  const blendedMarginPct = totalRevenue > 0 ? Math.round(((totalRevenue - totalEmployeeCost) / totalRevenue) * 100) : 0;

  return {
    month: monthStr,
    members,
    clients,
    summary: {
      totalBillableHours: Math.round(totalBillableHours * 100) / 100,
      totalInternalHours: Math.round(totalInternalHours * 100) / 100,
      totalCostOfDelivery: Math.round(totalCostOfDelivery * 100) / 100,
      totalEmployeeCost: Math.round(totalEmployeeCost * 100) / 100,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      blendedMarginPct,
    },
  };
}

export async function getVelocityReport(weeks: number = 12): Promise<VelocityReport> {
  const convex = getConvexClient();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - weeks * 7);
  const cutoffStr = cutoff.toISOString();
  const cutoffMs = cutoff.getTime();

  // Fetch all tickets (not just closed)
  const allTickets = await convex.query(api.tickets.list, {
    archived: false,
    limit: 2000,
  });

  // Also fetch closed tickets separately since they may be filtered differently
  const closedTickets = await convex.query(api.tickets.list, {
    status: "closed",
    archived: false,
    limit: 1000,
  });

  // Tickets closed in period
  const closedInPeriod = (closedTickets as any[]).filter((t) => t.closedAt && t.closedAt >= cutoffStr);

  // Tickets created in period
  const createdInPeriod = (allTickets as any[]).filter((t) => t._creationTime >= cutoffMs);

  // Tickets still open
  const openTickets = (allTickets as any[]).filter((t) => t.status !== "closed");

  // Resolve client names for all tickets
  const clientNameCache = new Map<string, string>();
  const allClients = await convex.query(api.clients.list, {});
  for (const c of allClients as any[]) {
    clientNameCache.set(c._id, c.name);
  }

  // Build member lookup
  const allMembersRaw2 = await convex.query(api.teamMembers.list, { activeOnly: false });
  const memberInfoCache = new Map<string, { name: string; profilePicUrl: string }>();
  for (const m of allMembersRaw2 as any[]) {
    memberInfoCache.set(m._id, { name: m.name?.split(" ")[0] || "", profilePicUrl: m.profilePicUrl || "" });
  }

  // Helper to resolve assignees for a ticket
  async function getAssignees(ticketId: string): Promise<Array<{ name: string; profilePicUrl: string }>> {
    try {
      const assignees = await convex.query(api.ticketAssignees.listByTicket, { ticketId: ticketId as any });
      return (assignees as any[]).map((a) => memberInfoCache.get(a.teamMemberId)).filter(Boolean) as Array<{ name: string; profilePicUrl: string }>;
    } catch {
      return [];
    }
  }

  // Calculate resolution times + per-client stats
  const resolutionHours: number[] = [];
  const byClient = new Map<string, { clientId: string | null; clientName: string | null; ticketsClosed: number; ticketsCreated: number; ticketsOpen: number; totalHours: number; tickets: VelocityTicket[] }>();

  function ensureClient(clientId: string | null) {
    const key = clientId ?? "none";
    if (!byClient.has(key)) {
      byClient.set(key, {
        clientId,
        clientName: clientId ? (clientNameCache.get(clientId) || "Unknown") : "No Client",
        ticketsClosed: 0,
        ticketsCreated: 0,
        ticketsOpen: 0,
        totalHours: 0,
        tickets: [],
      });
    }
    return byClient.get(key)!;
  }

  // Track ticket IDs we've already added to avoid duplicates
  const addedTickets = new Set<string>();

  for (const t of closedInPeriod) {
    const created = new Date(t._creationTime).getTime();
    const closed = new Date(t.closedAt).getTime();
    const hours = (closed - created) / (1000 * 60 * 60);
    resolutionHours.push(hours);
    const entry = ensureClient(t.clientId ?? null);
    entry.ticketsClosed++;
    entry.totalHours += hours;
    if (!addedTickets.has(t._id)) {
      addedTickets.add(t._id);
      const assignees = await getAssignees(t._id);
      entry.tickets.push({ ticketId: t._id, ticketNumber: t.ticketNumber || "", title: t.title || "Untitled", status: t.status, resolutionHours: Math.round(hours * 10) / 10, assignees });
    }
  }

  for (const t of createdInPeriod) {
    const entry = ensureClient(t.clientId ?? null);
    entry.ticketsCreated++;
    if (!addedTickets.has(t._id)) {
      addedTickets.add(t._id);
      const assignees = await getAssignees(t._id);
      entry.tickets.push({ ticketId: t._id, ticketNumber: t.ticketNumber || "", title: t.title || "Untitled", status: t.status, resolutionHours: null, assignees });
    }
  }

  for (const t of openTickets) {
    const entry = ensureClient(t.clientId ?? null);
    entry.ticketsOpen++;
    if (!addedTickets.has(t._id)) {
      addedTickets.add(t._id);
      const assignees = await getAssignees(t._id);
      entry.tickets.push({ ticketId: t._id, ticketNumber: t.ticketNumber || "", title: t.title || "Untitled", status: t.status, resolutionHours: null, assignees });
    }
  }

  const avgResolution: VelocityResolution[] = Array.from(byClient.values())
    .map((c) => ({
      clientId: c.clientId,
      clientName: c.clientName,
      ticketsClosed: c.ticketsClosed,
      ticketsCreated: c.ticketsCreated,
      ticketsOpen: c.ticketsOpen,
      avgResolutionHours: c.ticketsClosed > 0 ? Math.round((c.totalHours / c.ticketsClosed) * 10) / 10 : 0,
      tickets: c.tickets.sort((a, b) => (b.ticketNumber || "").localeCompare(a.ticketNumber || "")),
    }))
    .sort((a, b) => b.ticketsClosed - a.ticketsClosed);

  // Weekly throughput — closed AND created per week
  const weeklyClosedMap = new Map<string, number>();
  const weeklyCreatedMap = new Map<string, number>();

  function getWeekKey(date: Date): string {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().split("T")[0];
  }

  for (const t of closedInPeriod) {
    const key = getWeekKey(new Date(t.closedAt));
    weeklyClosedMap.set(key, (weeklyClosedMap.get(key) ?? 0) + 1);
  }

  for (const t of createdInPeriod) {
    const key = getWeekKey(new Date(t._creationTime));
    weeklyCreatedMap.set(key, (weeklyCreatedMap.get(key) ?? 0) + 1);
  }

  const allWeekKeys = new Set([...weeklyClosedMap.keys(), ...weeklyCreatedMap.keys()]);
  const weeklyThroughput = Array.from(allWeekKeys)
    .map((weekStart) => ({
      weekStart,
      ticketsClosed: weeklyClosedMap.get(weekStart) ?? 0,
      ticketsCreated: weeklyCreatedMap.get(weekStart) ?? 0,
    }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  const overallAvgHours = resolutionHours.length > 0
    ? Math.round((resolutionHours.reduce((a, b) => a + b, 0) / resolutionHours.length) * 10) / 10
    : 0;

  return {
    avgResolution,
    weeklyThroughput,
    statusDurations: [],
    overallAvgHours,
    totalClosed: closedInPeriod.length,
    totalCreated: createdInPeriod.length,
    totalOpen: openTickets.length,
  };
}

export async function getPerformanceReport(start: string, end: string, memberId?: string): Promise<PerformanceReport> {
  const convex = getConvexClient();
  const members = await convex.query(api.teamMembers.list, { activeOnly: true });
  const startDate = new Date(start);
  const endDate = new Date(end);
  const weeks = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)));
  const today = new Date().toISOString().split("T")[0];

  const filteredMembers = (members as any[]).filter((m) => {
    if (memberId && m._id !== memberId) return false;
    // Exclude bookkeepers and owners
    if (m.roleLevel === "bookkeeper" || m.roleLevel === "owner") return false;
    if (m.employeeStatus === "terminated" || m.employeeStatus === "past_employee") return false;
    if (m.active === false) return false;
    return true;
  });

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
      availableHoursPerWeek: (m.availableHoursPerWeek ?? 40) * weeks,
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
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  // Compute current MRR from active recurring packages (not client.mrr field)
  let currentMrr = 0;
  const categoryMap = new Map<string, number>();
  const clientPackageData = new Map<string, { recurringRevenue: number; startDate: Date }>();

  for (const c of allClients) {
    try {
      const packages = await convex.query(api.clientPackages.listByClient, { clientId: c._id });
      let clientRecurring = 0;
      for (const cp of packages as any[]) {
        if (cp.active && !cp.isOneTime) {
          const price = cp.customPrice ?? cp.packageDefaultPrice ?? 0;
          clientRecurring += price;
          const pkgName = (cp.packageName || "").toLowerCase();
          const cat = pkgName.includes("hosting") ? "hosting" : (cp.packageCategory ?? "other");
          categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + price);
        }
      }
      if (clientRecurring > 0) {
        currentMrr += clientRecurring;
        const startDate = c.contractStartDate ? new Date(c.contractStartDate) : new Date(c._creationTime);
        clientPackageData.set(c._id, { recurringRevenue: clientRecurring, startDate });
      }
    } catch {}
  }
  currentMrr = Math.round(currentMrr * 100) / 100;

  // MRR trend — strictly recurring packages, estimated by contract dates
  const mrrTrend: Array<{ month: string; mrr: number }> = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = d.toISOString().slice(0, 7);
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);

    let monthMrr = 0;
    for (const [clientId, data] of clientPackageData) {
      const c = allClients.find((cl: any) => cl._id === clientId);
      if (data.startDate < monthEnd) {
        if (!c?.contractEndDate || new Date(c.contractEndDate) >= d) {
          monthMrr += data.recurringRevenue;
        }
      }
    }
    mrrTrend.push({ month: monthStr, mrr: Math.round(monthMrr * 100) / 100 });
  }

  // Projected annual revenue:
  // Locked months (Jan to last completed month) = actual Converge collected
  // Current month = collected so far (will be added from trend data on frontend)
  // Remaining months = current MRR × remaining months
  // Plus: any one-time package payments already made this year
  const remainingMonths = 12 - currentMonth - 1; // months after current
  let oneTimeRevenue = 0;
  for (const c of allClients) {
    try {
      const packages = await convex.query(api.clientPackages.listByClient, { clientId: c._id });
      for (const cp of packages as any[]) {
        if (cp.isOneTime && cp.paidDate) {
          const paidYear = new Date(cp.paidDate).getFullYear();
          if (paidYear === currentYear) {
            oneTimeRevenue += cp.customPrice ?? cp.packageDefaultPrice ?? 0;
          }
        }
      }
    } catch {}
  }

  // Revenue by category
  const revenueByCategory = Array.from(categoryMap.entries())
    .map(([category, revenue]) => ({
      category,
      revenue: Math.round(revenue * 100) / 100,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Client LTV — from recurring package revenue, sorted by LTV desc
  const clientLtv = Array.from(clientPackageData.entries())
    .map(([clientId, data]) => {
      const c = allClients.find((cl: any) => cl._id === clientId);
      const monthsActive = Math.max(1, Math.round((now.getTime() - data.startDate.getTime()) / (30.44 * 24 * 60 * 60 * 1000)));
      return {
        clientId,
        clientName: c?.name || "Unknown",
        mrr: Math.round(data.recurringRevenue * 100) / 100,
        monthsActive,
        ltv: Math.round(data.recurringRevenue * monthsActive * 100) / 100,
      };
    })
    .sort((a, b) => b.ltv - a.ltv);

  // projectedAnnualRevenue will be computed on frontend using Converge actuals + MRR projection
  // Here we pass the building blocks
  const projectedFromMrr = currentMrr * (remainingMonths + 1); // current month + remaining
  const projectedAnnualRevenue = Math.round((projectedFromMrr + oneTimeRevenue) * 100) / 100;

  return {
    currentMrr,
    mrrTrend,
    revenueByCategory,
    clientLtv,
    projectedAnnualRevenue,
    lockedRevenue: Math.round(oneTimeRevenue * 100) / 100,
    remainingMonths,
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
