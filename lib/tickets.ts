import { sql } from "@vercel/postgres";
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

// Actor info for activity logging
export interface Actor {
  id: number;
  name: string;
}

// === Row Mappers ===

function rowToTicket(row: Record<string, unknown>): Ticket {
  return {
    id: row.id as number,
    ticketNumber: row.ticket_number as string,
    title: row.title as string,
    description: (row.description as string) || "",
    descriptionFormat: (row.description_format as "plain" | "tiptap") || "plain",
    clientId: (row.client_id as number) ?? null,
    projectId: (row.project_id as number) ?? null,
    parentTicketId: (row.parent_ticket_id as number) ?? null,
    status: row.status as TicketStatus,
    priority: row.priority as TicketPriority,
    ticketGroup: (row.ticket_group as string) || "",
    groupId: (row.group_id as number) ?? null,
    templateRoleId: (row.template_role_id as number) ?? null,
    startDate: row.start_date ? (row.start_date as Date).toISOString().split("T")[0] : null,
    dueDate: row.due_date ? (row.due_date as Date).toISOString().split("T")[0] : null,
    dueTime: (row.due_time as string) ?? null,
    sortOrder: (row.sort_order as number) || 0,
    createdById: (row.created_by_id as number) ?? null,
    archived: (row.archived as boolean) || false,
    isPersonal: (row.is_personal as boolean) || false,
    isMeeting: (row.is_meeting as boolean) || false,
    isEmail: (row.is_email as boolean) || false,
    assignAllRoles: (row.assign_all_roles as boolean) || false,
    dayOffsetStart: (row.day_offset_start as number) ?? null,
    dayOffsetDue: (row.day_offset_due as number) ?? null,
    serviceCategory: (row.service_category as import("@/types").ServiceBoardCategory) ?? null,
    closedAt: row.closed_at ? (row.closed_at as Date).toISOString() : null,
    createdAt: (row.created_at as Date)?.toISOString(),
    updatedAt: (row.updated_at as Date)?.toISOString(),
    // Joined fields
    clientName: (row.client_name as string) || undefined,
    createdByName: (row.created_by_name as string) || undefined,
    projectName: (row.project_name as string) || undefined,
    subTicketCount: row.sub_ticket_count !== undefined ? Number(row.sub_ticket_count) : undefined,
    commentCount: row.comment_count !== undefined ? Number(row.comment_count) : undefined,
    groupName: (row.group_name as string) || undefined,
    templateRoleName: (row.template_role_name as string) || undefined,
  };
}

function rowToAssignee(row: Record<string, unknown>): TicketAssignee {
  return {
    id: row.id as number,
    ticketId: row.ticket_id as number,
    teamMemberId: row.team_member_id as number,
    assignedAt: (row.assigned_at as Date)?.toISOString(),
    memberName: (row.member_name as string) || undefined,
    memberEmail: (row.member_email as string) || undefined,
    memberColor: (row.member_color as string) || undefined,
    memberProfilePicUrl: (row.member_profile_pic_url as string) || undefined,
  };
}

// === Ticket Number Generation ===

export async function generateTicketNumber(): Promise<string> {
  const { rows } = await sql`SELECT nextval('ticket_number_seq') AS num`;
  return `CHQ-${String(rows[0].num).padStart(3, "0")}`;
}

// === CRUD Operations ===

// Viewer info for visibility filtering on personal tickets
export interface Viewer {
  teamMemberId: number;
  roleLevel: string;
}

