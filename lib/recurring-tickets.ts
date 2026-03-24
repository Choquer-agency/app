import { sql } from "@vercel/postgres";
import {
  RecurringTicketTemplate,
  RecurringTemplateAssignee,
  CreateRecurringTemplateInput,
  RecurrenceRule,
} from "@/types";
import { createTicket, Actor } from "@/lib/tickets";
import { notifyAssigned } from "@/lib/notification-triggers";
import { logActivity } from "@/lib/ticket-activity";

// === Row Mappers ===

function rowToTemplate(row: Record<string, unknown>): RecurringTicketTemplate {
  return {
    id: row.id as number,
    title: row.title as string,
    description: (row.description as string) || "",
    descriptionFormat: (row.description_format as "plain" | "tiptap") || "plain",
    clientId: row.client_id as number,
    projectId: (row.project_id as number) ?? null,
    priority: (row.priority as RecurringTicketTemplate["priority"]) || "normal",
    ticketGroup: (row.ticket_group as string) || "",
    recurrenceRule: row.recurrence_rule as RecurrenceRule,
    recurrenceDay: row.recurrence_day as number,
    nextCreateAt: row.next_create_at
      ? (row.next_create_at as Date).toISOString().split("T")[0]
      : "",
    active: (row.active as boolean) ?? true,
    createdById: (row.created_by_id as number) ?? null,
    createdAt: (row.created_at as Date)?.toISOString(),
    updatedAt: (row.updated_at as Date)?.toISOString(),
    clientName: (row.client_name as string) || undefined,
    projectName: (row.project_name as string) || undefined,
    createdByName: (row.created_by_name as string) || undefined,
  };
}

function rowToAssignee(row: Record<string, unknown>): RecurringTemplateAssignee {
  return {
    id: row.id as number,
    templateId: row.template_id as number,
    teamMemberId: row.team_member_id as number,
    memberName: (row.name as string) || undefined,
    memberEmail: (row.email as string) || undefined,
    memberColor: (row.color as string) || undefined,
    memberProfilePicUrl: (row.profile_pic_url as string) || undefined,
  };
}

// === CRUD Functions ===

