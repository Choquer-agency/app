import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import {
  Ticket,
  TicketAssignee,
  TicketStatus,
  TicketPriority,
  TicketFilters,
  CreateTicketInput,
} from "@/types";
import { logActivity } from "@/lib/ticket-activity";
import { notifyStatusChange, notifyAssigned } from "@/lib/notification-triggers";
import { docToTicket, docToAssignee } from "@/lib/ticket-mappers";

// Actor info for activity logging
export interface Actor {
  id: string;
  name: string;
}

// === Ticket Number Generation ===

export async function generateTicketNumber(): Promise<string> {
  // Ticket number generation is handled inside the Convex create mutation.
  // This is kept for interface compatibility but should not be called directly.
  return "CHQ-000";
}

// === CRUD Operations ===

// Viewer info for visibility filtering on personal tickets
export interface Viewer {
  teamMemberId: string;
  roleLevel: string;
}

export async function getTickets(
  filters: TicketFilters = {},
  viewer?: Viewer
): Promise<Ticket[]> {
  const convex = getConvexClient();

  const args: Record<string, any> = {};

  if (filters.clientId != null) args.clientId = filters.clientId as any;
  if (filters.projectId != null) args.projectId = filters.projectId as any;
  if (filters.parentTicketId != null) args.parentTicketId = filters.parentTicketId as any;
  if (filters.assigneeId != null) args.assigneeId = filters.assigneeId as any;
  if (filters.createdById != null) args.createdById = filters.createdById as any;
  if (filters.archived != null) args.archived = filters.archived;
  if (filters.isPersonal != null) args.isPersonal = filters.isPersonal;
  if (filters.serviceCategory !== undefined) args.serviceCategory = filters.serviceCategory;
  if (filters.search) args.search = filters.search;
  if (filters.startDateActive) args.startDateActive = filters.startDateActive;
  if (filters.limit != null) args.limit = filters.limit;
  if (filters.offset != null) args.offset = filters.offset;

  // Pass status filter
  if (filters.status) {
    args.status = Array.isArray(filters.status)
      ? filters.status
      : filters.status;
  }

  // Pass priority filter
  if (filters.priority) {
    args.priority = Array.isArray(filters.priority)
      ? filters.priority
      : filters.priority;
  }

  const docs = await convex.query(api.tickets.list, args as any);
  return docs.map(docToTicket);
}

export async function getTicketById(id: string): Promise<Ticket | null> {
  const convex = getConvexClient();
  const doc = await convex.query(api.tickets.getById, { id: id as any });
  if (!doc) return null;
  return docToTicket(doc);
}

export async function getTicketByNumber(
  ticketNumber: string
): Promise<Ticket | null> {
  const convex = getConvexClient();
  // Convex doesn't have a getByNumber query; use search to find by ticket number
  const docs = await convex.query(api.tickets.search, {
    query: ticketNumber,
    limit: 50,
  });
  const match = docs.find(
    (d: any) =>
      d.ticketNumber.toUpperCase() === ticketNumber.toUpperCase()
  );
  if (!match) return null;
  // Fetch full ticket with joined data
  return getTicketById(match._id);
}

