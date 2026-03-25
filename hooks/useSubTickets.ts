"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Ticket } from "@/types";
import { docToTicket } from "@/lib/ticket-mappers";

export function useSubTickets(parentTicketId: string | null): {
  subTickets: Ticket[];
  isLoading: boolean;
} {
  const raw = useQuery(
    api.tickets.list,
    parentTicketId
      ? { parentTicketId: parentTicketId as Id<"tickets"> }
      : "skip"
  );

  const subTickets = useMemo(() => raw?.map(docToTicket) ?? [], [raw]);

  return {
    subTickets,
    isLoading: raw === undefined && parentTicketId !== null,
  };
}