export async function getRecurringTemplates(filters?: {
  clientId?: number;
  active?: boolean;
}): Promise<RecurringTicketTemplate[]> {
  let query = `
    SELECT rt.*, c.name AS client_name, p.name AS project_name, tm.name AS created_by_name
    FROM recurring_ticket_templates rt
    LEFT JOIN clients c ON c.id = rt.client_id
    LEFT JOIN projects p ON p.id = rt.project_id
    LEFT JOIN team_members tm ON tm.id = rt.created_by_id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (filters?.clientId) {
    params.push(filters.clientId);
    query += ` AND rt.client_id = $${params.length}`;
  }
  if (filters?.active !== undefined) {
    params.push(filters.active);
    query += ` AND rt.active = $${params.length}`;
  }

  query += ` ORDER BY rt.next_create_at ASC`;

  const { rows } = await sql.query(query, params);
  const templates = rows.map(rowToTemplate);

  // Fetch assignees for all templates
  for (const template of templates) {
    template.assignees = await getTemplateAssignees(template.id);
  }

  return templates;
}

export async function getRecurringTemplateById(
  id: number
): Promise<RecurringTicketTemplate | null> {
  const { rows } = await sql`
    SELECT rt.*, c.name AS client_name, p.name AS project_name, tm.name AS created_by_name
    FROM recurring_ticket_templates rt
    LEFT JOIN clients c ON c.id = rt.client_id
    LEFT JOIN projects p ON p.id = rt.project_id
    LEFT JOIN team_members tm ON tm.id = rt.created_by_id
    WHERE rt.id = ${id}
  `;
  if (rows.length === 0) return null;

  const template = rowToTemplate(rows[0]);
  template.assignees = await getTemplateAssignees(id);
  return template;
}

export async function getTemplateAssignees(
  templateId: number
): Promise<RecurringTemplateAssignee[]> {
  const { rows } = await sql`
    SELECT rta.*, tm.name, tm.email, tm.color, tm.profile_pic_url
    FROM recurring_template_assignees rta
    JOIN team_members tm ON tm.id = rta.team_member_id
    WHERE rta.template_id = ${templateId}
    ORDER BY tm.name ASC
  `;
  return rows.map(rowToAssignee);
}

export async function createRecurringTemplate(
  data: CreateRecurringTemplateInput,
  createdById: number
): Promise<RecurringTicketTemplate> {
  const { rows } = await sql`
    INSERT INTO recurring_ticket_templates (
      title, description, description_format,
      client_id, project_id, priority, ticket_group,
      recurrence_rule, recurrence_day, next_create_at,
      active, created_by_id
    )
    VALUES (
      ${data.title},
      ${data.description || ""},
      ${data.descriptionFormat || "plain"},
      ${data.clientId},
      ${data.projectId ?? null},
      ${data.priority || "normal"},
      ${data.ticketGroup || ""},
      ${data.recurrenceRule},
      ${data.recurrenceDay},
      ${data.nextCreateAt},
      ${data.active ?? true},
      ${createdById}
    )
    RETURNING *
  `;

  const templateId = rows[0].id as number;

  // Add assignees
  if (data.assigneeIds && data.assigneeIds.length > 0) {
    for (const memberId of data.assigneeIds) {
      await sql`
        INSERT INTO recurring_template_assignees (template_id, team_member_id)
        VALUES (${templateId}, ${memberId})
        ON CONFLICT (template_id, team_member_id) DO NOTHING
      `;
    }
  }

  return (await getRecurringTemplateById(templateId))!;
}

export async function updateRecurringTemplate(
  id: number,
  data: Partial<CreateRecurringTemplateInput & { active: boolean }>
): Promise<RecurringTicketTemplate | null> {
  const current = await getRecurringTemplateById(id);
  if (!current) return null;

  const title = data.title ?? current.title;
  const description = data.description ?? current.description;
  const descriptionFormat = data.descriptionFormat ?? current.descriptionFormat;
  const clientId = data.clientId ?? current.clientId;
  const projectId = data.projectId !== undefined ? data.projectId : current.projectId;
  const priority = data.priority ?? current.priority;
  const ticketGroup = data.ticketGroup ?? current.ticketGroup;
  const recurrenceRule = data.recurrenceRule ?? current.recurrenceRule;
  const recurrenceDay = data.recurrenceDay ?? current.recurrenceDay;
  const nextCreateAt = data.nextCreateAt ?? current.nextCreateAt;
  const active = data.active !== undefined ? data.active : current.active;

  await sql`
    UPDATE recurring_ticket_templates SET
      title = ${title},
      description = ${description},
      description_format = ${descriptionFormat},
      client_id = ${clientId},
      project_id = ${projectId ?? null},
      priority = ${priority},
      ticket_group = ${ticketGroup},
      recurrence_rule = ${recurrenceRule},
      recurrence_day = ${recurrenceDay},
      next_create_at = ${nextCreateAt},
      active = ${active},
      updated_at = NOW()
    WHERE id = ${id}
  `;

  // Update assignees if provided
  if (data.assigneeIds !== undefined) {
    await updateTemplateAssignees(id, data.assigneeIds ?? []);
  }

  return getRecurringTemplateById(id);
}

export async function deleteRecurringTemplate(id: number): Promise<boolean> {
  const { rowCount } = await sql`
    DELETE FROM recurring_ticket_templates WHERE id = ${id}
  `;
  return (rowCount ?? 0) > 0;
}

export async function updateTemplateAssignees(
  templateId: number,
  assigneeIds: number[]
): Promise<void> {
  // Clear existing
  await sql`DELETE FROM recurring_template_assignees WHERE template_id = ${templateId}`;

  // Insert new
  for (const memberId of assigneeIds) {
    await sql`
      INSERT INTO recurring_template_assignees (template_id, team_member_id)
      VALUES (${templateId}, ${memberId})
      ON CONFLICT (template_id, team_member_id) DO NOTHING
    `;
  }
}

// === Date Calculation ===

function advanceOnce(dateStr: string, rule: RecurrenceRule): string {
  const date = new Date(dateStr + "T00:00:00Z");

  switch (rule) {
    case "weekly":
      date.setUTCDate(date.getUTCDate() + 7);
      break;
    case "biweekly":
      date.setUTCDate(date.getUTCDate() + 14);
      break;
    case "monthly": {
      const day = date.getUTCDate();
      date.setUTCMonth(date.getUTCMonth() + 1);
      // Cap at 28 to avoid month-length overflow
      const maxDay = Math.min(day, 28);
      date.setUTCDate(maxDay);
      break;
    }
    case "quarterly": {
      const qDay = date.getUTCDate();
      date.setUTCMonth(date.getUTCMonth() + 3);
      const maxQDay = Math.min(qDay, 28);
      date.setUTCDate(maxQDay);
      break;
    }
  }

  return date.toISOString().split("T")[0];
}

export function calculateNextCreateAt(
  currentDate: string,
  rule: RecurrenceRule
): string {
  const today = new Date().toISOString().split("T")[0];
  let next = advanceOnce(currentDate, rule);

  // If cron missed days, keep advancing until next is in the future
  while (next <= today) {
    next = advanceOnce(next, rule);
  }

  return next;
}

// === Core Processing ===

export async function processRecurringTickets(): Promise<{
  processed: number;
  created: number;
  errors: string[];
}> {
  const results = { processed: 0, created: 0, errors: [] as string[] };

  // Find all active templates due today or earlier
  const { rows } = await sql`
    SELECT * FROM recurring_ticket_templates
    WHERE active = true AND next_create_at <= CURRENT_DATE
  `;

  for (const row of rows) {
    const template = rowToTemplate(row);
    results.processed++;

    try {
      // Fetch assignees for this template
      const assignees = await getTemplateAssignees(template.id);
      const assigneeIds = assignees.map((a) => a.teamMemberId);

      // Create the ticket
      const actor: Actor = {
        id: template.createdById ?? 0,
        name: "System (Recurring)",
      };

      const ticket = await createTicket(
        {
          title: template.title,
          description: template.description,
          descriptionFormat: template.descriptionFormat,
          clientId: template.clientId,
          projectId: template.projectId,
          status: "needs_attention",
          priority: template.priority,
          ticketGroup: template.ticketGroup,
          assigneeIds,
        },
        template.createdById ?? 0,
        actor
      );

      // Log that this was auto-created from a recurring template
      await logActivity(ticket.id, template.createdById ?? 0, "System (Recurring)", "comment", {
        metadata: {
          source: "recurring",
          templateId: template.id,
          message: `Auto-created from recurring template "${template.title}"`,
        },
      });

      // Notify assignees
      for (const memberId of assigneeIds) {
        await notifyAssigned(ticket.id, memberId, null);
      }

      // Advance next_create_at
      const nextDate = calculateNextCreateAt(
        template.nextCreateAt,
        template.recurrenceRule
      );

      await sql`
        UPDATE recurring_ticket_templates
        SET next_create_at = ${nextDate}, updated_at = NOW()
        WHERE id = ${template.id}
      `;

      results.created++;
      console.log(
        `[recurring] Created ticket ${ticket.ticketNumber} from template #${template.id} "${template.title}"`
      );
    } catch (err) {
      const msg = `Template #${template.id} "${template.title}": ${String(err)}`;
      console.error(`[recurring] Error:`, msg);
      results.errors.push(msg);
    }
  }

  return results;
}