export async function createTicket(
  data: CreateTicketInput,
  createdById: string,
  actor?: Actor
): Promise<Ticket> {
  const convex = getConvexClient();

  const args: Record<string, any> = {
    title: data.title,
    description: data.description || "",
    descriptionFormat: data.descriptionFormat || "plain",
    status: data.status || "needs_attention",
    priority: data.priority || "normal",
    ticketGroup: data.ticketGroup || "",
    sortOrder: data.sortOrder ?? 0,
    isPersonal: data.isPersonal ?? false,
    isMeeting: data.isMeeting ?? false,
    isEmail: data.isEmail ?? false,
    assignAllRoles: data.assignAllRoles ?? false,
    createdById: createdById as any,
  };

  if (data.clientId != null) args.clientId = data.clientId as any;
  if (data.projectId != null) args.projectId = data.projectId as any;
  if (data.parentTicketId != null) args.parentTicketId = data.parentTicketId as any;
  if (data.groupId != null) args.groupId = data.groupId as any;
  if (data.templateRoleId != null) args.templateRoleId = data.templateRoleId as any;
  if (data.startDate != null) args.startDate = data.startDate;
  if (data.dueDate != null) args.dueDate = data.dueDate;
  if (data.dueTime != null) args.dueTime = data.dueTime;
  if (data.dayOffsetStart != null) args.dayOffsetStart = data.dayOffsetStart;
  if (data.dayOffsetDue != null) args.dayOffsetDue = data.dayOffsetDue;
  if (data.serviceCategory != null) args.serviceCategory = data.serviceCategory;
  if (data.assigneeIds && data.assigneeIds.length > 0) {
    args.assigneeIds = data.assigneeIds.map((id) => id as any);
  }

  const doc = await convex.mutation(api.tickets.create, args as any);
  const ticketId = doc!._id;

  // Log activity
  if (actor) {
    await logActivity(ticketId, actor.id, actor.name, "created", {
      metadata: { ticketNumber: doc!.ticketNumber },
    });
  }

  // Return full ticket with joined data
  return (await getTicketById(ticketId))!;
}

export async function updateTicket(
  id: string,
  data: Partial<
    Omit<CreateTicketInput, "assigneeIds"> & {
      status: TicketStatus;
      priority: TicketPriority;
      archived: boolean;
    }
  >,
  actor?: Actor
): Promise<Ticket | null> {
  const convex = getConvexClient();

  // Fetch current ticket to detect changes for activity logging
  const current = await getTicketById(id);
  if (!current) return null;

  const args: Record<string, any> = { id: id as any };

  if (data.title !== undefined) args.title = data.title;
  if (data.description !== undefined) args.description = data.description;
  if (data.descriptionFormat !== undefined) args.descriptionFormat = data.descriptionFormat;
  if (data.clientId !== undefined) args.clientId = data.clientId ? (data.clientId as any) : undefined;
  if (data.projectId !== undefined) args.projectId = data.projectId ? (data.projectId as any) : undefined;
  if (data.parentTicketId !== undefined) args.parentTicketId = data.parentTicketId ? (data.parentTicketId as any) : undefined;
  if (data.status !== undefined) args.status = data.status;
  if (data.priority !== undefined) args.priority = data.priority;
  if (data.ticketGroup !== undefined) args.ticketGroup = data.ticketGroup;
  if (data.groupId !== undefined) args.groupId = data.groupId ? (data.groupId as any) : undefined;
  if (data.templateRoleId !== undefined) args.templateRoleId = data.templateRoleId ? (data.templateRoleId as any) : undefined;
  if (data.startDate !== undefined) args.startDate = data.startDate ?? undefined;
  if (data.dueDate !== undefined) args.dueDate = data.dueDate ?? undefined;
  if (data.dueTime !== undefined) args.dueTime = data.dueTime ?? undefined;
  if (data.sortOrder !== undefined) args.sortOrder = data.sortOrder;
  if (data.archived !== undefined) args.archived = data.archived;
  if (data.isMeeting !== undefined) args.isMeeting = data.isMeeting;
  if (data.assignAllRoles !== undefined) args.assignAllRoles = data.assignAllRoles;

  await convex.mutation(api.tickets.update, args as any);

  // Log activity for each changed field
  if (actor) {
    const status = data.status ?? current.status;
    const priority = data.priority ?? current.priority;
    const title = data.title ?? current.title;
    const description = data.description ?? current.description;
    const ticketGroup = data.ticketGroup ?? current.ticketGroup;
    const dueDate = data.dueDate !== undefined ? data.dueDate : current.dueDate;
    const startDate = data.startDate !== undefined ? data.startDate : current.startDate;

    if (status !== current.status) {
      await logActivity(id, actor.id, actor.name, "status_change", {
        fieldName: "status",
        oldValue: current.status,
        newValue: status,
      });
      notifyStatusChange(id, current.status, status, actor.id);
    }
    if (priority !== current.priority) {
      await logActivity(id, actor.id, actor.name, "priority_change", {
        fieldName: "priority",
        oldValue: current.priority,
        newValue: priority,
      });
    }
    if (title !== current.title) {
      await logActivity(id, actor.id, actor.name, "title_change", {
        fieldName: "title",
        oldValue: current.title,
        newValue: title,
      });
    }
    if (description !== current.description) {
      await logActivity(id, actor.id, actor.name, "description_updated", {
        fieldName: "description",
      });
    }
    if (ticketGroup !== current.ticketGroup) {
      await logActivity(id, actor.id, actor.name, "group_change", {
        fieldName: "ticket_group",
        oldValue: current.ticketGroup || null,
        newValue: ticketGroup || null,
      });
    }
    if (dueDate !== current.dueDate) {
      await logActivity(id, actor.id, actor.name, "due_date_change", {
        fieldName: "due_date",
        oldValue: current.dueDate,
        newValue: dueDate,
      });
    }
    if (startDate !== current.startDate) {
      await logActivity(id, actor.id, actor.name, "due_date_change", {
        fieldName: "start_date",
        oldValue: current.startDate,
        newValue: startDate,
      });
    }
  }

  return await getTicketById(id);
}

