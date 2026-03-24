import { sql } from "@vercel/postgres";
import { TicketCommitment, CommitmentStatus, ReliabilityScore } from "@/types";

function rowToCommitment(row: Record<string, unknown>): TicketCommitment {
  return {
    id: row.id as number,
    ticketId: row.ticket_id as number,
    teamMemberId: row.team_member_id as number,
    committedDate: (row.committed_date as Date).toISOString().split("T")[0],
    committedAt: (row.committed_at as Date)?.toISOString(),
    committedById: (row.committed_by_id as number) ?? null,
    status: (row.status as CommitmentStatus) || "active",
    resolvedAt: row.resolved_at ? (row.resolved_at as Date).toISOString() : null,
    notes: (row.notes as string) || "",
    memberName: (row.member_name as string) || undefined,
    committedByName: (row.committed_by_name as string) || undefined,
  };
}

// === CRUD ===

export async function getCommitmentsForTicket(ticketId: number): Promise<TicketCommitment[]> {
  const { rows } = await sql`
    SELECT tc.*, tm.name AS member_name, cb.name AS committed_by_name
    FROM ticket_commitments tc
    JOIN team_members tm ON tm.id = tc.team_member_id
    LEFT JOIN team_members cb ON cb.id = tc.committed_by_id
    WHERE tc.ticket_id = ${ticketId}
    ORDER BY tc.committed_at DESC
  `;
  return rows.map(rowToCommitment);
}

export async function getCommitmentsForMember(
  teamMemberId: number,
  status?: CommitmentStatus
): Promise<TicketCommitment[]> {
  const statusFilter = status ?? null;
  const { rows } = await sql`
    SELECT tc.*, tm.name AS member_name, cb.name AS committed_by_name
    FROM ticket_commitments tc
    JOIN team_members tm ON tm.id = tc.team_member_id
    LEFT JOIN team_members cb ON cb.id = tc.committed_by_id
    WHERE tc.team_member_id = ${teamMemberId}
      AND (${statusFilter}::text IS NULL OR tc.status = ${statusFilter})
    ORDER BY tc.committed_date ASC
  `;
  return rows.map(rowToCommitment);
}

export async function addCommitment(data: {
  ticketId: number;
  teamMemberId: number;
  committedDate: string;
  committedById: number;
  notes?: string;
}): Promise<TicketCommitment> {
  const { rows } = await sql`
    INSERT INTO ticket_commitments (ticket_id, team_member_id, committed_date, committed_by_id, notes)
    VALUES (${data.ticketId}, ${data.teamMemberId}, ${data.committedDate}, ${data.committedById}, ${data.notes || ""})
    ON CONFLICT (ticket_id, team_member_id, committed_date) DO UPDATE SET
      notes = EXCLUDED.notes,
      committed_at = NOW(),
      committed_by_id = EXCLUDED.committed_by_id
    RETURNING *
  `;
  return rowToCommitment(rows[0]);
}

export async function resolveCommitment(
  commitmentId: number,
  status: "met" | "missed"
): Promise<void> {
  await sql`
    UPDATE ticket_commitments
    SET status = ${status}, resolved_at = NOW()
    WHERE id = ${commitmentId} AND status = 'active'
  `;
}

// === Auto-resolution: run by cron ===

/** Mark all active commitments whose date has passed as 'missed' (ticket still open) */
export async function autoResolveMissedCommitments(): Promise<number> {
  const { rowCount } = await sql`
    UPDATE ticket_commitments tc
    SET status = 'missed', resolved_at = NOW()
    FROM tickets t
    WHERE tc.ticket_id = t.id
      AND tc.status = 'active'
      AND tc.committed_date < CURRENT_DATE
      AND t.status NOT IN ('closed', 'approved_go_live')
  `;
  return rowCount ?? 0;
}

/** Mark active commitments as 'met' if the ticket was closed before the committed date */
export async function autoResolveMetCommitments(): Promise<number> {
  const { rowCount } = await sql`
    UPDATE ticket_commitments tc
    SET status = 'met', resolved_at = NOW()
    FROM tickets t
    WHERE tc.ticket_id = t.id
      AND tc.status = 'active'
      AND t.status IN ('closed', 'approved_go_live')
      AND t.closed_at IS NOT NULL
  `;
  return rowCount ?? 0;
}

// === Reliability Score ===

export async function getReliabilityScores(days: number = 90): Promise<ReliabilityScore[]> {
  const { rows } = await sql`
    SELECT tc.team_member_id, tm.name AS member_name,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE tc.status = 'met') AS met,
      COUNT(*) FILTER (WHERE tc.status = 'missed') AS missed
    FROM ticket_commitments tc
    JOIN team_members tm ON tm.id = tc.team_member_id
    WHERE tc.committed_at > NOW() - (${days} || ' days')::interval
      AND tc.status != 'active'
    GROUP BY tc.team_member_id, tm.name
    ORDER BY tm.name
  `;

  return rows.map((r) => {
    const total = Number(r.total);
    const met = Number(r.met);
    const missed = Number(r.missed);
    return {
      teamMemberId: r.team_member_id as number,
      memberName: r.member_name as string,
      totalCommitments: total,
      commitmentsMet: met,
      commitmentsMissed: missed,
      score: total > 0 ? Math.round((met / total) * 100) : 0,
    };
  });
}

