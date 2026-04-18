import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import { TicketCommitment, CommitmentStatus, ReliabilityScore, isOverdueEligible } from "@/types";

// === Doc Mapper ===

function docToCommitment(doc: any): TicketCommitment {
  return {
    id: doc._id,
    ticketId: doc.ticketId,
    teamMemberId: doc.teamMemberId,
    committedDate: doc.committedDate ?? "",
    committedAt: doc._creationTime
      ? new Date(doc._creationTime).toISOString()
      : "",
    committedById: doc.committedById ?? null,
    status: (doc.status as CommitmentStatus) ?? "active",
    resolvedAt: doc.resolvedAt ?? null,
    notes: doc.notes ?? "",
    memberName: doc.memberName ?? undefined,
    committedByName: doc.committedByName ?? undefined,
  };
}

// === CRUD ===

export async function getCommitmentsForTicket(ticketId: number | string): Promise<TicketCommitment[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.commitments.listByTicket, {
    ticketId: ticketId as any,
  });
  return docs.map(docToCommitment);
}

export async function getCommitmentsForMember(
  teamMemberId: number | string,
  status?: CommitmentStatus
): Promise<TicketCommitment[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.commitments.listByMember, {
    teamMemberId: teamMemberId as any,
    status: status ?? undefined,
  });
  return docs.map(docToCommitment);
}

export async function addCommitment(data: {
  ticketId: number | string;
  teamMemberId: number | string;
  committedDate: string;
  committedById: number | string;
  notes?: string;
}): Promise<TicketCommitment> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.commitments.create, {
    ticketId: data.ticketId as any,
    teamMemberId: data.teamMemberId as any,
    committedDate: data.committedDate,
    committedById: data.committedById as any,
    notes: data.notes ?? "",
  });
  return docToCommitment(doc);
}

export async function resolveCommitment(
  commitmentId: number | string,
  status: "met" | "missed"
): Promise<void> {
  const convex = getConvexClient();
  await convex.mutation(api.commitments.update, {
    id: commitmentId as any,
    status,
    resolvedAt: new Date().toISOString(),
  });
}

// === Auto-resolution: run by cron ===

export async function autoResolveMissedCommitments(): Promise<number> {
  const convex = getConvexClient();
  const active = await convex.query(api.commitments.listActive, {});
  const today = new Date().toISOString().split("T")[0];
  let count = 0;
  for (const c of active as any[]) {
    if (c.committedDate < today) {
      // Check if ticket is still open
      const ticket = await convex.query(api.tickets.getById, { id: c.ticketId });
      if (ticket && (ticket as any).status !== "closed") {
        await convex.mutation(api.commitments.update, {
          id: c._id,
          status: "missed",
          resolvedAt: new Date().toISOString(),
        });
        count++;
      }
    }
  }
  return count;
}

export async function autoResolveMetCommitments(): Promise<number> {
  const convex = getConvexClient();
  const active = await convex.query(api.commitments.listActive, {});
  let count = 0;
  for (const c of active as any[]) {
    const ticket = await convex.query(api.tickets.getById, { id: c.ticketId });
    if (ticket && (ticket as any).status === "closed") {
      await convex.mutation(api.commitments.update, {
        id: c._id,
        status: "met",
        resolvedAt: new Date().toISOString(),
      });
      count++;
    }
  }
  return count;
}

// === Reliability Score ===

export async function getReliabilityScores(days: number = 90): Promise<ReliabilityScore[]> {
  const convex = getConvexClient();
  const members = await convex.query(api.teamMembers.list, { activeOnly: true });
  const scores: ReliabilityScore[] = [];
  for (const m of members as any[]) {
    const score = await getReliabilityScoreForMember(m._id, days);
    if (score.totalCommitments > 0) scores.push(score);
  }
  return scores;
}

export async function getReliabilityScoreForMember(
  teamMemberId: number | string,
  days: number = 90
): Promise<ReliabilityScore> {
  const convex = getConvexClient();
  const commitments = await convex.query(api.commitments.listByMember, {
    teamMemberId: teamMemberId as any,
  });

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  const recent = (commitments as any[]).filter((c) => c.committedDate >= cutoffStr);
  const met = recent.filter((c) => c.status === "met").length;
  const missed = recent.filter((c) => c.status === "missed").length;
  const total = met + missed;

  // Get member name
  let memberName = "";
  try {
    const member = await convex.query(api.teamMembers.getById, { id: teamMemberId as any });
    memberName = (member as any)?.name ?? "";
  } catch {}

  return {
    teamMemberId: teamMemberId as any,
    memberName,
    totalCommitments: total,
    commitmentsMet: met,
    commitmentsMissed: missed,
    score: total > 0 ? Math.round((met / total) * 100) : 0,
  };
}