export async function archiveTicket(
  id: string,
  actor?: Actor
): Promise<boolean> {
  const convex = getConvexClient();
  const result = await convex.mutation(api.tickets.archive, {
    id: id as any,
  });
  if (result && actor) {
    await logActivity(id, actor.id, actor.name, "archived");
  }
  return !!result;
}

export async function restoreTicket(
  id: string,
  actor?: Actor
): Promise<boolean> {
  const convex = getConvexClient();
  const result = await convex.mutation(api.tickets.restore, {
    id: id as any,
  });
  if (result && actor) {
    await logActivity(id, actor.id, actor.name, "restored");
  }
  return !!result;
}

// === Query Helpers ===

export async function getSubTickets(parentTicketId: string): Promise<Ticket[]> {
  return getTickets({ parentTicketId, limit: 100 });
}

export async function getTicketsByClient(clientId: string): Promise<Ticket[]> {
  return getTickets({ clientId, limit: 200 });
}

export async function getTicketsByAssignee(
  teamMemberId: string
): Promise<Ticket[]> {
  return getTickets({ assigneeId: teamMemberId, limit: 200 });
}

// === Assignee Management ===

export async function getTicketAssignees(
  ticketId: string
): Promise<TicketAssignee[]> {
  const convex = getConvexClient();
  // Use the tickets.getAssignees query which returns joined member data
  const docs = await convex.query(api.tickets.getAssignees, {
    ticketId: ticketId as any,
  });
  return docs.map(docToAssignee);
}

export async function addAssignee(
  ticketId: string,
  teamMemberId: string,
  actor?: Actor
): Promise<TicketAssignee | null> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.tickets.addAssignee, {
    ticketId: ticketId as any,
    teamMemberId: teamMemberId as any,
  });
  if (!doc) return null;

  const assignee = docToAssignee(doc);

  if (actor) {
    // Re-fetch assignees to get the member name
    const assignees = await getTicketAssignees(ticketId);
    const found = assignees.find((a) => a.teamMemberId === teamMemberId);
    await logActivity(ticketId, actor.id, actor.name, "assigned", {
      newValue: found?.memberName || String(teamMemberId),
      metadata: { teamMemberId },
    });
    notifyAssigned(ticketId, teamMemberId, actor.id);
  }

  return assignee;
}

export async function removeAssignee(
  ticketId: string,
  teamMemberId: string,
  actor?: Actor
): Promise<boolean> {
  // Get member name before removing
  let memberName: string | undefined;
  if (actor) {
    const assignees = await getTicketAssignees(ticketId);
    const found = assignees.find((a) => a.teamMemberId === teamMemberId);
    memberName = found?.memberName;
  }

  const convex = getConvexClient();
  const result = await convex.mutation(api.tickets.removeAssignee, {
    ticketId: ticketId as any,
    teamMemberId: teamMemberId as any,
  });
  const success = !!result;

  if (success && actor) {
    await logActivity(ticketId, actor.id, actor.name, "unassigned", {
      oldValue: memberName || String(teamMemberId),
      metadata: { teamMemberId },
    });
  }

  return success;
}

