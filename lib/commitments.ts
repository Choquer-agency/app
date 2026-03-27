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

export interface MeetingMemberData {
  overdue: MeetingTicket[];
  missedCommitments: MeetingTicket[];
  dueThisWeek: MeetingTicket[];
  inProgress: MeetingTicket[];
  needsAttention: MeetingTicket[];
  reliability: ReliabilityScore;
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

export async function getMemberMeetingData(teamMemberId: number | string): Promise<MeetingMemberData> {
  const convex = getConvexClient();
  const reliability = await getReliabilityScoreForMember(teamMemberId);

  // Get tickets assigned to this member
  const ticketDocs = await convex.query(api.tickets.listByAssignee, {
    teamMemberId: teamMemberId as any,
    archived: false,
  });

  const today = new Date().toISOString().split("T")[0];
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
  const weekEndStr = weekEnd.toISOString().split("T")[0];

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

  const open = (ticketDocs as any[]).filter((t) => t.status !== "closed");
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today && isOverdueEligible(t.status)).map(toMeetingTicket);
  const dueThisWeek = open.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= weekEndStr).map(toMeetingTicket);
  const inProgress = open.filter((t) => t.status === "in_progress").map(toMeetingTicket);
  const needsAttention = open.filter((t) => t.status === "needs_attention" || t.status === "stuck").map(toMeetingTicket);

  return {
    overdue,
    missedCommitments: [],
    dueThisWeek,
    inProgress,
    needsAttention,
    reliability,
  };
}
