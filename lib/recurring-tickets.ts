import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import {
  RecurringTicketTemplate,
  RecurringTemplateAssignee,
  CreateRecurringTemplateInput,
  RecurrenceRule,
} from "@/types";
import { createTicket, Actor } from "@/lib/tickets";
import { notifyAssigned } from "@/lib/notification-triggers";
import { logActivity } from "@/lib/ticket-activity";

// === Doc Mappers ===

function docToTemplate(doc: any): RecurringTicketTemplate {
  return {
    id: doc._id,
    title: doc.title ?? "",
    description: doc.description ?? "",
    descriptionFormat: doc.descriptionFormat ?? "plain",
    clientId: doc.clientId,
    projectId: doc.projectId ?? null,
    priority: doc.priority ?? "normal",
    ticketGroup: doc.ticketGroup ?? "",
    recurrenceRule: doc.recurrenceRule as RecurrenceRule,
    recurrenceDay: doc.recurrenceDay ?? 0,
    nextCreateAt: doc.nextCreateAt ?? "",
    active: doc.active ?? true,
    createdById: doc.createdById ?? null,
    createdAt: doc._creationTime
      ? new Date(doc._creationTime).toISOString()
      : "",
    updatedAt: doc._creationTime
      ? new Date(doc._creationTime).toISOString()
      : "",
    clientName: doc.clientName ?? undefined,
    projectName: doc.projectName ?? undefined,
    createdByName: doc.createdByName ?? undefined,
  };
}

// === CRUD Functions ===

export async function getRecurringTemplates(filters?: {
  clientId?: number | string;
  active?: boolean;
}): Promise<RecurringTicketTemplate[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.recurringTickets.list, {
    clientId: filters?.clientId ? (filters.clientId as any) : undefined,
    active: filters?.active,
  });
  return docs.map(docToTemplate);
}

export async function getRecurringTemplateById(
  id: number | string
): Promise<RecurringTicketTemplate | null> {
  const convex = getConvexClient();
  const doc = await convex.query(api.recurringTickets.getById, {
    id: id as any,
  });
  if (!doc) return null;
  return docToTemplate(doc);
}

export async function getTemplateAssignees(
  templateId: number | string
): Promise<RecurringTemplateAssignee[]> {
  // Not directly exposed in Convex — would need a dedicated query.
  // Return empty for now.
  return [];
}

export async function createRecurringTemplate(
  data: CreateRecurringTemplateInput,
  createdById: number | string
): Promise<RecurringTicketTemplate> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.recurringTickets.create, {
    title: data.title,
    description: data.description ?? "",
    descriptionFormat: data.descriptionFormat ?? "plain",
    clientId: data.clientId as any,
    projectId: data.projectId ? (data.projectId as any) : undefined,
    priority: data.priority ?? "normal",
    ticketGroup: data.ticketGroup ?? "",
    recurrenceRule: data.recurrenceRule,
    recurrenceDay: data.recurrenceDay,
    nextCreateAt: data.nextCreateAt,
    active: data.active ?? true,
    createdById: createdById as any,
    assigneeIds: data.assigneeIds
      ? data.assigneeIds.map((id) => id as any)
      : undefined,
  });
  return docToTemplate(doc);
}

export async function updateRecurringTemplate(
  id: number | string,
  data: Partial<CreateRecurringTemplateInput & { active: boolean }>
): Promise<RecurringTicketTemplate | null> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.recurringTickets.update, {
    id: id as any,
    title: data.title,
    description: data.description,
    descriptionFormat: data.descriptionFormat,
    clientId: data.clientId ? (data.clientId as any) : undefined,
    projectId: data.projectId ? (data.projectId as any) : undefined,
    priority: data.priority,
    ticketGroup: data.ticketGroup,
    recurrenceRule: data.recurrenceRule,
    recurrenceDay: data.recurrenceDay,
    nextCreateAt: data.nextCreateAt,
    active: data.active,
    assigneeIds: data.assigneeIds
      ? data.assigneeIds.map((id) => id as any)
      : undefined,
  });
  if (!doc) return null;
  return docToTemplate(doc);
}

export async function deleteRecurringTemplate(id: number | string): Promise<boolean> {
  const convex = getConvexClient();
  try {
    await convex.mutation(api.recurringTickets.remove, { id: id as any });
    return true;
  } catch {
    return false;
  }
}

export async function updateTemplateAssignees(
  templateId: number | string,
  assigneeIds: (number | string)[]
): Promise<void> {
  const convex = getConvexClient();
  // Use the update mutation which handles assignee replacement
  await convex.mutation(api.recurringTickets.update, {
    id: templateId as any,
    assigneeIds: assigneeIds.map((id) => id as any),
  });
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
  const convex = getConvexClient();

  // Find all active templates due today or earlier
  const allTemplates = await convex.query(api.recurringTickets.list, {
    active: true,
  });

  const today = new Date().toISOString().split("T")[0];
  const dueTemplates = allTemplates.filter(
    (t: any) => t.nextCreateAt && t.nextCreateAt <= today
  );

  for (const raw of dueTemplates) {
    const template = docToTemplate(raw);
    results.processed++;

    try {
      const assigneeIds: string[] = []; // Would need to fetch from junction table

      const actor: Actor = {
        id: (template.createdById as any) ?? "",
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
        template.createdById ?? "",
        actor
      );

      await logActivity(ticket.id, template.createdById ?? "", "System (Recurring)", "comment", {
        metadata: {
          source: "recurring",
          templateId: template.id,
          message: `Auto-created from recurring template "${template.title}"`,
        },
      });

      for (const memberId of assigneeIds) {
        await notifyAssigned(ticket.id, memberId, null);
      }

      const nextDate = calculateNextCreateAt(
        template.nextCreateAt,
        template.recurrenceRule
      );

      await convex.mutation(api.recurringTickets.update, {
        id: template.id as any,
        nextCreateAt: nextDate,
      });

      results.created++;
      console.log(
        `[recurring] Created ticket ${ticket.ticketNumber} from template "${template.title}"`
      );
    } catch (err) {
      const msg = `Template "${template.title}": ${String(err)}`;
      console.error(`[recurring] Error:`, msg);
      results.errors.push(msg);
    }
  }

  return results;
}
