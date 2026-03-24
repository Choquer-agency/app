import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";

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

  // Stub: return members with 0 hours (time entries aggregation needs implementation)
  const memberList: UtilizationMember[] = (members as any[]).map((m) => ({
    teamMemberId: m._id,
    memberName: m.name,
    memberColor: m.color || "#6B7280",
    totalHours: 0,
    availableHours: (m.availableHoursPerWeek ?? 40) * 4,
    utilizationPct: 0,
    byClient: [],
  }));

  return {
    members: memberList,
    period: { start, end },
    totalTeamHours: 0,
    avgUtilization: 0,
  };
}

export async function getProfitabilityReport(month: string): Promise<ProfitabilityReport> {
  return { clients: [], trends: [], month: month.slice(0, 7) };
}

export async function getVelocityReport(weeks: number = 12): Promise<VelocityReport> {
  return { avgResolution: [], weeklyThroughput: [], statusDurations: [], overallAvgHours: 0, totalClosed: 0 };
}

export async function getPerformanceReport(start: string, end: string, memberId?: string): Promise<PerformanceReport> {
  const convex = getConvexClient();
  const members = await convex.query(api.teamMembers.list, { activeOnly: true });

  const memberList: PerformanceMember[] = (members as any[])
    .filter((m) => !memberId || m._id === memberId)
    .map((m) => ({
      teamMemberId: m._id,
      memberName: m.name,
      memberColor: m.color || "#6B7280",
      memberProfilePicUrl: m.profilePicUrl || "",
      availableHoursPerWeek: m.availableHoursPerWeek ?? 40,
      ticketsClosed: 0,
      avgResolutionHours: 0,
      hoursLogged: 0,
      overdueTickets: 0,
      openTickets: 0,
      avgOpenHours: 0,
      onTimeCount: 0,
      withDueDateCount: 0,
      onTimePct: 0,
    }));

  return { members: memberList, openTickets: [], period: { start, end } };
}

export async function getRevenueReport(months: number = 12): Promise<RevenueReport> {
  const convex = getConvexClient();
  const clients = await convex.query(api.clients.list, {});
  const currentMrr = (clients as any[]).reduce((sum, c) => sum + (c.mrr || 0), 0);

  return {
    currentMrr,
    mrrTrend: [],
    revenueByCategory: [],
    clientLtv: (clients as any[])
      .filter((c) => c.mrr > 0)
      .map((c) => ({
        clientId: c._id,
        clientName: c.name,
        mrr: c.mrr || 0,
        monthsActive: 1,
        ltv: c.mrr || 0,
      })),
    projectedAnnualRevenue: Math.round(currentMrr * 12 * 100) / 100,
  };
}

export async function getForecastingReport(): Promise<ForecastingReport> {
  return {
    upcomingDeadlines: [],
    teamWorkload: [],
    deadlineHeatmap: [],
  };
}
