"use client";

import { useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ClientConfig } from "@/types";
import { docToClient } from "@/lib/clients";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import ClientProfileHeader from "./ClientProfileHeader";
import ClientProfileTabs from "./ClientProfileTabs";
import type { Id } from "@/convex/_generated/dataModel";

interface ClientDetailViewProps {
  client: ClientConfig;
}

export default function ClientDetailView({ client: initialClient }: ClientDetailViewProps) {
  const clientDoc = useQuery(api.clients.getById, { id: initialClient.id as Id<"clients"> });
  const client = clientDoc ? docToClient(clientDoc) : initialClient;
  const { teamMembers } = useTeamMembers();

  // refreshClient is now a no-op since Convex useQuery auto-updates
  const refreshClient = useCallback(() => {}, []);

  return (
    <>
      <ClientProfileHeader client={client} teamMembers={teamMembers} />
      <ClientProfileTabs client={client} teamMembers={teamMembers} onClientUpdated={() => {}} onPackagesChanged={refreshClient} />
    </>
  );
}
