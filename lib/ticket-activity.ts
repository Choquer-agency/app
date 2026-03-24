import { sql } from "@vercel/postgres";
import { TicketActivity } from "@/types";

// === Row Mapper ===

function rowToActivity(row: Record<string, unknown>): TicketActivity {
  return {
    id: row.id as number,
    ticketId: row.ticket_id as number,
    actorId: (row.actor_id as number) ?? null,
    actorName: row.actor_name as string,
    actionType: row.action_type as string,
    fieldName: (row.field_name as string) ?? null,
    oldValue: (row.old_value as string) ?? null,
    newValue: (row.new_value as string) ?? null,
    metadata: (row.metadata as Record<string, unknown>) || {},
    createdAt: (row.created_at as Date)?.toISOString(),
  };
}

// === Log Activity ===

export async function logActivity(
  ticketId: number,
  actorId: number | null,
  actorName: string,
  actionType: string,
  options: {
    fieldName?: string;
    oldValue?: string | null;
    newValue?: string | null;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<TicketActivity> {
  const { rows } = await sql`
    INSERT INTO ticket_activity (
      ticket_id, actor_id, actor_name, action_type,
      field_name, old_value, new_value, metadata
    )
    VALUES (
      ${ticketId},
      ${actorId},
      ${actorName},
      ${actionType},
      ${options.fieldName ?? null},
      ${options.oldValue ?? null},
      ${options.newValue ?? null},
      ${JSON.stringify(options.metadata || {})}
    )
    RETURNING *
  `;
  return rowToActivity(rows[0]);
}

// === Query Activity ===

export async function getTicketActivity(
  ticketId: number,
  limit = 50,
  offset = 0
): Promise<TicketActivity[]> {
  const { rows } = await sql`
    SELECT * FROM ticket_activity
    WHERE ticket_id = ${ticketId}
    ORDER BY created_at ASC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return rows.map(rowToActivity);
}

export async function getRecentActivity(
  teamMemberId?: number,
  limit = 20
): Promise<TicketActivity[]> {
  if (teamMemberId) {
    // Activity on tickets assigned to this member
    const { rows } = await sql`
      SELECT ta.* FROM ticket_activity ta
      WHERE ta.ticket_id IN (
        SELECT ticket_id FROM ticket_assignees WHERE team_member_id = ${teamMemberId}
      )
      ORDER BY ta.created_at DESC
      LIMIT ${limit}
    `;
    return rows.map(rowToActivity);
  }

  // All recent activity
  const { rows } = await sql`
    SELECT * FROM ticket_activity
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows.map(rowToActivity);
}
