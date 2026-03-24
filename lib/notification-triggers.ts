import { sql } from "@vercel/postgres";
import { NotificationType } from "@/types";
import {
  createNotification,
  createBulkNotifications,
  hasRecentNotification,
} from "@/lib/notifications";
import { getTicketById, getTicketAssignees } from "@/lib/tickets";

// Helper: get ticket link
function ticketLink(ticketId: number): string {
  return `/admin/tickets?ticket=${ticketId}`;
}

// Helper: get admin/management team member IDs (bookkeeper and above)
async function getAdminIds(): Promise<number[]> {
  const { rows } = await sql`
    SELECT id FROM team_members WHERE role_level IN ('owner', 'c_suite', 'bookkeeper') AND active = true
  `;
  return rows.map((r) => r.id as number);
}

// Helper: get assignee IDs for a ticket
async function getAssigneeIds(ticketId: number): Promise<number[]> {
  const assignees = await getTicketAssignees(ticketId);
  return assignees.map((a) => a.teamMemberId);
}

// === Trigger: Assignment ===

export async function notifyAssigned(
  ticketId: number,
  assignedMemberId: number,
  actorId: number | null
): Promise<void> {
  // Don't notify yourself
  if (assignedMemberId === actorId) return;

  const ticket = await getTicketById(ticketId);
  if (!ticket) return;

  await createNotification(
    assignedMemberId,
    ticketId,
    "assigned",
    `You were assigned to ${ticket.ticketNumber}`,
    ticket.title,
    ticketLink(ticketId)
  );
}

// === Trigger: Status Change ===

export async function notifyStatusChange(
  ticketId: number,
  oldStatus: string,
  newStatus: string,
  actorId: number | null
): Promise<void> {
  const ticket = await getTicketById(ticketId);
  if (!ticket) return;

  // Collect creator + assignees, exclude actor
  const recipientIds: number[] = [];
  if (ticket.createdById && ticket.createdById !== actorId) {
    recipientIds.push(ticket.createdById);
  }
  const assigneeIds = await getAssigneeIds(ticketId);
  for (const id of assigneeIds) {
    if (id !== actorId && !recipientIds.includes(id)) {
      recipientIds.push(id);
    }
  }

  if (recipientIds.length === 0) return;

  const statusLabel = (s: string) => s.replace(/_/g, " ");
  await createBulkNotifications(
    recipientIds,
    ticketId,
    "status_change",
    `${ticket.ticketNumber} status changed`,
    `${statusLabel(oldStatus)} \u2192 ${statusLabel(newStatus)}`,
    ticketLink(ticketId)
  );
}

// === Trigger: Comment ===

export async function notifyComment(
  ticketId: number,
  commenterId: number | null,
  commenterName: string
): Promise<void> {
  const ticket = await getTicketById(ticketId);
  if (!ticket) return;

  // Collect creator + assignees, exclude commenter
  const recipientIds: number[] = [];
  if (ticket.createdById && ticket.createdById !== commenterId) {
    recipientIds.push(ticket.createdById);
  }
  const assigneeIds = await getAssigneeIds(ticketId);
  for (const id of assigneeIds) {
    if (id !== commenterId && !recipientIds.includes(id)) {
      recipientIds.push(id);
    }
  }

  if (recipientIds.length === 0) return;

  await createBulkNotifications(
    recipientIds,
    ticketId,
    "comment",
    `${commenterName} commented on ${ticket.ticketNumber}`,
    ticket.title,
    ticketLink(ticketId)
  );
}

// === Trigger: Mention in description ===

export async function notifyMention(
  ticketId: number,
  mentionedMemberIds: number[],
  actorId: number | null,
  actorName: string
): Promise<void> {
  if (mentionedMemberIds.length === 0) return;

  const ticket = await getTicketById(ticketId);
  if (!ticket) return;

  // Exclude the actor from notifications
  const recipientIds = mentionedMemberIds.filter((id) => id !== actorId);
  if (recipientIds.length === 0) return;

  await createBulkNotifications(
    recipientIds,
    ticketId,
    "comment", // reuse comment type for mentions
    `${actorName} mentioned you in ${ticket.ticketNumber}`,
    ticket.title,
    ticketLink(ticketId)
  );
}

// === Trigger: Due Soon (cron) ===

export async function notifyDueSoon(
  ticketId: number,
  ticketNumber: string,
  ticketTitle: string,
  assigneeIds: number[]
): Promise<void> {
  for (const id of assigneeIds) {
    const exists = await hasRecentNotification(id, "due_soon", ticketId, 24);
    if (!exists) {
      await createNotification(
        id,
        ticketId,
        "due_soon",
        `${ticketNumber} is due soon`,
        "Due within 24 hours",
        ticketLink(ticketId)
      );
    }
  }
}

// === Trigger: Overdue (cron) ===

export async function notifyOverdue(
  ticketId: number,
  ticketNumber: string,
  ticketTitle: string,
  creatorId: number | null,
  assigneeIds: number[]
): Promise<void> {
  const recipientIds = [...assigneeIds];
  if (creatorId && !recipientIds.includes(creatorId)) {
    recipientIds.push(creatorId);
  }

  for (const id of recipientIds) {
    const exists = await hasRecentNotification(id, "overdue", ticketId, 24);
    if (!exists) {
      await createNotification(
        id,
        ticketId,
        "overdue",
        `${ticketNumber} is overdue`,
        ticketTitle,
        ticketLink(ticketId)
      );
    }
  }
}

// === Trigger: Hour Cap (cron) ===

export async function notifyHourCap(
  clientId: number,
  clientName: string,
  percentUsed: number,
  status: "warning" | "exceeded"
): Promise<void> {
  const type: NotificationType =
    status === "exceeded" ? "hour_cap_exceeded" : "hour_cap_warning";
  const title = `${clientName} at ${Math.round(percentUsed)}% of monthly hours`;
  const body =
    status === "exceeded"
      ? "Monthly hour cap exceeded"
      : "Approaching monthly hour cap (80%)";

  const adminIds = await getAdminIds();
  let recipientIds = [...adminIds];

  // If exceeded, also notify assignees of active tickets for this client
  if (status === "exceeded") {
    const { rows } = await sql`
      SELECT DISTINCT ta.team_member_id FROM ticket_assignees ta
      JOIN tickets t ON t.id = ta.ticket_id
      WHERE t.client_id = ${clientId} AND t.archived = false AND t.status != 'closed'
    `;
    for (const row of rows) {
      const id = row.team_member_id as number;
      if (!recipientIds.includes(id)) {
        recipientIds.push(id);
      }
    }
  }

  for (const id of recipientIds) {
    const exists = await hasRecentNotification(id, type, null, 24);
    if (!exists) {
      await createNotification(id, null, type, title, body, `/admin/clients`);
    }
  }
}

// === Trigger: Runaway Timer (cron) ===

export async function notifyRunawayTimer(
  ticketId: number,
  ticketNumber: string,
  ticketTitle: string,
  teamMemberId: number
): Promise<void> {
  const exists = await hasRecentNotification(
    teamMemberId,
    "runaway_timer",
    ticketId,
    24
  );
  if (exists) return;

  await createNotification(
    teamMemberId,
    ticketId,
    "runaway_timer",
    `Runaway timer on ${ticketNumber}`,
    "Timer has been running for over 10 hours",
    ticketLink(ticketId)
  );
}
