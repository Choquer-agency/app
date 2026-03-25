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
    if (!projectId) a.startDateActive = true;

    if (isPersonal !== undefined) a.isPersonal = isPersonal;
    if (ownerId) a.createdById = ownerId as Id<"teamMembers">;

    return a;
  }, [filters, projectId, clientId, isPersonal, ownerId, assigneeId]);

  const raw = useQuery(api.tickets.list, queryArgs as any);

  const tickets = useMemo(
    () => raw?.map(docToTicket).filter((t) => !t.parentTicketId) ?? [],
    [raw]
  );

  return { tickets, isLoading: raw === undefined };
}
