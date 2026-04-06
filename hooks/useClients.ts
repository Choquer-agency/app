"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { docToClient } from "@/lib/clients";
import { ClientConfig } from "@/types";

export function useClients(includeInactive = false): {
  clients: ClientConfig[];
  isLoading: boolean;
} {
  const docs = useQuery(api.clients.list, { includeInactive });
  const clients = useMemo(
    () => docs?.map(docToClient) ?? [],
    [docs]
  );
  return { clients, isLoading: docs === undefined };
}
