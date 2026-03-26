import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import { NotificationType } from "@/types";
import {
  createNotification,
  createBulkNotifications,
  hasRecentNotification,
} from "@/lib/notifications";
import { getTicketById, getTicketAssignees } from "@/lib/tickets";

// Helper: get ticket link
function ticketLink(ticketId: number | string): string {
  return `/admin/tickets?ticket=${ticketId}`;
}

// Helper: get admin/management team member IDs (bookkeeper and above)
async function getAdminIds(): Promise<string[]> {
  const convex = getConvexClient();
  // Fetch team members and filter by role level
  const members = await convex.query(api.teamMembers.list, {});
  return members
    .filter((m: any) => ["owner", "c_suite", "bookkeeper"].includes(m.roleLevel) && m.active !== false)
    .map((m: any) => m._id as string);
}

// Helper: get assignee IDs for a ticket
async function getAssigneeIds(ticketId: number | string): Promise<string[]> {
  const assignees = await getTicketAssignees(ticketId as any);
  return assignees.map((a: any) => a.teamMemberId);
}

// === Trigger: Assignment ===

export async function notifyAssigned(
  ticketId: number | string,
  assignedMemberId: number | string,
  actorId: number | string | null
): Promise<void> {
  if (assignedMemberId === actorId) return;

  const ticket = await getTicketById(ticketId as any);
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
  ticketId: number | string,
  oldStatus: string,
  newStatus: string,
  actorId: number | string | null
): Promise<void> {
  const ticket = await getTicketById(ticketId as any);
  if (!ticket) return;

  const recipientIds: string[] = [];
  if (ticket.createdById && ticket.createdById !== actorId) {
    recipientIds.push(ticket.createdById as string);
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
    ticketLink(ticketId),
    { newStatus }
  );
}

// === Trigger: Comment ===

