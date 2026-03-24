import { sql, db } from "@vercel/postgres";
import { Project, CreateProjectInput, ProjectStatus, TicketDependency, ProjectMember, DateCascadePreview } from "@/types";
import { generateTicketNumber } from "@/lib/tickets";

// === Row Mappers ===

function rowToProject(row: Record<string, unknown>): Project {
  return {
    id: row.id as number,
    name: row.name as string,
    description: (row.description as string) || "",
    clientId: (row.client_id as number) ?? null,
    isTemplate: (row.is_template as boolean) || false,
    status: (row.status as ProjectStatus) || "active",
    archived: (row.archived as boolean) || false,
    startDate: row.start_date
      ? (row.start_date as Date).toISOString().split("T")[0]
      : null,
    dueDate: row.due_date
      ? (row.due_date as Date).toISOString().split("T")[0]
      : null,
    createdById: (row.created_by_id as number) ?? null,
    createdAt: (row.created_at as Date)?.toISOString(),
    updatedAt: (row.updated_at as Date)?.toISOString(),
    // Joined fields
    clientName: (row.client_name as string) || undefined,
    ticketCount: row.ticket_count !== undefined ? Number(row.ticket_count) : undefined,
    completedTicketCount: row.completed_ticket_count !== undefined ? Number(row.completed_ticket_count) : undefined,
  };
}

// === CRUD Operations ===

export async function getProjects(filters: {
  clientId?: number;
  isTemplate?: boolean;
  archived?: boolean;
  search?: string;
} = {}): Promise<Project[]> {
  const clientId = filters.clientId ?? null;
  const isTemplate = filters.isTemplate ?? null;
  const archived = filters.archived ?? false;
  const search = filters.search ? `%${filters.search}%` : null;

  const { rows } = await sql`
    SELECT p.*,
      c.name AS client_name,
      (SELECT COUNT(*) FROM tickets t WHERE t.project_id = p.id AND t.archived = false AND t.is_personal = false) AS ticket_count,
      (SELECT COUNT(*) FROM tickets t WHERE t.project_id = p.id AND t.archived = false AND t.is_personal = false AND t.status = 'closed') AS completed_ticket_count
    FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id
    WHERE p.archived = ${archived}
      AND (${clientId}::int IS NULL OR p.client_id = ${clientId})
      AND (${isTemplate}::boolean IS NULL OR p.is_template = ${isTemplate})
      AND (${search}::text IS NULL OR p.name ILIKE ${search})
    ORDER BY p.is_template DESC, p.updated_at DESC
  `;
  return rows.map(rowToProject);
}

export async function getProjectById(id: number): Promise<Project | null> {
  const { rows } = await sql`
    SELECT p.*,
      c.name AS client_name,
      (SELECT COUNT(*) FROM tickets t WHERE t.project_id = p.id AND t.archived = false AND t.is_personal = false) AS ticket_count,
      (SELECT COUNT(*) FROM tickets t WHERE t.project_id = p.id AND t.archived = false AND t.is_personal = false AND t.status = 'closed') AS completed_ticket_count
    FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id
    WHERE p.id = ${id}
  `;
  if (rows.length === 0) return null;
  return rowToProject(rows[0]);
}

export async function createProject(
  data: CreateProjectInput,
  createdById: number
): Promise<Project> {
  const { rows } = await sql`
    INSERT INTO projects (name, description, client_id, is_template, status, start_date, due_date, created_by_id)
    VALUES (
      ${data.name},
      ${data.description || ""},
      ${data.clientId ?? null},
      ${data.isTemplate ?? false},
      ${data.status || "active"},
      ${data.startDate ?? null},
      ${data.dueDate ?? null},
      ${createdById}
    )
    RETURNING *
  `;
  return (await getProjectById(rows[0].id as number))!;
}

export async function updateProject(
  id: number,
  data: Partial<CreateProjectInput & { status: ProjectStatus; archived: boolean }>
): Promise<Project | null> {
  const current = await getProjectById(id);
  if (!current) return null;

  const name = data.name ?? current.name;
  const description = data.description ?? current.description;
  const clientId = data.clientId !== undefined ? data.clientId : current.clientId;
  const isTemplate = data.isTemplate ?? current.isTemplate;
  const status = data.status ?? current.status;
  const archived = data.archived ?? current.archived;
  const startDate = data.startDate !== undefined ? data.startDate : current.startDate;
  const dueDate = data.dueDate !== undefined ? data.dueDate : current.dueDate;

  await sql`
    UPDATE projects SET
      name = ${name},
      description = ${description},
      client_id = ${clientId},
      is_template = ${isTemplate},
      status = ${status},
      archived = ${archived},
      start_date = ${startDate},
      due_date = ${dueDate},
      updated_at = NOW()
    WHERE id = ${id}
  `;

  return getProjectById(id);
}

