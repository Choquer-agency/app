"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ServiceBoardEntry, ServiceBoardStatus, Ticket, TeamMember, TicketStatus, TicketPriority } from "@/types";
import MonthPicker from "./MonthPicker";
import HourCountdown from "./HourCountdown";
import ServiceBoardStatusBadge from "./ServiceBoardStatusBadge";
import TicketDetailModal from "./TicketDetailModal";
import TicketCreateModal from "./TicketCreateModal";
import { StatusDot } from "./TicketStatusBadge";
import StatusDropdown from "./StatusDropdown";
import { PriorityDropdown } from "./TicketPriorityBadge";
import AssigneeDropdown from "./AssigneeDropdown";
import TimeTracker from "./TimeTracker";
import DatePicker from "./DatePicker";
import { useTeamMembers } from "@/hooks/useTeamMembers";

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

interface RetainerEntry extends ServiceBoardEntry {
  tickets: Ticket[];
}

export default function RetainerBoard() {
  const [month, setMonth] = useState(getCurrentMonth);
  const [entries, setEntries] = useState<RetainerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedClient, setExpandedClient] = useState<number | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForClientId, setCreateForClientId] = useState<number | null>(null);
  const { teamMembers } = useTeamMembers(false);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/retainer-board?month=${month}`);
      if (res.ok) setEntries(await res.json());
    } catch (e) {
      console.error("Failed to fetch retainer board:", e);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  async function handleServiceStatusChange(entryId: number, status: ServiceBoardStatus) {
    try {
      const res = await fetch(`/api/admin/service-board/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const updated = await res.json();
        setEntries((prev) =>
          prev.map((e) => (e.id === entryId ? { ...updated, tickets: e.tickets } : e))
        );
      }
    } catch {}
  }

  async function handleTicketStatusChange(ticketId: number, newStatus: TicketStatus) {
    // Optimistic update
    setEntries((prev) =>
      prev.map((e) => ({
        ...e,
        tickets: e.tickets.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t)),
      }))
    );
    try {
      await fetch(`/api/admin/tickets/${ticketId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {}
  }

  async function handleTicketPriorityChange(ticketId: number, newPriority: TicketPriority) {
    setEntries((prev) =>
      prev.map((e) => ({
        ...e,
        tickets: e.tickets.map((t) => (t.id === ticketId ? { ...t, priority: newPriority } : t)),
      }))
    );
    try {
      await fetch(`/api/admin/tickets/${ticketId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: newPriority }),
      });
    } catch {}
  }

  async function handleTicketDueDateChange(ticketId: number, newDate: string | null) {
    setEntries((prev) =>
      prev.map((e) => ({
        ...e,
        tickets: e.tickets.map((t) => (t.id === ticketId ? { ...t, dueDate: newDate } : t)),
      }))
    );
    try {
      await fetch(`/api/admin/tickets/${ticketId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueDate: newDate }),
      });
    } catch {}
  }

  async function handleAssigneeToggle(ticketId: number, memberId: number, action: "add" | "remove") {
    try {
      if (action === "add") {
        await fetch(`/api/admin/tickets/${ticketId}/assignees`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamMemberId: memberId }),
        });
      } else {
        await fetch(`/api/admin/tickets/${ticketId}/assignees`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamMemberId: memberId }),
        });
      }
      fetchEntries();
    } catch {}
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-gray-900">Retainer</h1>
          <MonthPicker value={month} onChange={setMonth} />
        </div>
        <div className="text-sm text-gray-500">
          {entries.length} client{entries.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-auto px-6 py-4 space-y-5">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="mb-2">
              <path d="M12 9v3m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm">No clients with an active Retainer package</p>
          </div>
        ) : (
          entries.map((entry) => {
            const isExpanded = expandedClient === entry.id;
            const activeTickets = entry.tickets.filter((t) => t.status !== "closed");
            const closedTickets = entry.tickets.filter((t) => t.status === "closed");

            return (
              <div key={entry.id}>
                {/* Client group header — matches TicketListView group headers */}
                <div
                  className="flex items-center gap-3 py-2 mb-1 w-full cursor-pointer"
                  onClick={() => setExpandedClient(isExpanded ? null : entry.id)}
                >
                  <button className="p-0.5 rounded hover:bg-gray-100 transition shrink-0">
                    <svg
                      className={`w-3.5 h-3.5 text-[var(--muted)] transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-semibold bg-gray-100 text-[var(--foreground)]">
                    {entry.clientName}
                  </span>
                  <span className="text-xs text-gray-400">{entry.packageName}</span>
                  <div className="w-48 ml-auto" onClick={(e) => e.stopPropagation()}>
                    <HourCountdown logged={entry.loggedHours || 0} allocated={entry.includedHours || 0} compact />
                  </div>
                  <span className="text-sm text-[var(--muted)] font-medium">
                    {activeTickets.length}
                  </span>
                  <div onClick={(e) => e.stopPropagation()}>
                    <ServiceBoardStatusBadge status={entry.status} onChange={(s) => handleServiceStatusChange(entry.id, s)} />
                  </div>
                  <div className="flex items-center gap-1.5 w-28 shrink-0">
                    {entry.specialistName ? (
                      <>
                        {entry.specialistProfilePicUrl ? (
                          <img src={entry.specialistProfilePicUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                        ) : (
                          <span
                            className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                            style={{ backgroundColor: entry.specialistColor || "#6B7280" }}
                          >{entry.specialistName.charAt(0)}</span>
                        )}
                        <span className="text-xs text-gray-600 truncate">{entry.specialistName}</span>
                      </>
                    ) : (
                      <span className="text-xs text-gray-300">Unassigned</span>
                    )}
                  </div>
                </div>

                {/* Ticket table — matches TicketListView exactly */}
                {isExpanded && (
                  <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[var(--border)]">
                            <th className="w-6 px-2 py-2.5" />
                            <th className="px-3 py-2.5 text-left font-medium text-[var(--muted)] text-xs">Name</th>
                            <th className="px-3 py-2.5 text-left font-medium text-[var(--muted)] text-xs w-20">Comments</th>
                            <th className="px-3 py-2.5 text-left font-medium text-[var(--muted)] text-xs w-32">Status</th>
                            <th className="px-3 py-2.5 text-left font-medium text-[var(--muted)] text-xs w-28">Time tracked</th>
                            <th className="px-3 py-2.5 text-left font-medium text-[var(--muted)] text-xs w-20">Assignee</th>
                            <th className="px-3 py-2.5 text-left font-medium text-[var(--muted)] text-xs w-24">Due date</th>
                            <th className="px-3 py-2.5 text-left font-medium text-[var(--muted)] text-xs w-24">Priority</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeTickets.map((ticket) => (
                            <tr
                              key={ticket.id}
                              className="border-b border-[var(--border)] last:border-b-0 cursor-pointer hover:bg-[var(--hover-tan)] transition"
                              onClick={() => setSelectedTicketId(ticket.id)}
                            >
                              <td className="px-2 py-3">
                                <StatusDot status={ticket.status} size={10} />
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-[var(--foreground)]">{ticket.title}</span>
                                  {(ticket.subTicketCount ?? 0) > 0 && (
                                    <span className="flex items-center gap-0.5 text-[var(--muted)] text-xs shrink-0">
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
                                      </svg>
                                      {ticket.subTicketCount}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <div className="relative flex items-center gap-1.5 text-[var(--muted)] w-fit">
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 256 256">
                                    <path d="M216,48H40A16,16,0,0,0,24,64V224a15.84,15.84,0,0,0,9.25,14.5A16.05,16.05,0,0,0,40,240a15.89,15.89,0,0,0,10.25-3.78l.09-.07L83,208H216a16,16,0,0,0,16-16V64A16,16,0,0,0,216,48ZM40,224h0ZM216,192H80a8,8,0,0,0-5.23,1.95L40,224V64H216Z" />
                                  </svg>
                                  {(ticket.commentCount ?? 0) > 0 && (
                                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 flex items-center justify-center px-1 text-[9px] font-bold text-white bg-[var(--foreground)] rounded-full">
                                      {ticket.commentCount}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                                <StatusDropdown status={ticket.status} onChange={(s) => handleTicketStatusChange(ticket.id, s)} />
                              </td>
                              <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                                <TimeTracker ticketId={ticket.id} onTimerChange={() => window.dispatchEvent(new CustomEvent("timerChange"))} />
                              </td>
                              <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                                <AssigneeDropdown
                                  ticketId={ticket.id}
                                  assignees={ticket.assignees || []}
                                  teamMembers={teamMembers}
                                  onToggle={handleAssigneeToggle}
                                />
                              </td>
                              <td className="px-0 py-0" onClick={(e) => e.stopPropagation()}>
                                <DatePicker
                                  value={ticket.dueDate}
                                  onChange={(d) => handleTicketDueDateChange(ticket.id, d)}
                                  placeholder="—"
                                  displayFormat="short"
                                  className="w-full h-full px-3 py-3 block"
                                />
                              </td>
                              <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                                <PriorityDropdown priority={ticket.priority} onChange={(p) => handleTicketPriorityChange(ticket.id, p)} />
                              </td>
                            </tr>
                          ))}
                          {closedTickets.length > 0 && (
                            <>
                              <tr className="border-b border-[var(--border)]">
                                <td colSpan={8} className="px-3 py-2">
                                  <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-medium">
                                    Closed ({closedTickets.length})
                                  </span>
                                </td>
                              </tr>
                              {closedTickets.map((ticket) => (
                                <tr
                                  key={ticket.id}
                                  className="border-b border-[var(--border)] last:border-b-0 cursor-pointer hover:bg-[var(--hover-tan)] transition opacity-50"
                                  onClick={() => setSelectedTicketId(ticket.id)}
                                >
                                  <td className="px-2 py-3">
                                    <StatusDot status={ticket.status} size={10} />
                                  </td>
                                  <td className="px-3 py-3">
                                    <span className="font-medium text-[var(--foreground)] line-through">{ticket.title}</span>
                                  </td>
                                  <td className="px-3 py-3" />
                                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                                    <StatusDropdown status={ticket.status} onChange={(s) => handleTicketStatusChange(ticket.id, s)} />
                                  </td>
                                  <td className="px-3 py-3" />
                                  <td className="px-3 py-3" />
                                  <td className="px-3 py-3" />
                                  <td className="px-3 py-3" />
                                </tr>
                              ))}
                            </>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {/* Add ticket button */}
                    <div className="border-t border-[var(--border)] px-3 py-2">
                      <button
                        onClick={() => { setCreateForClientId(entry.clientId); setShowCreateModal(true); }}
                        className="flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--accent)] transition"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        Add ticket
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Ticket Detail Modal */}
      {selectedTicketId && (
        <TicketDetailModal
          ticketId={selectedTicketId}
          teamMembers={teamMembers}
          onClose={() => { setSelectedTicketId(null); fetchEntries(); }}
          onTicketUpdated={fetchEntries}
        />
      )}

      {/* Create Ticket Modal */}
      {showCreateModal && (
        <TicketCreateModal
          teamMembers={teamMembers}
          onClose={() => { setShowCreateModal(false); setCreateForClientId(null); }}
          onCreated={() => { setShowCreateModal(false); setCreateForClientId(null); fetchEntries(); }}
          defaultClientId={createForClientId ?? undefined}
          defaultServiceCategory="retainer"
        />
      )}
    </div>
  );
}
