import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import { TicketCommitment, CommitmentStatus, ReliabilityScore } from "@/types";

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
  // The Convex commitments module only has listByTicket.
  // For member-based queries, we'd need a dedicated Convex query.
  // Return empty for now.
  return [];
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
  // Would need a dedicated Convex action to scan all active commitments.
  // Not directly supported by current Convex functions.
  return 0;
}

export async function autoResolveMetCommitments(): Promise<number> {
  // Would need a dedicated Convex action.
  return 0;
}

// === Reliability Score ===

export async function getReliabilityScores(days: number = 90): Promise<ReliabilityScore[]> {
  // Would need a dedicated Convex query aggregating commitments across members.
  return [];
}

export async function getReliabilityScoreForMember(
  teamMemberId: number | string,
  days: number = 90
): Promise<ReliabilityScore> {
  // Not directly supported — would need a dedicated Convex query.
  return {
    teamMemberId: teamMemberId as any,
    memberName: "",
    totalCommitments: 0,
    commitmentsMet: 0,
    commitmentsMissed: 0,
    score: 0,
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
  // This requires complex cross-table queries (tickets, assignees, commitments, clients).
  // Would need dedicated Convex actions. Return empty structure for now.
  const reliability = await getReliabilityScoreForMember(teamMemberId);
  return {
    overdue: [],
    missedCommitments: [],
    dueThisWeek: [],
    inProgress: [],
    needsAttention: [],
    reliability,
  };
}