export async function getTickets(filters: TicketFilters = {}, viewer?: Viewer): Promise<Ticket[]> {
  const clientId = filters.clientId ?? null;
  const projectId = filters.projectId ?? null;
  const assigneeId = filters.assigneeId ?? null;
  const createdById = filters.createdById ?? null;
  const archived = filters.archived ?? false;
  const search = filters.search ? `%${filters.search}%` : null;
  const limit = filters.limit ?? 200;
  const offset = filters.offset ?? 0;
  const parentTicketId = filters.parentTicketId ?? null;
  // Service category filter: undefined = exclude service tickets (default for Task Management)
  // null = exclude service tickets, string = only that category
  const serviceCategoryFilter = filters.serviceCategory;

  // Personal board filter: true = only personal, false = only non-personal, undefined = default (see below)
  const isPersonalFilter = filters.isPersonal;
  const startDateActive = filters.startDateActive ?? false;

  // Handle single status/priority filter (most common case)
  const statusFilter = Array.isArray(filters.status)
    ? filters.status.join(",")
    : filters.status ?? null;
  const priorityFilter = Array.isArray(filters.priority)
    ? filters.priority.join(",")
    : filters.priority ?? null;

  // Viewer info for personal ticket visibility
  const viewerId = viewer?.teamMemberId ?? null;
  const isAdmin = viewer?.roleLevel ? ["owner", "c_suite", "bookkeeper"].includes(viewer.roleLevel) : false;

  const { rows } = await sql`
    SELECT t.*,
      c.name AS client_name,
      tm.name AS created_by_name,
      p.name AS project_name,
      (SELECT COUNT(*) FROM tickets sub WHERE sub.parent_ticket_id = t.id AND sub.archived = false) AS sub_ticket_count,
      (SELECT COUNT(*) FROM ticket_comments tc WHERE tc.ticket_id = t.id) AS comment_count
    FROM tickets t
    LEFT JOIN clients c ON c.id = t.client_id
    LEFT JOIN team_members tm ON tm.id = t.created_by_id
    LEFT JOIN projects p ON p.id = t.project_id
    WHERE t.archived = ${archived}
      AND (${clientId}::int IS NULL OR t.client_id = ${clientId})
      AND (${projectId}::int IS NULL OR t.project_id = ${projectId})
      AND (${createdById}::int IS NULL OR t.created_by_id = ${createdById})
      AND (${search}::text IS NULL OR t.title ILIKE ${search} OR t.ticket_number ILIKE ${search})
      AND (${assigneeId}::int IS NULL OR t.id IN (
        SELECT ticket_id FROM ticket_assignees WHERE team_member_id = ${assigneeId}
      ))
      AND (${parentTicketId}::int IS NULL OR t.parent_ticket_id = ${parentTicketId})
      AND (${statusFilter}::text IS NULL OR t.status = ANY(string_to_array(${statusFilter}, ',')))
      AND (${priorityFilter}::text IS NULL OR t.priority = ANY(string_to_array(${priorityFilter}, ',')))
      AND (${startDateActive}::boolean = false OR t.start_date IS NULL OR t.start_date <= CURRENT_DATE)
      AND (${startDateActive}::boolean = false OR NOT EXISTS (SELECT 1 FROM projects pr WHERE pr.id = t.project_id AND pr.is_template = true))
      AND (
        CASE
          WHEN ${serviceCategoryFilter ?? null}::text IS NOT NULL THEN t.service_category = ${serviceCategoryFilter ?? null}
          ELSE (t.service_category IS NULL OR t.service_category = 'retainer')
        END
      )
      AND (
        CASE
          -- Explicitly requesting personal tasks (My Board view)
          WHEN ${isPersonalFilter === true}::boolean THEN t.is_personal = true
          -- Explicitly requesting non-personal tasks
          WHEN ${isPersonalFilter === false}::boolean THEN t.is_personal = false
          -- Default: show non-personal + personal tasks that are linked to client/project (both-board) + own personal tasks
          ELSE (
            t.is_personal = false
            OR (t.is_personal = true AND (t.client_id IS NOT NULL OR t.project_id IS NOT NULL))
            OR (t.is_personal = true AND ${isAdmin}::boolean)
            OR (t.is_personal = true AND t.created_by_id = ${viewerId}::int)
          )
        END
      )
    ORDER BY
      CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END ASC,
      t.due_date ASC,
      t.created_at ASC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return rows.map(rowToTicket);
}

export async function getTicketById(id: number): Promise<Ticket | null> {
  const { rows } = await sql`
    SELECT t.*,
      c.name AS client_name,
      tm.name AS created_by_name,
      (SELECT COUNT(*) FROM tickets sub WHERE sub.parent_ticket_id = t.id AND sub.archived = false) AS sub_ticket_count,
      (SELECT COUNT(*) FROM ticket_comments tc WHERE tc.ticket_id = t.id) AS comment_count
    FROM tickets t
    LEFT JOIN clients c ON c.id = t.client_id
    LEFT JOIN team_members tm ON tm.id = t.created_by_id
    WHERE t.id = ${id}
  `;
  if (rows.length === 0) return null;

  const ticket = rowToTicket(rows[0]);
  ticket.assignees = await getTicketAssignees(id);
  return ticket;
}

export async function createTicket(
  data: CreateTicketInput,
  createdById: number,
  actor?: Actor
): Promise<Ticket> {
  const ticketNumber = await generateTicketNumber();

  // Auto-tag with service_category based on the client's active packages.
  // Any time logged on this ticket will count toward the client's service board hours.
  // Priority: retainer > seo > google_ads (retainer is the broadest catch-all)
  if (!data.serviceCategory && data.clientId) {
    const { rows: pkgCheck } = await sql`
      SELECT p.category FROM client_packages cp
      JOIN packages p ON p.id = cp.package_id
      WHERE cp.client_id = ${data.clientId}
        AND cp.active = true
        AND p.category IN ('retainer', 'seo', 'google_ads')
      ORDER BY
        CASE p.category
          WHEN 'retainer' THEN 1
          WHEN 'seo' THEN 2
          WHEN 'google_ads' THEN 3
        END
      LIMIT 1
    `;
    if (pkgCheck.length > 0) {
      data.serviceCategory = pkgCheck[0].category as "retainer" | "seo" | "google_ads";
    }
  }

  const { rows } = await sql`
    INSERT INTO tickets (
      ticket_number, title, description, description_format,
      client_id, project_id, parent_ticket_id, status, priority,
      ticket_group, group_id, template_role_id, start_date, due_date, due_time,
      sort_order, created_by_id, is_personal, is_meeting, assign_all_roles, day_offset_start, day_offset_due,
      service_category
    )
    VALUES (
      ${ticketNumber},
      ${data.title},
      ${data.description || ""},
      ${data.descriptionFormat || "plain"},
      ${data.clientId ?? null},
      ${data.projectId ?? null},
      ${data.parentTicketId ?? null},
      ${data.status || "needs_attention"},
      ${data.priority || "normal"},
      ${data.ticketGroup || ""},
      ${data.groupId ?? null},
      ${data.templateRoleId ?? null},
      ${data.startDate ?? null},
      ${data.dueDate ?? null},
      ${data.dueTime ?? null},
      ${data.sortOrder ?? 0},
      ${createdById},
      ${data.isPersonal ?? false},
      ${data.isMeeting ?? false},
      ${data.assignAllRoles ?? false},
      ${data.dayOffsetStart ?? null},
      ${data.dayOffsetDue ?? null},
      ${data.serviceCategory ?? null}
    )
    RETURNING *
  `;

  const ticketId = rows[0].id as number;

  // Add assignees if provided
  if (data.assigneeIds && data.assigneeIds.length > 0) {
    for (const memberId of data.assigneeIds) {
      await sql`
        INSERT INTO ticket_assignees (ticket_id, team_member_id)
        VALUES (${ticketId}, ${memberId})
        ON CONFLICT (ticket_id, team_member_id) DO NOTHING
      `;
    }
  }

  // Log activity
  if (actor) {
    await logActivity(ticketId, actor.id, actor.name, "created", {
      metadata: { ticketNumber },
    });
  }

  // Return full ticket with joined data
  return (await getTicketById(ticketId))!;
}

export async function updateTicket(
  id: number,
  data: Partial<
    Omit<CreateTicketInput, "assigneeIds"> & {
      status: TicketStatus;
      priority: TicketPriority;
      archived: boolean;
    }
  >,
  actor?: Actor
): Promise<Ticket | null> {
  // Fetch current ticket to detect status transitions
  const current = await getTicketById(id);
  if (!current) return null;

  const title = data.title ?? current.title;
  const description = data.description ?? current.description;
  const descriptionFormat = data.descriptionFormat ?? current.descriptionFormat;
  const clientId = data.clientId !== undefined ? data.clientId : current.clientId;
  const projectId = data.projectId !== undefined ? data.projectId : current.projectId;
  const parentTicketId = data.parentTicketId !== undefined ? data.parentTicketId : current.parentTicketId;
  const status = data.status ?? current.status;
  const priority = data.priority ?? current.priority;
  const ticketGroup = data.ticketGroup ?? current.ticketGroup;
  const groupId = data.groupId !== undefined ? data.groupId : current.groupId;
  const templateRoleId = data.templateRoleId !== undefined ? data.templateRoleId : current.templateRoleId;
  const startDate = data.startDate !== undefined ? data.startDate : current.startDate;
  const dueDate = data.dueDate !== undefined ? data.dueDate : current.dueDate;
  const dueTime = data.dueTime !== undefined ? data.dueTime : current.dueTime;
  const sortOrder = data.sortOrder ?? current.sortOrder;
  const archived = data.archived ?? current.archived;
  const isMeeting = data.isMeeting ?? current.isMeeting;
  const assignAllRoles = data.assignAllRoles ?? current.assignAllRoles;

  // Auto-manage closed_at
  let closedAt = current.closedAt;
  if (status === "closed" && current.status !== "closed") {
    closedAt = new Date().toISOString();
  } else if (status !== "closed" && current.status === "closed") {
    closedAt = null;
  }

  await sql`
    UPDATE tickets SET
      title = ${title},
      description = ${description},
      description_format = ${descriptionFormat},
      client_id = ${clientId},
      project_id = ${projectId},
      parent_ticket_id = ${parentTicketId},
      status = ${status},
      priority = ${priority},
      ticket_group = ${ticketGroup},
      group_id = ${groupId},
      template_role_id = ${templateRoleId},
      start_date = ${startDate},
      due_date = ${dueDate},
      due_time = ${dueTime},
      sort_order = ${sortOrder},
      archived = ${archived},
      is_meeting = ${isMeeting},
      assign_all_roles = ${assignAllRoles},
      closed_at = ${closedAt},
      updated_at = NOW()
    WHERE id = ${id}
  `;

  // Log activity for each changed field
  if (actor) {
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

export async function archiveTicket(id: number, actor?: Actor): Promise<boolean> {
  const { rowCount } = await sql`
    UPDATE tickets SET archived = true, updated_at = NOW() WHERE id = ${id}
  `;
  const success = (rowCount ?? 0) > 0;
  if (success && actor) {
    await logActivity(id, actor.id, actor.name, "archived");
  }
  return success;
}

export async function restoreTicket(id: number, actor?: Actor): Promise<boolean> {
  const { rowCount } = await sql`
    UPDATE tickets SET archived = false, updated_at = NOW() WHERE id = ${id}
  `;
  const success = (rowCount ?? 0) > 0;
  if (success && actor) {
    await logActivity(id, actor.id, actor.name, "restored");
  }
  return success;
}

// === Query Helpers ===

export async function getSubTickets(parentTicketId: number): Promise<Ticket[]> {
  return getTickets({ parentTicketId, limit: 100 });
}

export async function getTicketsByClient(clientId: number): Promise<Ticket[]> {
  return getTickets({ clientId, limit: 200 });
}

export async function getTicketsByAssignee(teamMemberId: number): Promise<Ticket[]> {
  return getTickets({ assigneeId: teamMemberId, limit: 200 });
}

// === Assignee Management ===

export async function getTicketAssignees(ticketId: number): Promise<TicketAssignee[]> {
  const { rows } = await sql`
    SELECT ta.*,
      tm.name AS member_name,
      tm.email AS member_email,
      tm.color AS member_color,
      tm.profile_pic_url AS member_profile_pic_url
    FROM ticket_assignees ta
    JOIN team_members tm ON tm.id = ta.team_member_id
    WHERE ta.ticket_id = ${ticketId}
    ORDER BY ta.assigned_at ASC
  `;
  return rows.map(rowToAssignee);
}

export async function addAssignee(
  ticketId: number,
  teamMemberId: number,
  actor?: Actor
): Promise<TicketAssignee | null> {
  const { rows } = await sql`
    INSERT INTO ticket_assignees (ticket_id, team_member_id)
    VALUES (${ticketId}, ${teamMemberId})
    ON CONFLICT (ticket_id, team_member_id) DO NOTHING
    RETURNING *
  `;
  if (rows.length === 0) return null;

  // Re-fetch with joined data
  const { rows: full } = await sql`
    SELECT ta.*,
      tm.name AS member_name,
      tm.email AS member_email,
      tm.color AS member_color,
      tm.profile_pic_url AS member_profile_pic_url
    FROM ticket_assignees ta
    JOIN team_members tm ON tm.id = ta.team_member_id
    WHERE ta.id = ${rows[0].id}
  `;
  const assignee = full.length > 0 ? rowToAssignee(full[0]) : null;

  if (assignee && actor) {
    await logActivity(ticketId, actor.id, actor.name, "assigned", {
      newValue: assignee.memberName || String(teamMemberId),
      metadata: { teamMemberId },
    });
    notifyAssigned(ticketId, teamMemberId, actor.id);
  }

  return assignee;
}

export async function removeAssignee(
  ticketId: number,
  teamMemberId: number,
  actor?: Actor
): Promise<boolean> {
  // Get member name before deleting
  let memberName: string | undefined;
  if (actor) {
    const { rows } = await sql`
      SELECT tm.name FROM team_members tm WHERE tm.id = ${teamMemberId}
    `;
    memberName = rows[0]?.name as string | undefined;
  }

  const { rowCount } = await sql`
    DELETE FROM ticket_assignees
    WHERE ticket_id = ${ticketId} AND team_member_id = ${teamMemberId}
  `;
  const success = (rowCount ?? 0) > 0;

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
  ticketIds: number[],
  status: TicketStatus,
  actor?: Actor
): Promise<number> {
  if (ticketIds.length === 0) return 0;
  const ids = ticketIds.join(",");

  // Fetch current statuses for activity logging
  let oldStatuses: Record<number, string> = {};
  if (actor) {
    const { rows } = await sql`
      SELECT id, status FROM tickets
      WHERE id = ANY(string_to_array(${ids}, ',')::int[])
    `;
    oldStatuses = Object.fromEntries(rows.map(r => [r.id as number, r.status as string]));
  }

  // Handle closed_at transitions
  if (status === "closed") {
    const { rowCount } = await sql`
      UPDATE tickets
      SET status = ${status}, closed_at = NOW(), updated_at = NOW()
      WHERE id = ANY(string_to_array(${ids}, ',')::int[])
    `;

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

    return rowCount ?? 0;
  }

  const { rowCount } = await sql`
    UPDATE tickets
    SET status = ${status}, closed_at = NULL, updated_at = NOW()
    WHERE id = ANY(string_to_array(${ids}, ',')::int[])
  `;

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

  return rowCount ?? 0;
}

export async function bulkUpdatePriority(
  ticketIds: number[],
  priority: TicketPriority,
  actor?: Actor
): Promise<number> {
  if (ticketIds.length === 0) return 0;
  const ids = ticketIds.join(",");

  // Fetch current priorities for activity logging
  let oldPriorities: Record<number, string> = {};
  if (actor) {
    const { rows } = await sql`
      SELECT id, priority FROM tickets
      WHERE id = ANY(string_to_array(${ids}, ',')::int[])
    `;
    oldPriorities = Object.fromEntries(rows.map(r => [r.id as number, r.priority as string]));
  }

  const { rowCount } = await sql`
    UPDATE tickets
    SET priority = ${priority}, updated_at = NOW()
    WHERE id = ANY(string_to_array(${ids}, ',')::int[])
  `;

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

  return rowCount ?? 0;
}

export async function bulkAssign(
  ticketIds: number[],
  teamMemberId: number,
  action: "add" | "remove",
  actor?: Actor
): Promise<number> {
  if (ticketIds.length === 0) return 0;

  // Get member name for activity logging
  let memberName: string | undefined;
  if (actor) {
    const { rows } = await sql`SELECT name FROM team_members WHERE id = ${teamMemberId}`;
    memberName = rows[0]?.name as string | undefined;
  }

  let count = 0;

  for (const ticketId of ticketIds) {
    if (action === "add") {
      const { rowCount } = await sql`
        INSERT INTO ticket_assignees (ticket_id, team_member_id)
        VALUES (${ticketId}, ${teamMemberId})
        ON CONFLICT (ticket_id, team_member_id) DO NOTHING
      `;
      const added = rowCount ?? 0;
      count += added;
      if (added > 0 && actor) {
        await logActivity(ticketId, actor.id, actor.name, "assigned", {
          newValue: memberName || String(teamMemberId),
          metadata: { teamMemberId },
        });
        notifyAssigned(ticketId, teamMemberId, actor.id);
      }
    } else {
      const { rowCount } = await sql`
        DELETE FROM ticket_assignees
        WHERE ticket_id = ${ticketId} AND team_member_id = ${teamMemberId}
      `;
      const removed = rowCount ?? 0;
      count += removed;
      if (removed > 0 && actor) {
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
  items: Array<{ id: number; sortOrder: number }>
): Promise<number> {
  let count = 0;
  for (const item of items) {
    const { rowCount } = await sql`
      UPDATE tickets SET sort_order = ${item.sortOrder}, updated_at = NOW()
      WHERE id = ${item.id}
    `;
    count += rowCount ?? 0;
  }
  return count;
}

// === Search ===

export async function searchTickets(
  query: string,
  limit = 20
): Promise<Ticket[]> {
  const search = `%${query}%`;
  const { rows } = await sql`
    SELECT t.*,
      c.name AS client_name,
      tm.name AS created_by_name,
      (SELECT COUNT(*) FROM tickets sub WHERE sub.parent_ticket_id = t.id AND sub.archived = false) AS sub_ticket_count,
      (SELECT COUNT(*) FROM ticket_comments tc WHERE tc.ticket_id = t.id) AS comment_count
    FROM tickets t
    LEFT JOIN clients c ON c.id = t.client_id
    LEFT JOIN team_members tm ON tm.id = t.created_by_id
    WHERE t.archived = false
      AND (t.title ILIKE ${search} OR t.ticket_number ILIKE ${search})
    ORDER BY t.created_at DESC
    LIMIT ${limit}
  `;
  return rows.map(rowToTicket);
}
