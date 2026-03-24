"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { TeamMember } from "@/types";
import type { MeetingMemberData, MeetingTicket } from "@/lib/commitments";
import DatePicker from "./DatePicker";
import { StatusDot } from "./TicketStatusBadge";
import { friendlyDate } from "@/lib/date-format";

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  urgent: { label: "Urgent", color: "text-red-700", bg: "bg-red-50" },
  high: { label: "High", color: "text-orange-700", bg: "bg-orange-50" },
  normal: { label: "Normal", color: "text-blue-700", bg: "bg-blue-50" },
  low: { label: "Low", color: "text-gray-600", bg: "bg-gray-50" },
};

interface MemberStats {
  id: number;
  openTickets: number;
  overdueTickets: number;
}

export default function MeetingView({ roleLevel, teamMemberId }: { roleLevel?: string; teamMemberId?: string | number }) {
  const isAdmin = roleLevel === "owner" || roleLevel === "c_suite";
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [memberStats, setMemberStats] = useState<Map<number, MemberStats>>(new Map());
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [data, setData] = useState<MeetingMemberData | null>(null);
  const [loading, setLoading] = useState(false);
  const [reviewed, setReviewed] = useState<Set<number>>(new Set());
  const [memberDropdownOpen, setMemberDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/admin/team")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => {
        let active = (d as TeamMember[]).filter((m) => m.active);
        // Employees only see themselves
        if (!isAdmin && teamMemberId) {
          active = active.filter((m) => String(m.id) === String(teamMemberId));
          if (active[0]) setSelectedMemberId(Number(active[0].id));
        }
        setTeamMembers(active);
      })
      .catch(() => {});

    // Fetch ticket stats per member
    fetch("/api/admin/meetings/stats")
      .then((r) => r.ok ? r.json() : [])
      .then((stats: { id: number; openTickets: number; overdueTickets: number }[]) => {
        const map = new Map<number, MemberStats>();
        for (const s of stats) map.set(s.id, s);
        setMemberStats(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setMemberDropdownOpen(false);
    }
    if (memberDropdownOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [memberDropdownOpen]);

  const fetchData = useCallback(async () => {
    if (!selectedMemberId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/meetings?memberId=${selectedMemberId}`);
      if (res.ok) {
        setData(await res.json());
        setReviewed(new Set());
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [selectedMemberId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectedMember = teamMembers.find((m) => m.id === selectedMemberId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Monday Meeting</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Review tickets, set commitments, track accountability</p>
        </div>

        {/* Member selector */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setMemberDropdownOpen(!memberDropdownOpen)}
            className="flex items-center gap-2.5 px-4 py-2 text-sm border border-[var(--border)] rounded-lg bg-white hover:border-gray-300 transition min-w-[200px]"
          >
            {selectedMember ? (
              <>
                {selectedMember.profilePicUrl ? (
                  <img src={selectedMember.profilePicUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ backgroundColor: selectedMember.color || "#6b7280" }}>
                    {selectedMember.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                  </div>
                )}
                <span className="font-medium">{selectedMember.name}</span>
              </>
            ) : (
              <span className="text-[var(--muted)]">Select team member...</span>
            )}
            <svg className="w-4 h-4 ml-auto text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {memberDropdownOpen && (
            <div className="absolute right-0 top-full mt-1 w-full bg-white border border-[var(--border)] rounded-lg shadow-xl py-1 z-50">
              {teamMembers.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setSelectedMemberId(m.id); setMemberDropdownOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition flex items-center gap-2.5 ${
                    selectedMemberId === m.id ? "bg-[var(--accent-light)] font-medium" : ""
                  }`}
                >
                  {m.profilePicUrl ? (
                    <img src={m.profilePicUrl} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0" style={{ backgroundColor: m.color || "#6b7280" }}>
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

      {!selectedMemberId && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {teamMembers.map((m) => {
            const stats = memberStats.get(m.id);
            return (
              <button
                key={m.id}
                onClick={() => setSelectedMemberId(m.id)}
                className="flex flex-col items-center gap-3 p-5 bg-white border border-[var(--border)] rounded-xl hover:border-[var(--accent)] hover:shadow-md transition text-center group"
              >
                {m.profilePicUrl ? (
                  <img src={m.profilePicUrl} alt="" className="w-16 h-16 rounded-full object-cover ring-2 ring-white shadow" />
                ) : (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-lg font-bold shadow" style={{ backgroundColor: m.color || "#6b7280" }}>
                    {m.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)] group-hover:text-[var(--accent)] transition">{m.name}</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-[var(--muted)]">
                    <span className="font-semibold text-[var(--foreground)]">{stats?.openTickets ?? 0}</span> open
                  </span>
                  {(stats?.overdueTickets ?? 0) > 0 && (
                    <span className="text-red-500">
                      <span className="font-semibold">{stats?.overdueTickets}</span> overdue
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-[var(--accent)] border-t-transparent" />
        </div>
      )}

      {data && !loading && (
        <>
          {/* Reliability score banner */}
          <div className="flex items-center gap-6 px-5 py-4 bg-white border border-[var(--border)] rounded-xl">
            <div>
              <div className="text-xs text-[var(--muted)] mb-0.5">Reliability Score</div>
              <div className="text-2xl font-bold">
                <span className={
                  data.reliability.score >= 80 ? "text-green-600" :
                  data.reliability.score >= 50 ? "text-yellow-600" : "text-red-600"
                }>
                  {data.reliability.totalCommitments > 0 ? `${data.reliability.score}%` : "—"}
                </span>
              </div>
            </div>
            <div className="h-10 w-px bg-[var(--border)]" />
            <div>
              <div className="text-xs text-[var(--muted)] mb-0.5">Commitments Met</div>
              <div className="text-lg font-semibold text-[var(--foreground)]">{data.reliability.commitmentsMet}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)] mb-0.5">Commitments Missed</div>
              <div className="text-lg font-semibold text-red-600">{data.reliability.commitmentsMissed}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)] mb-0.5">Overdue Tickets</div>
              <div className="text-lg font-semibold text-red-600">{data.overdue.length}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)] mb-0.5">Due This Week</div>
              <div className="text-lg font-semibold text-[var(--foreground)]">{data.dueThisWeek.length}</div>
            </div>
          </div>

          {/* Ticket sections */}
          {data.overdue.length > 0 && (
            <TicketSection
              title="Overdue"
              subtitle={`${data.overdue.length} tickets past due`}
              color="red"
              tickets={data.overdue}
              reviewed={reviewed}
              onToggleReviewed={(id) => setReviewed((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; })}
              memberId={selectedMemberId!}
              onCommitmentSet={fetchData}
            />
          )}

          {data.missedCommitments.length > 0 && (
            <TicketSection
              title="Missed Commitments"
              subtitle={`${data.missedCommitments.length} tickets with broken commitments`}
              color="orange"
              tickets={data.missedCommitments}
              reviewed={reviewed}
              onToggleReviewed={(id) => setReviewed((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; })}
              memberId={selectedMemberId!}
              onCommitmentSet={fetchData}
            />
          )}

          {data.dueThisWeek.length > 0 && (
            <TicketSection
              title="Due This Week"
              subtitle={`${data.dueThisWeek.length} upcoming deadlines`}
              color="blue"
              tickets={data.dueThisWeek}
              reviewed={reviewed}
              onToggleReviewed={(id) => setReviewed((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; })}
              memberId={selectedMemberId!}
              onCommitmentSet={fetchData}
            />
          )}

          {data.needsAttention.length > 0 && (
            <TicketSection
              title="Needs Attention / Stuck"
              subtitle={`${data.needsAttention.length} blocked or waiting`}
              color="yellow"
              tickets={data.needsAttention}
              reviewed={reviewed}
              onToggleReviewed={(id) => setReviewed((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; })}
              memberId={selectedMemberId!}
              onCommitmentSet={fetchData}
            />
          )}

          {data.inProgress.length > 0 && (
            <TicketSection
              title="In Progress"
              subtitle={`${data.inProgress.length} active tickets`}
              color="gray"
              tickets={data.inProgress}
              reviewed={reviewed}
              onToggleReviewed={(id) => setReviewed((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; })}
              memberId={selectedMemberId!}
              onCommitmentSet={fetchData}
            />
          )}

          {data.overdue.length === 0 && data.missedCommitments.length === 0 && data.dueThisWeek.length === 0 && data.inProgress.length === 0 && data.needsAttention.length === 0 && (
            <div className="text-center py-16 text-sm text-[var(--muted)]">
              No open tickets for this team member.
            </div>
          )}
        </>
      )}
    </div>
  );
}

// === Ticket Section ===

function TicketSection({
  title,
  subtitle,
  color,
  tickets,
  reviewed,
  onToggleReviewed,
  memberId,
  onCommitmentSet,
}: {
  title: string;
  subtitle: string;
  color: "red" | "orange" | "blue" | "yellow" | "gray";
  tickets: MeetingTicket[];
  reviewed: Set<number>;
  onToggleReviewed: (id: number) => void;
  memberId: number;
  onCommitmentSet: () => void;
}) {
  const colorMap = {
    red: "border-l-red-500 bg-red-50/30",
    orange: "border-l-orange-500 bg-orange-50/30",
    blue: "border-l-blue-500 bg-blue-50/30",
    yellow: "border-l-yellow-500 bg-yellow-50/30",
    gray: "border-l-gray-300",
  };

  return (
    <div className={`border border-[var(--border)] rounded-xl overflow-hidden border-l-4 ${colorMap[color]}`}>
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">{title}</h3>
        <p className="text-xs text-[var(--muted)]">{subtitle}</p>
      </div>
      <div>
        {tickets.map((ticket) => (
          <MeetingTicketRow
            key={ticket.id}
            ticket={ticket}
            isReviewed={reviewed.has(ticket.id)}
            onToggleReviewed={() => onToggleReviewed(ticket.id)}
            memberId={memberId}
            onCommitmentSet={onCommitmentSet}
          />
        ))}
      </div>
    </div>
  );
}

// === Meeting Ticket Row ===

function MeetingTicketRow({
  ticket,
  isReviewed,
  onToggleReviewed,
  memberId,
  onCommitmentSet,
}: {
  ticket: MeetingTicket;
  isReviewed: boolean;
  onToggleReviewed: () => void;
  memberId: number;
  onCommitmentSet: () => void;
}) {
  const [showCommitForm, setShowCommitForm] = useState(false);
  const [commitDate, setCommitDate] = useState<string | null>(null);
  const [commitNote, setCommitNote] = useState("");
  const [saving, setSaving] = useState(false);

  const pri = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.normal;
  const isOverdue = ticket.dueDate && ticket.dueDate < new Date().toISOString().split("T")[0];
  const daysOverdue = isOverdue && ticket.dueDate
    ? Math.ceil((Date.now() - new Date(ticket.dueDate + "T23:59:59").getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  async function handleSetCommitment() {
    if (!commitDate) return;
    setSaving(true);
    try {
      await fetch(`/api/admin/tickets/${ticket.id}/commitments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamMemberId: memberId, committedDate: commitDate, notes: commitNote }),
      });
      setShowCommitForm(false);
      setCommitDate(null);
      setCommitNote("");
      onCommitmentSet();
    } catch {} finally {
      setSaving(false);
    }
  }

  return (
    <div className={`border-b border-[var(--border)] last:border-b-0 px-4 py-3 ${isReviewed ? "bg-green-50/40" : "hover:bg-gray-50/50"} transition`}>
      <div className="flex items-center gap-3">
        {/* Reviewed checkbox */}
        <input
          type="checkbox"
          checked={isReviewed}
          onChange={onToggleReviewed}
          className="rounded shrink-0"
          title="Mark as reviewed"
        />

        {/* Status dot */}
        <StatusDot status={ticket.status as Parameters<typeof StatusDot>[0]["status"]} size={10} />

        {/* Ticket info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-[var(--muted)]">{ticket.ticketNumber}</span>
            <span className={`font-medium text-sm ${isReviewed ? "line-through text-[var(--muted)]" : "text-[var(--foreground)]"}`}>
              {ticket.title}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--muted)]">
            {ticket.clientName && <span>{ticket.clientName}</span>}
            {ticket.dueDate && (
              <span className={isOverdue ? "text-red-600 font-medium" : ""}>
                Due: {friendlyDate(ticket.dueDate)}
                {isOverdue && ` (${daysOverdue}d overdue)`}
              </span>
            )}
            {ticket.missedCommitmentCount > 0 && (
              <span className="text-red-600 font-medium">
                {ticket.missedCommitmentCount} missed commitment{ticket.missedCommitmentCount > 1 ? "s" : ""}
              </span>
            )}
            {ticket.lastCommitment && ticket.lastCommitment.status === "active" && (
              <span className="text-blue-600">
                Committed: {friendlyDate(ticket.lastCommitment.committedDate)}
              </span>
            )}
          </div>
        </div>

        {/* Priority */}
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${pri.bg} ${pri.color} shrink-0`}>
          {pri.label}
        </span>

        {/* Set Commitment button */}
        <button
          onClick={() => setShowCommitForm(!showCommitForm)}
          className="text-xs text-[var(--accent)] hover:text-[var(--foreground)] font-medium shrink-0 transition"
        >
          {showCommitForm ? "Cancel" : "Set Commitment"}
        </button>
      </div>

      {/* Inline commitment form */}
      {showCommitForm && (
        <div className="mt-3 ml-9 flex items-center gap-2">
          <DatePicker
            value={commitDate}
            onChange={setCommitDate}
            placeholder="Commit to date..."
            displayFormat="full"
          />
          <input
            type="text"
            value={commitNote}
            onChange={(e) => setCommitNote(e.target.value)}
            placeholder="Meeting note..."
            className="flex-1 text-xs border border-[var(--border)] rounded-lg px-3 py-1.5 outline-none focus:border-[var(--accent)]"
            onKeyDown={(e) => { if (e.key === "Enter") handleSetCommitment(); }}
          />
          <button
            onClick={handleSetCommitment}
            disabled={!commitDate || saving}
            className="text-xs font-medium text-white bg-[var(--accent)] rounded-lg px-3 py-1.5 hover:opacity-90 transition disabled:opacity-40"
          >
            {saving ? "..." : "Commit"}
          </button>
        </div>
      )}
    </div>
  );
}
