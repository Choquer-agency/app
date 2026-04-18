"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { friendlyDate } from "@/lib/date-format";
import type { PerformanceReport, PerformanceOpenTicket } from "@/lib/reports";
import { isOverdueEligible, TeamMember } from "@/types";
import { useTeamMembers } from "@/hooks/useTeamMembers";

interface PerformanceTabProps {
  start: string;
  end: string;
}

function fmtDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = Math.round(hours / 24 * 10) / 10;
  return `${days}d`;
}

function fmtHours(h: number): string {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h${mins}m`;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#EF4444",
  high: "#F97316",
  normal: "#3B82F6",
  low: "#9CA3AF",
};

export default function PerformanceTab({ start, end }: PerformanceTabProps) {
  const [data, setData] = useState<PerformanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const { teamMembers } = useTeamMembers();
  const [selectedMemberId, setSelectedMemberId] = useState<string | "all">("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ start, end });
      if (selectedMemberId !== "all") {
        params.set("memberId", String(selectedMemberId));
      }
      const res = await fetch(`/api/admin/reports/performance?${params}`);
      if (res.ok) setData(await res.json());
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [start, end, selectedMemberId]);

  useEffect(() => {
    if (start && end) fetchData();
  }, [start, end, fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-[var(--accent)] border-t-transparent" />
      </div>
    );
  }

  if (!data || data.members.length === 0) {
    return (
      <div className="space-y-4">
        <MemberFilter members={teamMembers} value={selectedMemberId} onChange={setSelectedMemberId} />
        <div className="text-center py-16 text-sm text-[var(--muted)]">
          No performance data for this period.
        </div>
      </div>
    );
  }

  const isSingleMember = data.members.length === 1;

  return (
    <div className="space-y-6">
      {/* Member filter */}
      <MemberFilter members={teamMembers} value={selectedMemberId} onChange={setSelectedMemberId} />

      {/* Member cards */}
      <div className={`grid gap-4 ${isSingleMember ? "grid-cols-1 max-w-2xl" : "grid-cols-1 md:grid-cols-2"}`}>
        {data.members.map((m) => (
          <div key={m.teamMemberId} className="border border-[var(--border)] rounded-xl p-5 bg-white">
            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              {m.memberProfilePicUrl ? (
                <img src={m.memberProfilePicUrl} alt={m.memberName} className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium text-sm" style={{ backgroundColor: m.memberColor }}>
                  {m.memberName.charAt(0)}
                </div>
              )}
              <div>
                <div className="font-medium text-[var(--foreground)]">{m.memberName}</div>
                <div className="text-xs text-[var(--muted)]">{m.ticketsClosed} tickets closed</div>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-[var(--muted)] mb-1">Hours Logged</div>
                <div className="text-lg font-bold text-[var(--foreground)]">
                  {fmtHours(m.hoursLogged)}
                  <span className="text-sm font-normal text-[var(--muted)]"> / {m.availableHoursPerWeek}h</span>
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--muted)] mb-1">Avg Resolution</div>
                <div className="text-lg font-bold text-[var(--foreground)]">{fmtDuration(m.avgResolutionHours)}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--muted)] mb-1">On-Time</div>
                <div className="text-lg font-bold">
                  <span className={m.onTimePct >= 80 ? "text-green-600" : m.onTimePct >= 50 ? "text-yellow-600" : "text-red-600"}>
                    {m.onTimePct}%
                  </span>
                  <span className="text-xs font-normal text-[var(--muted)] ml-1">({m.onTimeCount}/{m.withDueDateCount})</span>
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--muted)] mb-1">Overdue</div>
                <div className="text-lg font-bold">
                  <span className={m.overdueTickets > 0 ? "text-red-600" : "text-green-600"}>
                    {m.overdueTickets}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--muted)] mb-1">Open Tickets</div>
                <div className="text-lg font-bold text-[var(--foreground)]">{m.openTickets}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--muted)] mb-1">Avg Open Age</div>
                <div className="text-lg font-bold text-[var(--foreground)]">{fmtDuration(m.avgOpenHours)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Team comparison table (only when viewing all) */}
      {!isSingleMember && (
        <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <h3 className="text-sm font-medium text-[var(--foreground)]">Team Comparison</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Member</th>
                  <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Closed</th>
                  <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Hours</th>
                  <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Avg Resolution</th>
                  <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">On-Time %</th>
                  <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Overdue</th>
                  <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Avg Open Age</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((m) => (
                  <tr key={m.teamMemberId} className="border-b border-[var(--border)] hover:bg-[var(--hover-tan)]">
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m.memberColor }} />
                        <span className="text-[var(--foreground)] font-medium">{m.memberName}</span>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-right">{m.ticketsClosed}</td>
                    <td className="px-2 py-3 text-right">{fmtHours(m.hoursLogged)}<span className="text-[var(--muted)]"> / {m.availableHoursPerWeek}h</span></td>
                    <td className="px-2 py-3 text-right">{fmtDuration(m.avgResolutionHours)}</td>
                    <td className="px-2 py-3 text-right">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        m.onTimePct >= 80 ? "bg-green-50 text-green-700" : m.onTimePct >= 50 ? "bg-yellow-50 text-yellow-700" : "bg-red-50 text-red-700"
                      }`}>
                        {m.onTimePct}%
                      </span>
                    </td>
                    <td className="px-2 py-3 text-right">
                      <span className={m.overdueTickets > 0 ? "text-red-600 font-medium" : ""}>{m.overdueTickets}</span>
                    </td>
                    <td className="px-2 py-3 text-right">{fmtDuration(m.avgOpenHours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Open Tickets — sorted by priority + overdue */}
      {data.openTickets.length > 0 && (
        <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <h3 className="text-sm font-medium text-[var(--foreground)]">Open Tickets <span className="text-red-500 ml-1">{data.openTickets.length}</span></h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap w-16">Priority</th>
                  <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Ticket</th>
                  <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Client</th>
                  <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Status</th>
                  <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Due Date</th>
                </tr>
              </thead>
              <tbody>
                {[...data.openTickets].sort((a, b) => {
                  const now = Date.now();
                  const aOverdue = a.dueDate ? (now - new Date(a.dueDate + "T23:59:59").getTime()) / 86400000 : -Infinity;
                  const bOverdue = b.dueDate ? (now - new Date(b.dueDate + "T23:59:59").getTime()) / 86400000 : -Infinity;
                  return bOverdue - aOverdue;
                }).map((t) => {
                  const priColor = PRIORITY_COLORS[t.priority] || PRIORITY_COLORS.normal;
                  const isOverdue = t.dueDate && new Date(t.dueDate + "T23:59:59") < new Date() && isOverdueEligible(t.status);
                  const daysUntil = t.dueDate ? Math.ceil((new Date(t.dueDate + "T23:59:59").getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

                  return (
                    <tr key={t.id} className="border-b border-[var(--border)] hover:bg-[var(--hover-tan)]">
                      <td className="px-2 py-3">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill={priColor} stroke={priColor} strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" />
                        </svg>
                      </td>
                      <td className="px-2 py-3">
                        <div>
                          <span className="font-mono text-xs text-[var(--muted)] mr-2">{t.ticketNumber}</span>
                          <span className="text-[var(--foreground)]">{t.title}</span>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-[var(--muted)]">{t.clientName || "—"}</td>
                      <td className="px-2 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          t.status === "needs_attention" ? "bg-orange-100 text-orange-700" :
                          t.status === "stuck" ? "bg-red-100 text-red-700" :
                          t.status === "in_progress" ? "bg-blue-100 text-blue-700" :
                          t.status === "qa_ready" ? "bg-purple-100 text-purple-700" :
                          t.status === "client_review" ? "bg-amber-100 text-amber-700" :
                          t.status === "approved_go_live" ? "bg-green-100 text-green-700" :
                          "bg-gray-100 text-gray-600"
                        }`}>
                          {t.status === "needs_attention" ? "Backlog" :
                           t.status === "in_progress" ? "In Progress" :
                           t.status === "qa_ready" ? "QA Ready" :
                           t.status === "client_review" ? "Client Review" :
                           t.status === "approved_go_live" ? "Go Live" :
                           t.status === "stuck" ? "Stuck" :
                           t.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-2 py-3 whitespace-nowrap">
                        {t.dueDate ? (
                          <span className={isOverdue ? "text-red-600 font-medium" : ""}>
                            {friendlyDate(t.dueDate)}
                            {isOverdue && (
                              <span className="text-[10px] ml-1 text-red-500">({Math.abs(daysUntil!)}d overdue)</span>
                            )}
                            {!isOverdue && daysUntil !== null && daysUntil <= 3 && daysUntil >= 0 && (
                              <span className="text-[10px] ml-1 text-yellow-600">
                                ({daysUntil === 0 ? "today" : daysUntil === 1 ? "tomorrow" : `${daysUntil}d`})
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-[var(--muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function MemberFilter({
  members,
  value,
  onChange,
}: {
  members: TeamMember[];
  value: string | "all";
  onChange: (id: string | "all") => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const filtered = members.filter((m) => m.roleLevel !== "bookkeeper" && m.roleLevel !== "owner" && m.active);
  if (filtered.length === 0) return null;

  const selected = value === "all" ? null : filtered.find((m) => m.id === value);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--muted)]">Team member:</span>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-white hover:border-gray-300 transition min-w-[180px]"
        >
          {selected ? (
            <>
              {selected.profilePicUrl ? (
                <img src={selected.profilePicUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
              ) : (
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold" style={{ backgroundColor: selected.color || "#6b7280" }}>
                  {selected.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                </div>
              )}
              <span>{selected.name}</span>
            </>
          ) : (
            <span>All Members</span>
          )}
          <svg className="w-3.5 h-3.5 ml-auto text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        {open && (
          <div className="absolute top-full left-0 mt-1 w-full bg-white border border-[var(--border)] rounded-lg shadow-xl py-1 z-50 max-h-[240px] overflow-y-auto">
            <button
              onClick={() => { onChange("all"); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition ${value === "all" ? "bg-[var(--accent-light)] font-medium" : ""}`}
            >
              All Members
            </button>
            {filtered.map((m) => (
              <button
                key={m.id}
                onClick={() => { onChange(m.id); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition flex items-center gap-2.5 ${value === m.id ? "bg-[var(--accent-light)] font-medium" : ""}`}
              >
                {m.profilePicUrl ? (
                  <img src={m.profilePicUrl} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0" style={{ backgroundColor: m.color || "#6b7280" }}>
                    {m.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                  </div>
                )}
                <span>{m.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