export async function notifyComment(
  ticketId: number | string,
  commenterId: number | string | null,
  commenterName: string
): Promise<void> {
  const ticket = await getTicketById(ticketId as any);
  if (!ticket) return;

  const recipientIds: string[] = [];
  if (ticket.createdById && ticket.createdById !== commenterId) {
    recipientIds.push(ticket.createdById as string);
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
  ticketId: number | string,
  mentionedMemberIds: (number | string)[],
  actorId: number | string | null,
  actorName: string
): Promise<void> {
  if (mentionedMemberIds.length === 0) return;

  const ticket = await getTicketById(ticketId as any);
  if (!ticket) return;

  const recipientIds = mentionedMemberIds.filter((id) => id !== actorId);
  if (recipientIds.length === 0) return;

  await createBulkNotifications(
    recipientIds,
    ticketId,
    "mention",
    `${actorName} mentioned you in ${ticket.ticketNumber}`,
    ticket.title,
    ticketLink(ticketId)
  );
}

// === Trigger: Due Soon (cron) ===

export async function notifyDueSoon(
  ticketId: number | string,
  ticketNumber: string,
  ticketTitle: string,
  assigneeIds: (number | string)[]
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
  ticketId: number | string,
  ticketNumber: string,
  ticketTitle: string,
  creatorId: number | string | null,
  assigneeIds: (number | string)[]
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
  clientId: number | string,
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
  const recipientIds = [...adminIds];

  // If exceeded, also notify assignees of active tickets for this client
  // This would require a cross-table Convex query — simplified to admin-only for now

  for (const id of recipientIds) {
    const exists = await hasRecentNotification(id, type, null, 24);
    if (!exists) {
      await createNotification(id, null, type, title, body, `/admin/clients`);
    }
  }
}

// === Trigger: Runaway Timer (cron) ===

export async function notifyRunawayTimer(
  ticketId: number | string,
  ticketNumber: string,
  ticketTitle: string,
  teamMemberId: number | string
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

// === Trigger: Ticket Created ===

export async function notifyTicketCreated(
  ticketId: number | string,
  ticketNumber: string,
  ticketTitle: string,
  creatorId: number | string | null,
  assigneeIds: (number | string)[]
): Promise<void> {
  const recipientIds = assigneeIds.filter((id) => id !== creatorId);
  if (recipientIds.length === 0) return;

  await createBulkNotifications(
    recipientIds,
    ticketId,
    "ticket_created",
    `New ticket ${ticketNumber} created`,
    ticketTitle,
    ticketLink(ticketId)
  );
}

// === Trigger: Due Date Changed ===

export async function notifyDueDateChanged(
  ticketId: number | string,
  oldDate: string | null,
  newDate: string | null,
  actorId: number | string | null
): Promise<void> {
  const ticket = await getTicketById(ticketId as any);
  if (!ticket) return;

  const recipientIds: string[] = [];
  if (ticket.createdById && ticket.createdById !== actorId) {
    recipientIds.push(ticket.createdById as string);
  }
  const assigneeIds = await getAssigneeIds(ticketId);
  for (const id of assigneeIds) {
    if (id !== actorId && !recipientIds.includes(id)) {
      recipientIds.push(id);
    }
  }

  if (recipientIds.length === 0) return;

  const fmt = (d: string | null) => (d ? d : "none");
  await createBulkNotifications(
    recipientIds,
    ticketId,
    "due_date_changed",
    `${ticket.ticketNumber} due date changed`,
    `${fmt(oldDate)} \u2192 ${fmt(newDate)}`,
    ticketLink(ticketId)
  );
}

// === Trigger: Ticket Closed ===

export async function notifyTicketClosed(
  ticketId: number | string,
  actorId: number | string | null
): Promise<void> {
  const ticket = await getTicketById(ticketId as any);
  if (!ticket) return;

  const recipientIds: string[] = [];
  if (ticket.createdById && ticket.createdById !== actorId) {
    recipientIds.push(ticket.createdById as string);
  }
  const assigneeIds = await getAssigneeIds(ticketId);
  for (const id of assigneeIds) {
    if (id !== actorId && !recipientIds.includes(id)) {
      recipientIds.push(id);
    }
  }

  if (recipientIds.length === 0) return;

  await createBulkNotifications(
    recipientIds,
    ticketId,
    "ticket_closed",
    `${ticket.ticketNumber} was closed`,
    ticket.title,
    ticketLink(ticketId)
  );
}

// === Trigger: Vacation Requested (admin notification) ===

export async function notifyVacationRequested(
  memberName: string,
  memberId: number | string
): Promise<void> {
  const adminIds = await getAdminIds();
  const recipientIds = adminIds.filter((id) => id !== String(memberId));
  if (recipientIds.length === 0) return;

  await createBulkNotifications(
    recipientIds,
    null,
    "vacation_requested",
    `${memberName} requested vacation`,
    "Review in timesheet",
    "/admin/timesheet"
  );
}

// === Trigger: Vacation Resolved (employee notification) ===

export async function notifyVacationResolved(
  memberId: number | string,
  status: "approved" | "denied",
  reviewerName: string
): Promise<void> {
  await createNotification(
    memberId,
    null,
    "vacation_resolved",
    `Vacation request ${status}`,
    `${reviewerName} ${status} your vacation request`,
    "/admin/timesheet"
  );
}

// === Trigger: Time Adjustment Requested (admin notification) ===

export async function notifyTimeAdjustmentRequested(
  memberName: string,
  memberId: number | string
): Promise<void> {
  const adminIds = await getAdminIds();
  const recipientIds = adminIds.filter((id) => id !== String(memberId));
  if (recipientIds.length === 0) return;

  await createBulkNotifications(
    recipientIds,
    null,
    "time_adjustment_requested",
    `${memberName} requested a time adjustment`,
    "Review in timesheet",
    "/admin/timesheet"
  );
}

// === Trigger: Time Adjustment Resolved (employee notification) ===

export async function notifyTimeAdjustmentResolved(
  memberId: number | string,
  status: "approved" | "denied",
  reviewerName: string
): Promise<void> {
  await createNotification(
    memberId,
    null,
    "time_adjustment_resolved",
    `Time adjustment ${status}`,
    `${reviewerName} ${status} your time adjustment`,
    "/admin/timesheet"
  );
}

// === Trigger: Team Announcement ===

export async function notifyTeamAnnouncement(
  authorId: number | string,
  title: string
): Promise<void> {
  const convex = getConvexClient();
  const members = await convex.query(api.teamMembers.list, {});
  const recipientIds = members
    .filter((m: any) => m.active !== false && m._id !== String(authorId))
    .map((m: any) => m._id as string);

  if (recipientIds.length === 0) return;

  await createBulkNotifications(
    recipientIds,
    null,
    "team_announcement",
    "New team announcement",
    title,
    "/admin/bulletin"
  );
}