export async function archiveProject(id: number): Promise<boolean> {
  const { rowCount } = await sql`
    UPDATE projects SET archived = true, updated_at = NOW() WHERE id = ${id}
  `;
  return (rowCount ?? 0) > 0;
}

export async function deleteProject(id: number): Promise<boolean> {
  // Delete all related data for tickets in this project
  await sql`DELETE FROM ticket_dependencies WHERE ticket_id IN (SELECT id FROM tickets WHERE project_id = ${id})`;
  await sql`DELETE FROM ticket_dependencies WHERE depends_on_ticket_id IN (SELECT id FROM tickets WHERE project_id = ${id})`;
  await sql`DELETE FROM ticket_assignees WHERE ticket_id IN (SELECT id FROM tickets WHERE project_id = ${id})`;
  await sql`DELETE FROM ticket_template_role_assignments WHERE ticket_id IN (SELECT id FROM tickets WHERE project_id = ${id})`;
  // Delete all tickets (subtasks have ON DELETE CASCADE via parent_ticket_id FK, but let's be explicit)
  await sql`DELETE FROM tickets WHERE project_id = ${id}`;
  // Delete project groups and roles
  await sql`DELETE FROM project_groups WHERE project_id = ${id}`;
  await sql`DELETE FROM project_template_roles WHERE project_id = ${id}`;
  // Delete the project
  const { rowCount } = await sql`DELETE FROM projects WHERE id = ${id}`;
  return (rowCount ?? 0) > 0;
}

// === Dependencies ===

export async function getTicketDependencies(ticketId: number): Promise<TicketDependency[]> {
  const { rows } = await sql`
    SELECT td.*,
      t.ticket_number AS depends_on_ticket_number,
      t.title AS depends_on_ticket_title,
      t.status AS depends_on_ticket_status
    FROM ticket_dependencies td
    JOIN tickets t ON t.id = td.depends_on_ticket_id
    WHERE td.ticket_id = ${ticketId}
  `;
  return rows.map((r) => ({
    id: r.id as number,
    ticketId: r.ticket_id as number,
    dependsOnTicketId: r.depends_on_ticket_id as number,
    dependsOnTicketNumber: r.depends_on_ticket_number as string,
    dependsOnTicketTitle: r.depends_on_ticket_title as string,
    dependsOnTicketStatus: r.depends_on_ticket_status as string,
  })) as TicketDependency[];
}

export async function getProjectDependencies(projectId: number): Promise<TicketDependency[]> {
  const { rows } = await sql`
    SELECT td.*,
      t2.ticket_number AS depends_on_ticket_number,
      t2.title AS depends_on_ticket_title,
      t2.status AS depends_on_ticket_status
    FROM ticket_dependencies td
    JOIN tickets t1 ON t1.id = td.ticket_id
    JOIN tickets t2 ON t2.id = td.depends_on_ticket_id
    WHERE t1.project_id = ${projectId} AND t1.archived = false
  `;
  return rows.map((r) => ({
    id: r.id as number,
    ticketId: r.ticket_id as number,
    dependsOnTicketId: r.depends_on_ticket_id as number,
    dependsOnTicketNumber: r.depends_on_ticket_number as string,
    dependsOnTicketTitle: r.depends_on_ticket_title as string,
    dependsOnTicketStatus: r.depends_on_ticket_status as string,
  })) as TicketDependency[];
}

export async function addTicketDependency(ticketId: number, dependsOnTicketId: number): Promise<void> {
  await sql`
    INSERT INTO ticket_dependencies (ticket_id, depends_on_ticket_id)
    VALUES (${ticketId}, ${dependsOnTicketId})
    ON CONFLICT (ticket_id, depends_on_ticket_id) DO NOTHING
  `;
}

export async function removeTicketDependency(ticketId: number, dependsOnTicketId: number): Promise<void> {
  await sql`
    DELETE FROM ticket_dependencies
    WHERE ticket_id = ${ticketId} AND depends_on_ticket_id = ${dependsOnTicketId}
  `;
}

// === Template Duplication ===

