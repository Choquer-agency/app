"use client";

import { useState, useEffect } from "react";
import ClientTicketDetail from "./ClientTicketDetail";

interface ClientTicket {
  id: number;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  createdAt: string;
  assignees: Array<{
    memberName?: string;
    memberColor?: string;
    memberProfilePicUrl?: string;
  }>;
}

const STATUS_LABELS: Record<string, string> = {
  needs_attention: "Needs Attention",
  stuck: "Stuck",
  in_progress: "In Progress",
  qa_ready: "QA Ready",
  client_review: "Client Review",
  approved_go_live: "Approved / Go Live",
  closed: "Closed",
};

const STATUS_COLORS: Record<string, string> = {
  needs_attention: "bg-orange-100 text-orange-700",
  stuck: "bg-red-100 text-red-700",
  in_progress: "bg-blue-100 text-blue-700",
  qa_ready: "bg-purple-100 text-purple-700",
  client_review: "bg-yellow-100 text-yellow-700",
  approved_go_live: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-500",
};

const OPEN_STATUSES = ["needs_attention", "stuck", "in_progress", "qa_ready"];
const REVIEW_STATUSES = ["client_review"];
const DONE_STATUSES = ["approved_go_live", "closed"];

interface ClientTicketsViewProps {
  slug: string;
  clientName: string;
}

export default function ClientTicketsView({ slug, clientName }: ClientTicketsViewProps) {
  const [tickets, setTickets] = useState<ClientTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTicketId, setExpandedTicketId] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/clients/${slug}/tickets`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setTickets)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#FF9500]" />
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-[#6b7280]">No active tasks right now</p>
      </div>
    );
  }

  const openTickets = tickets.filter((t) => OPEN_STATUSES.includes(t.status));
  const reviewTickets = tickets.filter((t) => REVIEW_STATUSES.includes(t.status));
  const doneTickets = tickets.filter((t) => DONE_STATUSES.includes(t.status));

  const groups = [
    { id: "tasks-open", label: "In Progress", tickets: openTickets },
    { id: "tasks-review", label: "Needs Your Review", tickets: reviewTickets },
    { id: "tasks-completed", label: "Completed", tickets: doneTickets },
  ].filter((g) => g.tickets.length > 0);

  // If a ticket is expanded, show its detail
  if (expandedTicketId) {
    return (
      <div>
        <button
          onClick={() => setExpandedTicketId(null)}
          className="flex items-center gap-1 text-sm text-[#6b7280] hover:text-[#1A1A1A] transition mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Back to tasks
        </button>
        <ClientTicketDetail slug={slug} ticketId={expandedTicketId} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-[#1A1A1A]">Tasks</h2>
        <span className="text-xs text-[#6b7280]">{tickets.length} total</span>
      </div>

      {groups.map((group) => (
        <div key={group.id} id={group.id}>
          <h3 className="text-xs font-bold text-[#6b7280] uppercase tracking-wider mb-2">
            {group.label} ({group.tickets.length})
          </h3>
          <div className="rounded-xl border border-[#F0F0F0] overflow-hidden divide-y divide-[#F0F0F0]">
            {group.tickets.map((ticket) => (
              <button
                key={ticket.id}
                onClick={() => setExpandedTicketId(ticket.id)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition flex items-center gap-3"
              >
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full shrink-0 ${STATUS_COLORS[ticket.status] || "bg-gray-100 text-gray-500"}`}>
                  {STATUS_LABELS[ticket.status] || ticket.status}
                </span>
                <span className="text-xs font-mono text-[#9ca3af] shrink-0">{ticket.ticketNumber}</span>
                <span className="text-sm text-[#1A1A1A] truncate flex-1">{ticket.title}</span>
                {ticket.dueDate && (
                  <span className={`text-[10px] shrink-0 ${
                    ticket.dueDate < new Date().toISOString().slice(0, 10)
                      ? "text-red-600 font-semibold"
                      : "text-[#9ca3af]"
                  }`}>
                    {ticket.dueDate}
                  </span>
                )}
                {ticket.assignees.length > 0 && (
                  <div className="flex -space-x-1 shrink-0">
                    {ticket.assignees.slice(0, 2).map((a, i) => (
                      <div
                        key={i}
                        className="w-5 h-5 rounded-full border border-white flex items-center justify-center text-[8px] font-bold text-white"
                        style={{ backgroundColor: a.memberColor || "#6b7280" }}
                        title={a.memberName}
                      >
                        {a.memberName?.charAt(0) || "?"}
                      </div>
                    ))}
                  </div>
                )}
                <svg className="w-4 h-4 text-[#9ca3af] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