// === Meeting Data ===

export interface MeetingReliability {
  score: number;
  onTime: number;
  missed: number;
  total: number;
}

export interface MeetingWorkMetrics {
  loggedHours: number;
  clockedHours: number;
  utilizationPct: number;
  ticketsAssigned: number;
  ticketsClosed: number;
  ticketsOpen: number;
  avgResolutionHours: number;
  avgClosedPerWeek: number;
}

export interface MeetingMemberData {
  overdue: MeetingTicket[];
  dueThisWeek: MeetingTicket[];
  inProgress: MeetingTicket[];
  needsAttention: MeetingTicket[];
  reliability: MeetingReliability;
  workMetrics: MeetingWorkMetrics;
}

export interface MeetingTicket {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  clientName: string | null;
  lastCommitment: TicketCommitment | null;
  commitmentCount: number;
  missedCommitmentCount: number;
}

export async function getMemberMeetingData(teamMemberId: number | string, period?: string): Promise<MeetingMemberData> {
  const convex = getConvexClient();

  // Determine date range based on period
  const now = new Date();
  let periodStart: Date;
  let periodEnd: Date = new Date(now);
  periodEnd.setHours(23, 59, 59, 999);

  switch (period) {
    case "last_week": {
      const day = now.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() - diffToMonday);
      periodStart = new Date(thisMonday);
      periodStart.setDate(thisMonday.getDate() - 7);
      periodStart.setHours(0, 0, 0, 0);
      periodEnd = new Date(periodStart);
      periodEnd.setDate(periodStart.getDate() + 4);
      periodEnd.setHours(23, 59, 59, 999);
      break;
    }
    case "this_month":
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "last_month":
      periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      periodEnd.setHours(23, 59, 59, 999);
      break;
    case "this_year":
      periodStart = new Date(now.getFullYear(), 0, 1);
      break;
    default: { // this_week
      const day = now.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      periodStart = new Date(now);
      periodStart.setDate(now.getDate() - diffToMonday);
      periodStart.setHours(0, 0, 0, 0);
      break;
    }
  }

  const periodStartStr = periodStart.toISOString().split("T")[0];
  const periodEndStr = periodEnd.toISOString().split("T")[0];
  const periodMs = periodEnd.getTime() - periodStart.getTime();
  const periodWeeks = Math.max(1, periodMs / (7 * 24 * 60 * 60 * 1000));

  // Get ALL tickets assigned to this member
  const ticketDocs = await convex.query(api.tickets.listByAssignee, {
    teamMemberId: teamMemberId as any,
    limit: 500,
  });

  const today = new Date().toISOString().split("T")[0];
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
  const weekEndStr = weekEnd.toISOString().split("T")[0];

  const allTickets = ticketDocs as any[];

  // Reliability: rolling 30-day window of tickets whose due date has already passed,
  // PLUS any currently open+overdue ticket regardless of age (so stale backlog is visible).
  // Future-due tickets are out of scope — you can't miss a deadline that hasn't arrived.
  // onTime  = closed on or before due date (and due date was within the window)
  // missed  = closed after due date, OR still open with a past due date
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

  let onTime = 0;
  let missed = 0;
  for (const t of allTickets) {
    if (!t.dueDate) continue;
    const isClosed = t.status === "closed" && t.closedAt;
    const isCurrentlyOverdue = !isClosed && t.dueDate < today && isOverdueEligible(t.status);
    const dueInLast30 = t.dueDate >= thirtyDaysAgoStr && t.dueDate <= today;

    if (!dueInLast30 && !isCurrentlyOverdue) continue;

    if (isClosed) {
      const closedDate = t.closedAt.split("T")[0];
      if (closedDate <= t.dueDate) onTime++;
      else missed++;
    } else if (isCurrentlyOverdue) {
      missed++;
    }
  }
  const reliabilityTotal = onTime + missed;
  const score = reliabilityTotal > 0 ? Math.round((onTime / reliabilityTotal) * 100) : 0;

  // Work metrics: tickets closed in period
  const closedInPeriod = allTickets.filter((t) =>
    t.status === "closed" && t.closedAt &&
    t.closedAt >= periodStart.toISOString() && t.closedAt <= periodEnd.toISOString()
  );
  const open = allTickets.filter((t) => t.status !== "closed" && !t.archived);

  // Avg resolution for closed in period
  let totalResHours = 0;
  for (const t of closedInPeriod) {
    const created = new Date(t._creationTime).getTime();
    const closed = new Date(t.closedAt).getTime();
    totalResHours += (closed - created) / (1000 * 60 * 60);
  }
  const avgResolutionHours = closedInPeriod.length > 0 ? Math.round((totalResHours / closedInPeriod.length) * 10) / 10 : 0;

  // Timesheet: clocked hours in period
  const member = await convex.query(api.teamMembers.getById, { id: teamMemberId as any });
  const isSalary = (member as any)?.payType === "salary";
  let clockedHours: number;

  if (isSalary) {
    clockedHours = ((member as any)?.availableHoursPerWeek ?? 40) * Math.round(periodWeeks);
  } else {
    const timesheetEntries = await convex.query(api.timesheetEntries.listByMember, {
      teamMemberId: teamMemberId as any,
      startDate: periodStartStr,
      endDate: periodEndStr,
      limit: 500,
    });
    const clockedMinutes = (timesheetEntries as any[])
      .filter((e) => !e.isSickDay && !e.isVacation)
      .reduce((sum, e) => sum + (e.workedMinutes ?? 0), 0);
    clockedHours = Math.round((clockedMinutes / 60) * 100) / 100;
  }

  // Time entries: logged hours in period
  const allEntries = await convex.query(api.timeEntries.listAll, { limit: 5000 });
  const memberEntries = (allEntries as any[]).filter((e) => {
    if (e.teamMemberId !== teamMemberId || !e.startTime) return false;
    const eStart = new Date(e.startTime);
    const eEnd = e.endTime ? new Date(e.endTime) : new Date();
    return eStart < periodEnd && eEnd > periodStart;
  });
  let loggedSeconds = 0;
  for (const entry of memberEntries) {
    const eStart = new Date(entry.startTime);
    const eEnd = entry.endTime ? new Date(entry.endTime) : new Date();
    const clampedStart = eStart < periodStart ? periodStart : eStart;
    const clampedEnd = eEnd > periodEnd ? periodEnd : eEnd;
    loggedSeconds += Math.max(0, (clampedEnd.getTime() - clampedStart.getTime()) / 1000);
  }
  const loggedHours = Math.round((loggedSeconds / 3600) * 100) / 100;
  const utilizationPct = clockedHours > 0 ? Math.round((loggedHours / clockedHours) * 100) : 0;

  const toMeetingTicket = (t: any): MeetingTicket => ({
    id: t._id,
    ticketNumber: t.ticketNumber ?? "",
    title: t.title ?? "",
    status: t.status ?? "",
    priority: t.priority ?? "normal",
    dueDate: t.dueDate ?? null,
    clientName: t.clientName ?? null,
    lastCommitment: null,
    commitmentCount: 0,
    missedCommitmentCount: 0,
  });

  const overdue = open.filter((t) => t.dueDate && t.dueDate < today && isOverdueEligible(t.status)).map(toMeetingTicket);
  const dueThisWeek = open.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= weekEndStr).map(toMeetingTicket);
  const inProgress = open.filter((t) => t.status === "in_progress").map(toMeetingTicket);
  const needsAttention = open.filter((t) => t.status === "needs_attention" || t.status === "stuck").map(toMeetingTicket);

  return {
    overdue,
    dueThisWeek,
    inProgress,
    needsAttention,
    reliability: { score, onTime, missed, total: reliabilityTotal },
    workMetrics: {
      loggedHours,
      clockedHours,
      utilizationPct,
      ticketsAssigned: allTickets.length,
      ticketsClosed: closedInPeriod.length,
      ticketsOpen: open.length,
      avgResolutionHours,
      avgClosedPerWeek: Math.round((closedInPeriod.length / periodWeeks) * 10) / 10,
    },
  };
}