export async function duplicateProject(
  templateId: number,
  clientId: number,
  name: string,
  startDate: string,
  roleAssignments?: Record<number, number> // templateRoleId → teamMemberId
): Promise<Project> {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    // 1. Fetch template project
    const templateResult = await client.query(
      "SELECT * FROM projects WHERE id = $1 AND is_template = true",
      [templateId]
    );
    if (templateResult.rows.length === 0) {
      throw new Error("Template not found");
    }
    const template = templateResult.rows[0];

    // 2. Create new project
    const newProjectResult = await client.query(
      `INSERT INTO projects (name, description, client_id, is_template, status, start_date, due_date, created_by_id)
       VALUES ($1, $2, $3, false, 'active', $4, $5, $6)
       RETURNING id`,
      [
        name,
        template.description,
        clientId,
        startDate,
        template.due_date
          ? adjustForWeekend(addDaysToDate(startDate, daysBetween(template.start_date, template.due_date)))
          : null,
        template.created_by_id,
      ]
    );
    const newProjectId = newProjectResult.rows[0].id;

    // 3. Clone groups → build groupIdMap
    const groupsResult = await client.query(
      "SELECT * FROM project_groups WHERE project_id = $1 ORDER BY sort_order ASC",
      [templateId]
    );
    const groupIdMap = new Map<number, number>();
    for (const group of groupsResult.rows) {
      const newGroup = await client.query(
        `INSERT INTO project_groups (project_id, name, color, sort_order)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [newProjectId, group.name, group.color, group.sort_order]
      );
      groupIdMap.set(group.id, newGroup.rows[0].id);
    }

    // 4. Fetch all template tickets (non-archived, non-personal, top-level first)
    const ticketsResult = await client.query(
      `SELECT * FROM tickets
       WHERE project_id = $1 AND archived = false AND is_personal = false
       ORDER BY parent_ticket_id NULLS FIRST, sort_order ASC`,
      [templateId]
    );

    // 5. Clone each ticket with weekend-aware dates
    const idMap = new Map<number, number>();
    // Track which template_role_id each new ticket came from
    const ticketRoleMap = new Map<number, number | null>();
    const allTeamTickets = new Set<number>(); // tickets with assign_all_roles

    for (const ticket of ticketsResult.rows) {
      const seqResult = await client.query("SELECT nextval('ticket_number_seq') AS num");
      const ticketNumber = `CHQ-${String(seqResult.rows[0].num).padStart(3, "0")}`;

      // Calculate dates from offsets with weekend adjustment
      const newStartDate = ticket.day_offset_start != null
        ? adjustForWeekend(addDaysToDate(startDate, ticket.day_offset_start))
        : null;
      const newDueDate = ticket.day_offset_due != null
        ? adjustForWeekend(addDaysToDate(startDate, ticket.day_offset_due))
        : null;

      // Remap parent_ticket_id if it's a sub-ticket
      const newParentId = ticket.parent_ticket_id
        ? idMap.get(ticket.parent_ticket_id) ?? null
        : null;

      // Remap group_id
      const newGroupId = ticket.group_id
        ? groupIdMap.get(ticket.group_id) ?? null
        : null;

      const insertResult = await client.query(
        `INSERT INTO tickets (
          ticket_number, title, description, description_format,
          client_id, project_id, parent_ticket_id, status, priority,
          ticket_group, group_id, start_date, due_date, due_time,
          sort_order, created_by_id, is_personal, is_meeting, day_offset_start, day_offset_due
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        RETURNING id`,
        [
          ticketNumber,
          ticket.title,
          ticket.description || "",
          ticket.description_format || "plain",
          clientId,
          newProjectId,
          newParentId,
          "needs_attention",
          ticket.priority || "normal",
          ticket.ticket_group || "",
          newGroupId,
          newStartDate,
          newDueDate,
          ticket.due_time,
          ticket.sort_order || 0,
          ticket.created_by_id,
          false,
          ticket.is_meeting || false,
          ticket.day_offset_start,
          ticket.day_offset_due,
        ]
      );

      const newTicketId = insertResult.rows[0].id;
      idMap.set(ticket.id, newTicketId);
      if (ticket.assign_all_roles) {
        allTeamTickets.add(newTicketId);
      }
    }

    // 6. Auto-assign based on role mapping using junction table
    if (roleAssignments && Object.keys(roleAssignments).length > 0) {
      const allAssignedMembers = [...new Set(Object.values(roleAssignments).filter(Boolean))];

      // Assign "All Team" tickets to every role-assigned member
      for (const ticketId of allTeamTickets) {
        for (const memberId of allAssignedMembers) {
          await client.query(
            `INSERT INTO ticket_assignees (ticket_id, team_member_id)
             VALUES ($1, $2)
             ON CONFLICT (ticket_id, team_member_id) DO NOTHING`,
            [ticketId, memberId]
          );
        }
      }

      // Look up role assignments from the junction table for each original ticket
      const roleAssignmentsResult = await client.query(
        `SELECT ticket_id, template_role_id FROM ticket_template_role_assignments
         WHERE ticket_id IN (SELECT id FROM tickets WHERE project_id = $1)`,
        [templateId]
      );

      // Build map: originalTicketId → [roleIds]
      const ticketRolesMap = new Map<number, number[]>();
      for (const row of roleAssignmentsResult.rows) {
        if (!ticketRolesMap.has(row.ticket_id)) ticketRolesMap.set(row.ticket_id, []);
        ticketRolesMap.get(row.ticket_id)!.push(row.template_role_id);
      }

      // For each cloned ticket, assign members based on their roles
      for (const [origId, newId] of idMap.entries()) {
        const roleIds = ticketRolesMap.get(origId) || [];
        for (const roleId of roleIds) {
          const memberId = roleAssignments[roleId];
          if (memberId) {
            await client.query(
              `INSERT INTO ticket_assignees (ticket_id, team_member_id)
               VALUES ($1, $2)
               ON CONFLICT (ticket_id, team_member_id) DO NOTHING`,
              [newId, memberId]
            );
          }
        }
      }
    } else {
      // Fallback: clone existing assignees from template
      const assigneesResult = await client.query(
        `SELECT ta.* FROM ticket_assignees ta
         JOIN tickets t ON t.id = ta.ticket_id
         WHERE t.project_id = $1`,
        [templateId]
      );
      for (const assignee of assigneesResult.rows) {
        const newTicketId = idMap.get(assignee.ticket_id);
        if (newTicketId) {
          await client.query(
            `INSERT INTO ticket_assignees (ticket_id, team_member_id)
             VALUES ($1, $2)
             ON CONFLICT (ticket_id, team_member_id) DO NOTHING`,
            [newTicketId, assignee.team_member_id]
          );
        }
      }
    }

    // 7. Clone dependencies
    const depsResult = await client.query(
      `SELECT td.* FROM ticket_dependencies td
       JOIN tickets t ON t.id = td.ticket_id
       WHERE t.project_id = $1`,
      [templateId]
    );
    for (const dep of depsResult.rows) {
      const newTicketId = idMap.get(dep.ticket_id);
      const newDependsOnId = idMap.get(dep.depends_on_ticket_id);
      if (newTicketId && newDependsOnId) {
        await client.query(
          `INSERT INTO ticket_dependencies (ticket_id, depends_on_ticket_id)
           VALUES ($1, $2)
           ON CONFLICT (ticket_id, depends_on_ticket_id) DO NOTHING`,
          [newTicketId, newDependsOnId]
        );
      }
    }

    await client.query("COMMIT");

    return (await getProjectById(newProjectId))!;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// === Date Cascading ===

export async function previewDateCascade(
  projectId: number,
  ticketId: number,
  newDate: string,
  field: "startDate" | "dueDate"
): Promise<DateCascadePreview[]> {
  const dbField = field === "startDate" ? "start_date" : "due_date";

  // Get the ticket being changed
  const { rows: ticketRows } = await sql`
    SELECT id, start_date, due_date FROM tickets WHERE id = ${ticketId}
  `;
  if (ticketRows.length === 0) return [];

  const oldDate = ticketRows[0][dbField];
  if (!oldDate) return [];

  const oldDateStr = (oldDate as Date).toISOString().split("T")[0];
  const delta = daysBetween(oldDateStr, newDate);
  if (delta === 0) return [];

  // Find all tickets in this project with dates after the changed ticket's old date
  const { rows } = await sql`
    SELECT id, ticket_number, title, start_date, due_date
    FROM tickets
    WHERE project_id = ${projectId}
      AND id != ${ticketId}
      AND archived = false
      AND (
        (start_date IS NOT NULL AND start_date >= ${oldDateStr}::date)
        OR (due_date IS NOT NULL AND due_date >= ${oldDateStr}::date)
      )
    ORDER BY COALESCE(start_date, due_date) ASC
  `;

  const previews: DateCascadePreview[] = [];

  for (const row of rows) {
    if (row.start_date) {
      const oldStart = (row.start_date as Date).toISOString().split("T")[0];
      if (oldStart >= oldDateStr) {
        const shifted = addDaysToDate(oldStart, delta);
        const adjusted = adjustForWeekend(shifted);
        previews.push({
          ticketId: row.id as number,
          ticketNumber: row.ticket_number as string,
          ticketTitle: row.title as string,
          field: "startDate",
          oldDate: oldStart,
          newDate: adjusted,
          weekendAdjusted: adjusted !== shifted,
        });
      }
    }
    if (row.due_date) {
      const oldDue = (row.due_date as Date).toISOString().split("T")[0];
      if (oldDue >= oldDateStr) {
        const shifted = addDaysToDate(oldDue, delta);
        const adjusted = adjustForWeekend(shifted);
        previews.push({
          ticketId: row.id as number,
          ticketNumber: row.ticket_number as string,
          ticketTitle: row.title as string,
          field: "dueDate",
          oldDate: oldDue,
          newDate: adjusted,
          weekendAdjusted: adjusted !== shifted,
        });
      }
    }
  }

  return previews;
}

export async function applyDateCascade(
  previews: DateCascadePreview[]
): Promise<void> {
  for (const p of previews) {
    const dbField = p.field === "startDate" ? "start_date" : "due_date";
    await sql.query(
      `UPDATE tickets SET ${dbField} = $1, updated_at = NOW() WHERE id = $2`,
      [p.newDate, p.ticketId]
    );
  }
}

// === Project Members ===

export async function getProjectMembers(projectId: number): Promise<ProjectMember[]> {
  const { rows } = await sql`
    SELECT pm.*, tm.name AS member_name, tm.email AS member_email,
      tm.color AS member_color, tm.profile_pic_url AS member_profile_pic_url
    FROM project_members pm
    JOIN team_members tm ON tm.id = pm.team_member_id
    WHERE pm.project_id = ${projectId}
    ORDER BY pm.added_at ASC
  `;
  return rows.map((r) => ({
    id: r.id as number,
    projectId: r.project_id as number,
    teamMemberId: r.team_member_id as number,
    addedAt: (r.added_at as Date)?.toISOString(),
    memberName: r.member_name as string,
    memberEmail: r.member_email as string,
    memberColor: (r.member_color as string) || undefined,
    memberProfilePicUrl: (r.member_profile_pic_url as string) || undefined,
  }));
}

export async function addProjectMember(projectId: number, teamMemberId: number): Promise<void> {
  await sql`
    INSERT INTO project_members (project_id, team_member_id)
    VALUES (${projectId}, ${teamMemberId})
    ON CONFLICT (project_id, team_member_id) DO NOTHING
  `;
}

export async function removeProjectMember(projectId: number, teamMemberId: number): Promise<void> {
  await sql`
    DELETE FROM project_members
    WHERE project_id = ${projectId} AND team_member_id = ${teamMemberId}
  `;
}

/**
 * Get projects for sub-nav: active projects the user is a member of.
 * Admins see all active projects.
 */
export async function getMyProjects(
  teamMemberId: number,
  isAdmin: boolean
): Promise<Project[]> {
  if (isAdmin) {
    const { rows } = await sql`
      SELECT p.*, c.name AS client_name,
        (SELECT COUNT(*) FROM tickets t WHERE t.project_id = p.id AND t.archived = false) AS ticket_count,
        (SELECT COUNT(*) FROM tickets t WHERE t.project_id = p.id AND t.archived = false AND t.status = 'closed') AS completed_ticket_count
      FROM projects p
      LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.archived = false AND p.is_template = false
      ORDER BY p.status ASC, p.name ASC
    `;
    return rows.map(rowToProject);
  }

  const { rows } = await sql`
    SELECT p.*, c.name AS client_name,
      (SELECT COUNT(*) FROM tickets t WHERE t.project_id = p.id AND t.archived = false) AS ticket_count,
      (SELECT COUNT(*) FROM tickets t WHERE t.project_id = p.id AND t.archived = false AND t.status = 'closed') AS completed_ticket_count
    FROM projects p
    JOIN project_members pm ON pm.project_id = p.id AND pm.team_member_id = ${teamMemberId}
    LEFT JOIN clients c ON c.id = p.client_id
    WHERE p.archived = false AND p.is_template = false
    ORDER BY p.status ASC, p.name ASC
  `;
  return rows.map(rowToProject);
}

// === Date Helpers ===

function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/** If date falls on Saturday or Sunday, push to Monday */
function adjustForWeekend(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00"); // noon to avoid TZ issues
  const day = d.getDay();
  if (day === 6) {
    // Saturday → Monday
    d.setDate(d.getDate() + 2);
  } else if (day === 0) {
    // Sunday → Monday
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().split("T")[0];
}

function daysBetween(from: Date | string | null, to: Date | string | null): number {
  if (!from || !to) return 0;
  const a = new Date(from);
  const b = new Date(to);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
