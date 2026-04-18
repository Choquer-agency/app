"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { TeamMember, isOverdueEligible } from "@/types";
import type { MeetingMemberData, MeetingTicket } from "@/lib/commitments";
import DatePicker from "./DatePicker";
import { StatusDot } from "./TicketStatusBadge";
import { friendlyDate } from "@/lib/date-format";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import TicketDetailModal from "./TicketDetailModal";
import dynamic from "next/dynamic";
const MeetingNotesIngestion = dynamic(() => import("./MeetingNotesIngestion"), { ssr: false });

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  urgent: { label: "Urgent", color: "text-red-700", bg: "bg-red-50" },
  high: { label: "High", color: "text-orange-700", bg: "bg-orange-50" },
  normal: { label: "Normal", color: "text-blue-700", bg: "bg-blue-50" },
  low: { label: "Low", color: "text-gray-600", bg: "bg-gray-50" },
};

interface MemberStats {
  id: string;
  openTickets: number;
  overdueTickets: number;
}

export default function MeetingView({ roleLevel, teamMemberId }: { roleLevel?: string; teamMemberId?: string | number }) {
  const isAdmin = roleLevel === "owner" || roleLevel === "c_suite";
  const { teamMembers: allTeamMembers } = useTeamMembers();
  const teamMembers = useMemo(() => {
    let active = allTeamMembers.filter((m) => m.active && m.roleLevel !== "bookkeeper" && m.roleLevel !== "owner");
    if (!isAdmin && teamMemberId) {
      active = active.filter((m) => String(m.id) === String(teamMemberId));
    }
    return active;
  }, [allTeamMembers, isAdmin, teamMemberId]);

  const [memberStats, setMemberStats] = useState<Map<string, MemberStats>>(new Map());
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [period, setPeriod] = useState<string>("last_week");
  const [data, setData] = useState<MeetingMemberData | null>(null);
  const [loading, setLoading] = useState(false);
  const [reviewed, setReviewed] = useState<Set<number>>(new Set());
  const [memberDropdownOpen, setMemberDropdownOpen] = useState(false);
  const [periodDropdownOpen, setPeriodDropdownOpen] = useState(false);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<any>(null);
  const [briefingMeta, setBriefingMeta] = useState<any>(null);
  const [briefingRawDebug, setBriefingRawDebug] = useState<any>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingCollapsed, setBriefingCollapsed] = useState(false);
  const [debugCopied, setDebugCopied] = useState(false);
  const [pastNotes, setPastNotes] = useState<any[]>([]);
  const [pastBriefings, setPastBriefings] = useState<any[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const periodRef = useRef<HTMLDivElement>(null);

  const PERIODS = [
    { value: "this_week", label: "This Week" },
    { value: "last_week", label: "Last Week" },
    { value: "this_month", label: "This Month" },
    { value: "last_month", label: "Last Month" },
    { value: "this_year", label: "This Year" },
  ];

  // Auto-select for non-admin employees
  useEffect(() => {
    if (!isAdmin && teamMemberId && teamMembers.length > 0 && !selectedMemberId) {
      const self = teamMembers[0];
      if (self) setSelectedMemberId(String(self.id));
    }
  }, [isAdmin, teamMemberId, teamMembers, selectedMemberId]);

  // Fetch ticket stats per member (keep as fetch — computed server-side)
  useEffect(() => {
    fetch("/api/admin/meetings/stats")
      .then((r) => r.ok ? r.json() : [])
      .then((stats: { id: string; openTickets: number; overdueTickets: number }[]) => {
        const map = new Map<string, MemberStats>();
        for (const s of stats) map.set(s.id, s);
        setMemberStats(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setMemberDropdownOpen(false);
      if (periodRef.current && !periodRef.current.contains(e.target as Node)) setPeriodDropdownOpen(false);
    }
    if (memberDropdownOpen || periodDropdownOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [memberDropdownOpen, periodDropdownOpen]);

  const fetchData = useCallback(async () => {
    if (!selectedMemberId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/meetings?memberId=${selectedMemberId}&period=${period}&_t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        setData(await res.json());
        setReviewed(new Set());
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [selectedMemberId, period]);

  // Clear briefing only when member or period changes, not on every data refetch
  useEffect(() => {
    setBriefing(null);
    setBriefingMeta(null);
    setBriefingRawDebug(null);
    fetchData();
  }, [fetchData]);

  // Fetch past notes and briefings when member changes
  const fetchHistory = useCallback(async () => {
    if (!selectedMemberId) return;
    try {
      const [notesRes, briefingsRes] = await Promise.all([
        fetch(`/api/admin/meeting-notes?memberId=${selectedMemberId}`),
        fetch(`/api/admin/meetings/history?memberId=${selectedMemberId}`),
      ]);
      if (notesRes.ok) setPastNotes(await notesRes.json());
      if (briefingsRes.ok) setPastBriefings(await briefingsRes.json());
    } catch {}
  }, [selectedMemberId]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const selectedMember = teamMembers.find((m) => m.id === selectedMemberId);

  async function handleGenerateBriefing() {
    if (!selectedMemberId || briefingLoading) return;
    setBriefingLoading(true);
    setBriefing(null);
    setBriefingMeta(null);
    setBriefingRawDebug(null);
    setBriefingCollapsed(false);
    setDebugCopied(false);
    try {
      const res = await fetch("/api/admin/meetings/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: selectedMemberId, period }),
      });
      if (!res.ok || !res.body) {
        console.error("[Briefing] Response not OK:", res.status);
        setBriefingLoading(false);
        return;
      }
      // Read SSE stream — skip keepalive comments, parse data lines
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
      }
      // Extract the last "data: ..." line from the SSE stream
      const dataMatch = buffer.match(/data: (.+)\n/);
      if (dataMatch) {
        const result = JSON.parse(dataMatch[1]);
        if (result.error) {
          console.error("[Briefing] Server error:", result.error);
        } else {
          setBriefing(result.briefing);
          setBriefingMeta(result.generationMeta);
          setBriefingRawDebug(result.rawDebug);
        }
      }
    } catch (err) {
      console.error("[Briefing] Error:", err);
    }
    setBriefingLoading(false);
  }

  const CATEGORY_STYLES: Record<string, { dot: string; label: string }> = {
    recognition: { dot: "bg-green-500", label: "Recognition" },
    red_flag: { dot: "bg-red-500", label: "Red Flag" },
    accountability: { dot: "bg-orange-500", label: "Accountability" },
    coaching: { dot: "bg-blue-500", label: "Coaching" },
    planning: { dot: "bg-gray-400", label: "Planning" },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Monday Meeting</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Review tickets, set commitments, track accountability</p>
          {selectedMemberId && isAdmin && (
            <button
              onClick={handleGenerateBriefing}
              disabled={briefingLoading}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#FF9500] rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {briefingLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Generating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
                  </svg>
                  Generate Briefing
                </>
              )}
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
        {/* Period selector */}
        <div className="relative" ref={periodRef}>
          <button
            onClick={() => setPeriodDropdownOpen(!periodDropdownOpen)}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-white hover:border-gray-300 transition"
          >
            <span className="font-medium">{PERIODS.find((p) => p.value === period)?.label}</span>
            <svg className="w-3.5 h-3.5 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {periodDropdownOpen && (
            <div className="absolute right-0 top-full mt-1 w-full bg-white border border-[var(--border)] rounded-lg shadow-xl py-1 z-50 min-w-[140px]">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => { setPeriod(p.value); setPeriodDropdownOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition ${period === p.value ? "bg-[var(--accent-light)] font-medium" : ""}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
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
      </div>

      {!selectedMemberId && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {teamMembers.map((m) => {
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
          {/* Summary cards */}
          <div style={{ display: "flex", gap: 12, width: "100%" }}>
            <div style={{ flex: 1 }} className="border border-[#E5E5E5] rounded-xl p-3 bg-white">
              <div className="text-[10px] text-[#9CA3AF] mb-1">Reliability Score</div>
              <div className="text-2xl font-semibold">
                <span className={
                  data.reliability.score >= 80 ? "text-green-600" :
                  data.reliability.score >= 50 ? "text-yellow-600" : "text-red-600"
                }>
                  {data.reliability.total > 0 ? `${data.reliability.score}%` : "—"}
                </span>
              </div>
              <div className="text-[10px] text-[#9CA3AF] mt-1">Due dates hit</div>
            </div>
            <div style={{ flex: 1 }} className="border border-[#E5E5E5] rounded-xl p-3 bg-white">
              <div className="text-[10px] text-[#9CA3AF] mb-1">On Time</div>
              <div className="text-2xl font-semibold text-green-600">{data.reliability.onTime}</div>
              <div className="text-[10px] text-[#9CA3AF] mt-1">Closed before due</div>
            </div>
            <div style={{ flex: 1 }} className="border border-[#E5E5E5] rounded-xl p-3 bg-white">
              <div className="text-[10px] text-[#9CA3AF] mb-1">Missed</div>
              <div className="text-2xl font-semibold text-red-600">{data.reliability.missed}</div>
              <div className="text-[10px] text-[#9CA3AF] mt-1">Closed after due</div>
            </div>
            <div style={{ flex: 1 }} className="border border-[#E5E5E5] rounded-xl p-3 bg-white">
              <div className="text-[10px] text-[#9CA3AF] mb-1">Due This Week</div>
              <div className="text-2xl font-semibold text-[#1A1A1A]">{data.dueThisWeek.length}</div>
              <div className="text-[10px] text-[#9CA3AF] mt-1">Upcoming deadlines</div>
            </div>
          </div>

          {/* Work metrics row */}
          <div style={{ display: "flex", gap: 12, width: "100%" }}>
            <div style={{ flex: 1 }} className="border border-[#E5E5E5] rounded-xl p-3 bg-white">
              <div className="text-[10px] text-[#9CA3AF] mb-1">Logged / Clocked</div>
              <div className="text-2xl font-semibold text-[#1A1A1A]">
                {data.workMetrics.loggedHours.toFixed(1)}h
                <span className="text-[#9CA3AF] font-normal text-lg"> / {data.workMetrics.clockedHours.toFixed(1)}h</span>
              </div>
              <div className="text-[10px] text-[#9CA3AF] mt-1">{data.workMetrics.utilizationPct}% utilization</div>
            </div>
            <div style={{ flex: 1 }} className="border border-[#E5E5E5] rounded-xl p-3 bg-white">
              <div className="text-[10px] text-[#9CA3AF] mb-1">Tickets Closed</div>
              <div className="text-2xl font-semibold text-[#FF9500]">{data.workMetrics.ticketsClosed}</div>
              <div className="text-[10px] text-[#9CA3AF] mt-1">In this period</div>
            </div>
            <div style={{ flex: 1 }} className="border border-[#E5E5E5] rounded-xl p-3 bg-white">
              <div className="text-[10px] text-[#9CA3AF] mb-1">Avg Resolution</div>
              <div className="text-2xl font-semibold text-[#1A1A1A]">
                {data.workMetrics.avgResolutionHours < 24
                  ? `${data.workMetrics.avgResolutionHours.toFixed(1)}h`
                  : `${(data.workMetrics.avgResolutionHours / 24).toFixed(1)}d`}
              </div>
              <div className="text-[10px] text-[#9CA3AF] mt-1">Create to close</div>
            </div>
            <div style={{ flex: 1 }} className="border border-[#E5E5E5] rounded-xl p-3 bg-white">
              <div className="text-[10px] text-[#9CA3AF] mb-1">Velocity</div>
              <div className="text-2xl font-semibold text-[#1A1A1A]">{data.workMetrics.avgClosedPerWeek}</div>
              <div className="text-[10px] text-[#9CA3AF] mt-1">Tickets / week</div>
            </div>
          </div>

          {/* AI Briefing */}
          {briefing && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setBriefingCollapsed(!briefingCollapsed)}
                  className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]"
                >
                  <svg className={`w-3.5 h-3.5 text-[#FF9500] transition-transform ${briefingCollapsed ? "" : "rotate-90"}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                  AI Briefing
                </button>
                <div className="flex items-center gap-3">
                  {briefingMeta && (
                    <span className="text-[10px] text-[#9CA3AF]">
                      {briefingMeta.inputTokens.toLocaleString()} input · {briefingMeta.outputTokens.toLocaleString()} output · {(briefingMeta.durationMs / 1000).toFixed(1)}s
                    </span>
                  )}
                  {briefingRawDebug && (
                    <button
                      onClick={() => {
                        const debugPayload = {
                          generatedAt: new Date().toISOString(),
                          model: briefingMeta?.model,
                          inputTokens: briefingMeta?.inputTokens,
                          outputTokens: briefingMeta?.outputTokens,
                          durationMs: briefingMeta?.durationMs,
                          traceId: briefingMeta?.traceId,
                          systemPrompt: briefingRawDebug.systemPrompt,
                          dataFedToModel: briefingRawDebug.userPrompt,
                          rawModelOutput: briefingRawDebug.rawOutput,
                          parsedBriefing: briefing,
                        };
                        navigator.clipboard.writeText(JSON.stringify(debugPayload, null, 2));
                        setDebugCopied(true);
                        setTimeout(() => setDebugCopied(false), 2000);
                      }}
                      className="text-[10px] text-[var(--accent)] hover:underline"
                    >
                      {debugCopied ? "Copied!" : "Copy raw data"}
                    </button>
                  )}
                </div>
              </div>

              {!briefingCollapsed && (
                <div className="space-y-3">
                  {/* Member summary */}
                  <div className="bg-white rounded-xl border border-[var(--border)] p-4">
                    <p className="text-sm text-[var(--foreground)]">{briefing.memberSummary}</p>
                  </div>

                  {/* Discussion points */}
                  {briefing.questions?.map((q: any, i: number) => {
                    const style = CATEGORY_STYLES[q.category] || CATEGORY_STYLES.planning;
                    return (
                      <div key={i} className="bg-white rounded-xl border border-[var(--border)] p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${style.dot}`} />
                          <span className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider">{style.label}</span>
                          <span className="text-xs font-semibold text-[var(--foreground)]">{q.topic}</span>
                        </div>
                        <p className="text-sm text-[var(--foreground)] leading-relaxed">{q.question}</p>
                        {q.suggestedFollowUp && (
                          <p className="text-xs text-[var(--muted)] mt-2">Follow-up: {q.suggestedFollowUp}</p>
                        )}
                      </div>
                    );
                  })}

                  {/* Observations */}
                  {briefing.observations?.length > 0 && (
                    <div className="bg-white rounded-xl border border-[var(--border)] p-4">
                      <h4 className="text-xs font-semibold text-[var(--foreground)] mb-2">Key Observations</h4>
                      <div className="space-y-1.5">
                        {briefing.observations.map((o: any, i: number) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className={`inline-block w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                              o.severity === "critical" ? "bg-red-500" :
                              o.severity === "warning" ? "bg-amber-500" : "bg-blue-400"
                            }`} />
                            <span className="text-xs text-[var(--foreground)]">{o.observation}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Meeting History — past notes & briefings */}
          {(pastNotes.length > 0 || pastBriefings.length > 0) && (
            <div className="space-y-2">
              <button
                onClick={() => setHistoryExpanded(!historyExpanded)}
                className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]"
              >
                <svg className={`w-3.5 h-3.5 text-[var(--muted)] transition-transform ${historyExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
                Meeting History
                <span className="text-xs font-normal text-[var(--muted)]">
                  {pastNotes.length} note{pastNotes.length !== 1 ? "s" : ""} · {pastBriefings.length} briefing{pastBriefings.length !== 1 ? "s" : ""}
                </span>
              </button>

              {historyExpanded && (
                <div className="space-y-4">
                  {/* Past Meeting Notes */}
                  {pastNotes.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-[var(--foreground)] mb-2 px-1">Meeting Notes</h4>
                      <div className="space-y-1.5">
                        {pastNotes.map((note: any) => (
                          <div key={note.id} className="bg-white rounded-lg border border-[var(--border)] px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-xs font-medium text-[var(--foreground)] shrink-0">
                                {new Date(note.meeting_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                              </span>
                              <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 text-[var(--muted)] shrink-0">
                                {note.interaction_type === "team_meeting" ? "Meeting" : note.interaction_type === "client_email" ? "Email" : note.interaction_type === "client_phone_call" ? "Phone" : note.interaction_type || "Note"}
                              </span>
                              <span className="text-xs text-[var(--muted)] truncate">
                                {note.summary || (note.transcript ? note.transcript.slice(0, 80) + "..." : "No summary")}
                              </span>
                            </div>
                            <button
                              onClick={async () => {
                                if (!confirm("Delete this meeting note? This is permanent.")) return;
                                try {
                                  await fetch("/api/admin/meeting-notes", {
                                    method: "DELETE",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ id: note.id }),
                                  });
                                  setPastNotes((prev) => prev.filter((n: any) => n.id !== note.id));
                                } catch {}
                              }}
                              className="p-1 text-[var(--muted)] hover:text-red-600 transition shrink-0"
                              title="Delete note"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Past Briefings */}
                  {pastBriefings.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-[var(--foreground)] mb-2 px-1">Past Briefings</h4>
                      <div className="space-y-1.5">
                        {pastBriefings.map((b: any) => (
                          <div key={b._id} className="bg-white rounded-lg border border-[var(--border)] px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-xs font-medium text-[var(--foreground)] shrink-0">
                                {b.meetingDate ? new Date(b.meetingDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "Unknown"}
                              </span>
                              <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 shrink-0">
                                Briefing
                              </span>
                              <span className="text-xs text-[var(--muted)] truncate">
                                {b.briefingData?.memberSummary?.slice(0, 80) || "No summary"}...
                              </span>
                            </div>
                            <button
                              onClick={async () => {
                                if (!confirm("Delete this briefing? This is permanent and will remove it from future AI context.")) return;
                                try {
                                  await fetch("/api/admin/meetings/history", {
                                    method: "DELETE",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ id: b._id }),
                                  });
                                  setPastBriefings((prev) => prev.filter((x: any) => x._id !== b._id));
                                } catch {}
                              }}
                              className="p-1 text-[var(--muted)] hover:text-red-600 transition shrink-0"
                              title="Delete briefing"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Ticket groups — separate tables with headings outside */}
          {data.overdue.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span className="text-sm font-semibold text-[var(--foreground)]">Overdue</span>
                <span className="text-xs text-[var(--muted)]">{data.overdue.length}</span>
              </div>
              <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="pl-4 pr-2 py-2 text-left font-medium text-[var(--muted)] text-xs w-[260px] max-w-[260px]">Name</th>
                      <th className="px-2 py-2 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Client</th>
                      <th className="px-2 py-2 text-left font-medium text-[var(--muted)] text-xs w-28">Status</th>
                      <th className="px-2 py-2 text-left font-medium text-[var(--muted)] text-xs w-[100px]">Days Overdue</th>
                      <th className="px-2 py-2 text-left font-medium text-[var(--muted)] text-xs w-[68px]">Due</th>
                      <th className="px-2 pr-4 py-2 text-left font-medium text-[var(--muted)] text-xs w-16">Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.overdue.map((ticket) => <MeetingTableRowSimple key={ticket.id} ticket={ticket} showDaysOverdue onOpenTicket={setOpenTicketId} />)}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.needsAttention.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                <span className="text-sm font-semibold text-[var(--foreground)]">Backlog</span>
                <span className="text-xs text-[var(--muted)]">{data.needsAttention.length}</span>
              </div>
              <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="pl-4 pr-2 py-2 text-left font-medium text-[var(--muted)] text-xs w-[260px] max-w-[260px]">Name</th>
                      <th className="px-2 py-2 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Client</th>
                      <th className="px-2 py-2 text-left font-medium text-[var(--muted)] text-xs w-28">Status</th>
                      <th className="px-2 py-2 text-left font-medium text-[var(--muted)] text-xs w-[100px]"></th>
                      <th className="px-2 py-2 text-left font-medium text-[var(--muted)] text-xs w-[68px]">Due</th>
                      <th className="px-2 pr-4 py-2 text-left font-medium text-[var(--muted)] text-xs w-16">Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.needsAttention.map((ticket) => <MeetingTableRowSimple key={ticket.id} ticket={ticket} onOpenTicket={setOpenTicketId} />)}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.inProgress.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span className="text-sm font-semibold text-[var(--foreground)]">In Progress</span>
                <span className="text-xs text-[var(--muted)]">{data.inProgress.length}</span>
              </div>
              <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="pl-4 pr-2 py-2 text-left font-medium text-[var(--muted)] text-xs w-[260px] max-w-[260px]">Name</th>
                      <th className="px-2 py-2 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Client</th>
                      <th className="px-2 py-2 text-left font-medium text-[var(--muted)] text-xs w-28">Status</th>
                      <th className="px-2 py-2 text-left font-medium text-[var(--muted)] text-xs w-[100px]"></th>
                      <th className="px-2 py-2 text-left font-medium text-[var(--muted)] text-xs w-[68px]">Due</th>
                      <th className="px-2 pr-4 py-2 text-left font-medium text-[var(--muted)] text-xs w-16">Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.inProgress.map((ticket) => <MeetingTableRowSimple key={ticket.id} ticket={ticket} onOpenTicket={setOpenTicketId} />)}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.dueThisWeek.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                <span className="text-sm font-semibold text-[var(--foreground)]">Due This Week</span>
                <span className="text-xs text-[var(--muted)]">{data.dueThisWeek.length}</span>
              </div>
              <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="pl-4 pr-2 py-2 text-left font-medium text-[var(--muted)] text-xs w-[260px] max-w-[260px]">Name</th>
                      <th className="px-2 py-2 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Client</th>
                      <th className="px-2 py-2 text-left font-medium text-[var(--muted)] text-xs w-28">Status</th>
                      <th className="px-2 py-2 text-left font-medium text-[var(--muted)] text-xs w-[100px]"></th>
                      <th className="px-2 py-2 text-left font-medium text-[var(--muted)] text-xs w-[68px]">Due</th>
                      <th className="px-2 pr-4 py-2 text-left font-medium text-[var(--muted)] text-xs w-16">Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dueThisWeek.map((ticket) => <MeetingTableRowSimple key={ticket.id} ticket={ticket} onOpenTicket={setOpenTicketId} />)}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.overdue.length === 0 && data.needsAttention.length === 0 && data.inProgress.length === 0 && data.dueThisWeek.length === 0 && (
            <div className="text-center py-16 text-sm text-[var(--muted)]">
              No open tickets for this team member.
            </div>
          )}

          {/* Meeting Notes — embedded MeetingNotesIngestion with member pre-selected */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--foreground)] px-1">Meeting Notes</h3>
            <MeetingNotesIngestion
              roleLevel={roleLevel || "owner"}
              teamMemberId={selectedMemberId!}
              presetMemberId={selectedMemberId!}
            />
          </div>
        </>
      )}

      {/* Ticket detail modal */}
      {openTicketId && (
        <TicketDetailModal
          ticketId={openTicketId}
          teamMembers={allTeamMembers}
          onClose={() => setOpenTicketId(null)}
          onTicketUpdated={fetchData}
        />
      )}
    </div>
  );
}

// === Simple Meeting Table Row ===

function MeetingTableRowSimple({ ticket, showDaysOverdue, onOpenTicket }: { ticket: MeetingTicket; showDaysOverdue?: boolean; onOpenTicket?: (id: string) => void }) {
  const today = new Date().toISOString().split("T")[0];
  const isOverdue = ticket.dueDate && ticket.dueDate < today && isOverdueEligible(ticket.status);
  const daysOverdue = isOverdue && ticket.dueDate
    ? Math.ceil((Date.now() - new Date(ticket.dueDate + "T23:59:59").getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const priColor = PRIORITY_COLORS_MAP[ticket.priority] || PRIORITY_COLORS_MAP.normal;

  return (
    <tr
      className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--hover-tan)] transition cursor-pointer"
      onClick={() => onOpenTicket?.(ticket.id)}
    >
      <td className="pl-4 pr-2 py-2.5 w-[260px] max-w-[260px]">
        <div className="flex items-center gap-2 min-w-0">
          <StatusDot status={ticket.status as Parameters<typeof StatusDot>[0]["status"]} size={10} />
          <span className="font-mono text-[10px] text-[var(--muted)] shrink-0">{ticket.ticketNumber}</span>
          <span className="text-sm text-[var(--foreground)] truncate">{ticket.title}</span>
        </div>
      </td>
      <td className="px-2 py-2.5 text-xs text-[var(--muted)] whitespace-nowrap">{ticket.clientName || "—"}</td>
      <td className="px-2 py-2.5 whitespace-nowrap">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_PILL_COLORS_MAP[ticket.status] || "bg-gray-100 text-gray-600"}`}>
          {STATUS_LABELS_MAP[ticket.status] || ticket.status}
        </span>
      </td>
      <td className="px-2 py-2.5 text-xs">
        {showDaysOverdue && daysOverdue > 0 ? (
          <span className="text-red-600 font-semibold">{daysOverdue}d</span>
        ) : (
          <span className="text-[var(--muted)]">—</span>
        )}
      </td>
      <td className="px-2 py-2.5 text-xs whitespace-nowrap">
        {ticket.dueDate ? (
          <span className={isOverdue ? "text-red-600 font-medium" : "text-[var(--foreground)]"}>
            {friendlyDate(ticket.dueDate)}
          </span>
        ) : (
          <span className="text-[var(--muted)]">—</span>
        )}
      </td>
      <td className="px-2 pr-4 py-2.5">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill={priColor} stroke={priColor} strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" />
        </svg>
      </td>
    </tr>
  );
}

const STATUS_LABELS_MAP: Record<string, string> = {
  needs_attention: "Backlog",
  stuck: "Stuck",
  in_progress: "In Progress",
  qa_ready: "QA Ready",
  client_review: "Client Review",
  approved_go_live: "Go Live",
  closed: "Closed",
};

const STATUS_PILL_COLORS_MAP: Record<string, string> = {
  needs_attention: "bg-orange-100 text-orange-700",
  stuck: "bg-red-100 text-red-700",
  in_progress: "bg-blue-100 text-blue-700",
  qa_ready: "bg-purple-100 text-purple-700",
  client_review: "bg-amber-100 text-amber-700",
  approved_go_live: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-600",
};

const PRIORITY_COLORS_MAP: Record<string, string> = {
  urgent: "#EF4444",
  high: "#F97316",
  normal: "#3B82F6",
  low: "#9CA3AF",
};
