"use client";

import { useState, useCallback, useEffect } from "react";
import { ClientConfig, TeamMember } from "@/types";
import ClientProfileHeader from "./ClientProfileHeader";
import ClientProfileTabs from "./ClientProfileTabs";

interface ClientDetailViewProps {
  client: ClientConfig;
}

export default function ClientDetailView({ client: initialClient }: ClientDetailViewProps) {
  const [client, setClient] = useState(initialClient);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  const refreshClient = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/clients/${client.id}`);
      if (res.ok) {
        const updated: ClientConfig = await res.json();
        setClient(updated);
      }
    } catch {
      // Failed
    }
  }, [client.id]);

  useEffect(() => {
    refreshClient();
    fetch("/api/admin/team")
      .then((res) => res.ok ? res.json() : [])
      .then(setTeamMembers)
      .catch(() => {});
  }, [refreshClient]);

  return (
    <>
      <ClientProfileHeader client={client} teamMembers={teamMembers} />
      <ClientProfileTabs client={client} teamMembers={teamMembers} onClientUpdated={setClient} onPackagesChanged={refreshClient} />
    </>
  );
}
