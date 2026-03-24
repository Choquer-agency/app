import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import { TicketActivity } from "@/types";

// === Doc Mapper ===

function docToActivity(doc: any): TicketActivity {
  return {
    id: doc._id,
    ticketId: doc.ticketId,
    actorId: doc.actorId ?? null,
    actorName: doc.actorName ?? "",
    actionType: doc.actionType ?? "",
    fieldName: doc.fieldName ?? null,
    oldValue: doc.oldValue ?? null,
    newValue: doc.newValue ?? null,
    metadata: doc.metadata ?? {},
    createdAt: doc._creationTime
      ? new Date(doc._creationTime).toISOString()
      : "",
  };
}

// === Log Activity ===

export async function logActivity(
  ticketId: number | string,
  actorId: number | string | null,
  actorName: string,
  actionType: string,
  options: {
    fieldName?: string;
    oldValue?: string | null;
    newValue?: string | null;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<TicketActivity> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.ticketActivity.create, {
    ticketId: ticketId as any,
    actorId: actorId ? (actorId as any) : undefined,
    actorName,
    actionType,
    fieldName: options.fieldName,
    oldValue: options.oldValue ?? undefined,
    newValue: options.newValue ?? undefined,
    metadata: options.metadata ?? {},
  });
  return docToActivity(doc);
}

// === Query Activity ===

export async function getTicketActivity(
  ticketId: number | string,
  limit = 50,
  offset = 0
): Promise<TicketActivity[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.ticketActivity.listByTicket, {
    ticketId: ticketId as any,
    limit,
  });
  // Convex doesn't support offset natively, apply in JS
  const sliced = offset > 0 ? docs.slice(offset) : docs;
  // listByTicket returns desc, but original returned ASC — reverse
  return sliced.reverse().map(docToActivity);
}

export async function getRecentActivity(
  teamMemberId?: number | string,
  limit = 20
): Promise<TicketActivity[]> {
  // Convex ticketActivity doesn't have a "recent" or "by member" query,
  // so we fetch all and filter in JS (or use listByTicket on known tickets).
  // For now, fetch via the generic list and limit.
  const convex = getConvexClient();
  // There's no dedicated query for recent cross-ticket activity in the Convex functions.
  // Fall back to listing by ticket — the caller will need to adapt.
  // Return empty if no teamMemberId to avoid pulling everything.
  if (teamMemberId) {
    // Not directly supported by Convex functions — return empty for now
    // This would need a custom Convex query with a join or denormalization
    return [];
  }
  return [];
}