// === Bulk Operations ===

export async function bulkUpdateStatus(
  ticketIds: string[],
  status: TicketStatus,
  actor?: Actor
): Promise<number> {
  if (ticketIds.length === 0) return 0;
  const convex = getConvexClient();

  // Fetch current statuses for activity logging
  let oldStatuses: Record<string, string> = {};
  if (actor) {
    for (const ticketId of ticketIds) {
      const ticket = await getTicketById(ticketId);
      if (ticket) {
        oldStatuses[ticketId] = ticket.status;
      }
    }
  }

  const count = await convex.mutation(api.tickets.bulkUpdateStatus, {
    ticketIds: ticketIds as any,
    status,
  });

  if (actor) {
    for (const ticketId of ticketIds) {
      if (oldStatuses[ticketId] && oldStatuses[ticketId] !== status) {
        await logActivity(ticketId, actor.id, actor.name, "status_change", {
          fieldName: "status",
          oldValue: oldStatuses[ticketId],
          newValue: status,
        });
        notifyStatusChange(ticketId, oldStatuses[ticketId], status, actor.id);
      }
    }
  }

  return count;
}

export async function bulkUpdatePriority(
  ticketIds: string[],
  priority: TicketPriority,
  actor?: Actor
): Promise<number> {
  if (ticketIds.length === 0) return 0;
  const convex = getConvexClient();

  // Fetch current priorities for activity logging
  let oldPriorities: Record<string, string> = {};
  if (actor) {
    for (const ticketId of ticketIds) {
      const ticket = await getTicketById(ticketId);
      if (ticket) {
        oldPriorities[ticketId] = ticket.priority;
      }
    }
  }

  // No bulkUpdatePriority in Convex yet — update one by one
  let count = 0;
  for (const ticketId of ticketIds) {
    await convex.mutation(api.tickets.update, {
      id: ticketId as any,
      priority,
    });
    count++;
  }

  if (actor) {
    for (const ticketId of ticketIds) {
      if (oldPriorities[ticketId] && oldPriorities[ticketId] !== priority) {
        await logActivity(ticketId, actor.id, actor.name, "priority_change", {
          fieldName: "priority",
          oldValue: oldPriorities[ticketId],
          newValue: priority,
        });
      }
    }
  }

  return count;
}

export async function bulkAssign(
  ticketIds: string[],
  teamMemberId: string,
  action: "add" | "remove",
  actor?: Actor
): Promise<number> {
  if (ticketIds.length === 0) return 0;
  const convex = getConvexClient();

  // Get member name for activity logging
  let memberName: string | undefined;
  if (actor) {
    const assignees = await getTicketAssignees(ticketIds[0]);
    const found = assignees.find((a) => a.teamMemberId === teamMemberId);
    memberName = found?.memberName;
  }

  const count = await convex.mutation(api.tickets.bulkAssign, {
    ticketIds: ticketIds as any,
    teamMemberId: teamMemberId as any,
    action,
  });

  if (actor && count > 0) {
    for (const ticketId of ticketIds) {
      if (action === "add") {
        await logActivity(ticketId, actor.id, actor.name, "assigned", {
          newValue: memberName || String(teamMemberId),
          metadata: { teamMemberId },
        });
        notifyAssigned(ticketId, teamMemberId, actor.id);
      } else {
        await logActivity(ticketId, actor.id, actor.name, "unassigned", {
          oldValue: memberName || String(teamMemberId),
          metadata: { teamMemberId },
        });
      }
    }
  }

  return count;
}

// === Reorder ===

export async function reorderTickets(
  items: Array<{ id: string; sortOrder: number }>
): Promise<number> {
  const convex = getConvexClient();
  const count = await convex.mutation(api.tickets.reorder, {
    items: items.map((item) => ({
      id: item.id as any,
      sortOrder: item.sortOrder,
    })),
  });
  return count;
}

// === Search ===

export async function searchTickets(
  query: string,
  limit = 20
): Promise<Ticket[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.tickets.search, { query, limit });
  return docs.map(docToTicket);
}
