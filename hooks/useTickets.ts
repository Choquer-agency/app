"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Ticket, TicketFilters } from "@/types";
import { docToTicket } from "@/lib/ticket-mappers";

interface UseTicketsOptions {
  filters: TicketFilters;
  projectId?: string;
  clientId?: string;
  isPersonal?: boolean;
  ownerId?: string;
  assigneeId?: string;
}

export function useTickets({
  filters,
  projectId,
  clientId,
  isPersonal,
  ownerId,
  assigneeId,
}: UseTicketsOptions): { tickets: Ticket[]; isLoading: boolean } {
  const queryArgs = useMemo(() => {
    const a: Record<string, unknown> = {};

    const effectiveClientId = filters.clientId || clientId;
    if (effectiveClientId) a.clientId = effectiveClientId as Id<"clients">;

    const effectiveAssigneeId = filters.assigneeId || assigneeId;
    if (effectiveAssigneeId) a.assigneeId = effectiveAssigneeId as Id<"teamMembers">;

    if (filters.search) a.search = filters.search;

    if (filters.status) {
      a.status = Array.isArray(filters.status) ? filters.status : [filters.status];
    }
    if (filters.priority) {
      a.priority = Array.isArray(filters.priority) ? filters.priority : [filters.priority];
    }

    if (filters.archived) a.archived = true;

    if (projectId) a.projectId = projectId as Id<"projects">;
    // startDateActive hides future-scheduled tickets. Skip it on personal/assignee
    // boards so team members always see every ticket assigned to them, including
    // overdue work with an odd startDate.
    if (!projectId && !effectiveAssigneeId) a.startDateActive = true;

    if (isPersonal !== undefined) a.isPersonal = isPersonal;
    if (ownerId) a.createdById = ownerId as Id<"teamMembers">;

    return a;
  }, [filters, projectId, clientId, isPersonal, ownerId, assigneeId]);

  const raw = useQuery(api.tickets.list, queryArgs as any);

  // Sub-tickets are normally hidden at the top level (they render nested under
  // their parent). On personal/assignee boards we keep them so someone who owns
  // only a sub-ticket still sees their work.
  const effectiveAssigneeIdForFilter = filters.assigneeId || assigneeId;
  const tickets = useMemo(
    () =>
      raw
        ?.map(docToTicket)
        .filter((t) => (effectiveAssigneeIdForFilter ? true : !t.parentTicketId)) ?? [],
    [raw, effectiveAssigneeIdForFilter]
  );

  return { tickets, isLoading: raw === undefined };
}