export async function getReliabilityScoreForMember(
  teamMemberId: number,
  days: number = 90
): Promise<ReliabilityScore> {
  const { rows } = await sql`
    SELECT tc.team_member_id, tm.name AS member_name,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE tc.status = 'met') AS met,
      COUNT(*) FILTER (WHERE tc.status = 'missed') AS missed
    FROM ticket_commitments tc
    JOIN team_members tm ON tm.id = tc.team_member_id
    WHERE tc.team_member_id = ${teamMemberId}
      AND tc.committed_at > NOW() - (${days} || ' days')::interval
      AND tc.status != 'active'
    GROUP BY tc.team_member_id, tm.name
  `;

  if (rows.length === 0) {
    return {
      teamMemberId,
      memberName: "",
      totalCommitments: 0,
      commitmentsMet: 0,
      commitmentsMissed: 0,
      score: 0,
    };
  }

  const r = rows[0];
  const total = Number(r.total);
  const met = Number(r.met);
  return {
    teamMemberId: r.team_member_id as number,
    memberName: r.member_name as string,
    totalCommitments: total,
    commitmentsMet: met,
    commitmentsMissed: Number(r.missed),
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
  id: number;
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

export async function getMemberMeetingData(teamMemberId: number): Promise<MeetingMemberData> {
  // Get all open tickets assigned to this member
  const { rows: ticketRows } = await sql`
    SELECT DISTINCT t.id, t.ticket_number, t.title, t.status, t.priority, t.due_date,
      c.name AS client_name
    FROM tickets t
    JOIN ticket_assignees ta ON ta.ticket_id = t.id
    LEFT JOIN clients c ON c.id = t.client_id
    WHERE ta.team_member_id = ${teamMemberId}
      AND t.status NOT IN ('closed', 'approved_go_live')
      AND t.archived = false
      AND t.parent_ticket_id IS NULL
    ORDER BY t.due_date ASC NULLS LAST
  `;

  // Get all commitments for this member's open tickets
  const ticketIds = ticketRows.map((r) => r.id as number);
  const ticketIdsCsv = ticketIds.join(",");

  let commitmentMap = new Map<number, TicketCommitment[]>();
  if (ticketIds.length > 0) {
    const { rows: commitRows } = await sql`
      SELECT tc.*, tm.name AS member_name, cb.name AS committed_by_name
      FROM ticket_commitments tc
      JOIN team_members tm ON tm.id = tc.team_member_id
      LEFT JOIN team_members cb ON cb.id = tc.committed_by_id
      WHERE tc.ticket_id = ANY(string_to_array(${ticketIdsCsv}, ',')::int[])
        AND tc.team_member_id = ${teamMemberId}
      ORDER BY tc.committed_at DESC
    `;
    for (const row of commitRows) {
      const c = rowToCommitment(row);
      if (!commitmentMap.has(c.ticketId)) commitmentMap.set(c.ticketId, []);
      commitmentMap.get(c.ticketId)!.push(c);
    }
  }

  const now = new Date();
  const today = now.toISOString().split("T")[0];

  // Calculate Monday of this week
  const day = now.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  const fridayEnd = new Date(monday);
  fridayEnd.setDate(monday.getDate() + 4);
  const endOfWeek = fridayEnd.toISOString().split("T")[0];

  function buildMeetingTicket(row: Record<string, unknown>): MeetingTicket {
    const id = row.id as number;
    const commitments = commitmentMap.get(id) || [];
    const lastCommitment = commitments.length > 0 ? commitments[0] : null;
    const missedCount = commitments.filter((c) => c.status === "missed").length;

    return {
      id,
      ticketNumber: row.ticket_number as string,
      title: row.title as string,
      status: row.status as string,
      priority: row.priority as string,
      dueDate: row.due_date ? (row.due_date as Date).toISOString().split("T")[0] : null,
      clientName: (row.client_name as string) || null,
      lastCommitment,
      commitmentCount: commitments.length,
      missedCommitmentCount: missedCount,
    };
  }

  const allTickets = ticketRows.map(buildMeetingTicket);

  // Categorize
  const overdue = allTickets.filter((t) => t.dueDate && t.dueDate < today);
  const missedCommitments = allTickets.filter((t) => t.missedCommitmentCount > 0 && !overdue.includes(t));
  const dueThisWeek = allTickets.filter(
    (t) => t.dueDate && t.dueDate >= today && t.dueDate <= endOfWeek && !overdue.includes(t)
  );
  const inProgress = allTickets.filter(
    (t) => t.status === "in_progress" && !overdue.includes(t) && !dueThisWeek.includes(t) && !missedCommitments.includes(t)
  );
  const needsAttention = allTickets.filter(
    (t) =>
      (t.status === "needs_attention" || t.status === "stuck") &&
      !overdue.includes(t) &&
      !dueThisWeek.includes(t) &&
      !missedCommitments.includes(t)
  );

  // Sort overdue: most overdue first, then by priority
  overdue.sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    return 0;
  });

  const reliability = await getReliabilityScoreForMember(teamMemberId);

  return { overdue, missedCommitments, dueThisWeek, inProgress, needsAttention, reliability };
}
