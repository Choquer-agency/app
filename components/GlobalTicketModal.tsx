"use client";

import { useState, useEffect } from "react";
import { TeamMember } from "@/types";
import TicketDetailModal from "./TicketDetailModal";

export default function GlobalTicketModal() {
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

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

  useEffect(() => {
    if (ticketId && teamMembers.length === 0) {
      fetch("/api/admin/team")
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => setTeamMembers(d.filter((m: TeamMember) => m.active)))
        .catch(() => {});
    }
  }, [ticketId, teamMembers.length]);

  if (ticketId === null) return null;

  return (
    <TicketDetailModal
      ticketId={ticketId}
      teamMembers={teamMembers}
      onClose={() => setTicketId(null)}
      onTicketUpdated={() => {}}
    />
  );
}
