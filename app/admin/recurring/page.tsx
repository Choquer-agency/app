"use client";

import { useState, useEffect } from "react";
import { TeamMember } from "@/types";
import RecurringTicketManager from "@/components/RecurringTicketManager";

export default function RecurringPage() {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  useEffect(() => {
    fetch("/api/admin/team")
      .then((r) => (r.ok ? r.json() : []))
      .then(setTeamMembers)
      .catch(() => {});
  }, []);

  return (
    <>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-[var(--muted)] mb-4">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182" />
        </svg>
        <span>Task Management</span>
        <span className="text-gray-300">/</span>
        <span className="text-[var(--foreground)] font-medium">Recurring Tickets</span>
      </div>

      <h1 className="text-2xl font-bold text-[var(--foreground)] mb-6">Recurring Tickets</h1>
      <RecurringTicketManager teamMembers={teamMembers} />
    </>
  );
}
