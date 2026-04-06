"use client";

import { useState, useEffect } from "react";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import TicketDetailModal from "./TicketDetailModal";

export default function GlobalTicketModal() {
  const [ticketId, setTicketId] = useState<string | null>(null);
  const { teamMembers } = useTeamMembers();

  useEffect(() => {
    function handleOpen(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.ticketId) {
        setTicketId(detail.ticketId);
      }
    }
    window.addEventListener("command-palette:open-ticket", handleOpen);
    return () => window.removeEventListener("command-palette:open-ticket", handleOpen);
  }, []);

  if (ticketId === null) return null;

  return (
    <TicketDetailModal
      ticketId={ticketId}
      teamMembers={teamMembers}
      onClose={() => setTicketId(null)}
    />
  );
}
