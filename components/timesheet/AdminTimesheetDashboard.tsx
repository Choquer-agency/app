"use client";

import { useState, useEffect } from "react";
import type { TimesheetEntry, TimesheetBreak, VacationRequest, TimesheetChangeRequest } from "@/types";
import PeriodDetailModal from "./PeriodDetailModal";
import TimeCardModal from "./TimeCardModal";

function formatTime(iso: string | null) {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

function formatDuration(minutes: number) {
  if (!minutes || minutes <= 0) return "0h 0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function formatDateForDisplay(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

const CLOCK_IN_ROLES = new Set(["employee", "intern"]);

export default function AdminTimesheetDashboard({ teamMemberId }: { teamMemberId: string }) {
  const [activeTab, setActiveTab] = useState<"daily" | "period">("daily");
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [pendingVacation, setPendingVacation] = useState<VacationRequest[]>([]);
  const [pendingChanges, setPendingChanges] = useState<TimesheetChangeRequest[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewDate, setViewDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [showReviewOnly, setShowReviewOnly] = useState(false);
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 13);
    return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
  });

  // TimeCardModal state
  const [selectedEntry, setSelectedEntry] = useState<TimesheetEntry | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedEmployeeName, setSelectedEmployeeName] = useState<string>("");
  const [isTimeCardOpen, setIsTimeCardOpen] = useState(false);

  // PeriodDetailModal state
  const [periodDetailEmployee, setPeriodDetailEmployee] = useState<any>(null);
  const [periodDetailEntries, setPeriodDetailEntries] = useState<TimesheetEntry[]>([]);
  const [isPeriodDetailOpen, setIsPeriodDetailOpen] = useState(false);

  const [selectedBreaks, setSelectedBreaks] = useState<TimesheetBreak[]>([]);

  async function openTimeCard(entry: TimesheetEntry | null, date: string, employeeName: string) {
    setSelectedEntry(entry);
    setSelectedDate(date);
    setSelectedEmployeeName(employeeName);
    setIsTimeCardOpen(true);
    // Fetch breaks for this entry
    if (entry?.id) {
      try {
        const res = await fetch(`/api/admin/timesheet/break/list?entryId=${entry.id}`);
        if (res.ok) setSelectedBreaks(await res.json());
        else setSelectedBreaks([]);
      } catch { setSelectedBreaks([]); }
    } else {
      setSelectedBreaks([]);
    }
  }

  function closeTimeCard() {
    setIsTimeCardOpen(false);
    setSelectedEntry(null);
  }

  function openPeriodDetail(emp: any, empEntries: TimesheetEntry[]) {
    setPeriodDetailEmployee(emp);
    setPeriodDetailEntries(empEntries);
    setIsPeriodDetailOpen(true);
  }

  async function handleTimeCardSave(updates: Partial<TimesheetEntry>) {
    if (!selectedEntry) return;
    try {
      await fetch("/api/admin/timesheet/entries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: selectedEntry.id, ...updates }),
      });
      closeTimeCard();
      fetchAll();
    } catch { /* silent */ }
  }

  async function handleTimeCardDelete(entryId: string) {
    try {
      await fetch(`/api/admin/timesheet/entries?id=${entryId}`, { method: "DELETE" });
      closeTimeCard();
      fetchAll();
    } catch { /* silent */ }
  }

  async function fetchAll() {
    setLoading(true);
    try {
      const startDate = activeTab === "daily" ? viewDate : dateRange.start;
      const endDate = activeTab === "daily" ? viewDate : dateRange.end;
      const [entriesRes, vacRes, changeRes, membersRes] = await Promise.all([
        fetch(`/api/admin/timesheet/entries?startDate=${startDate}&endDate=${endDate}`),
        fetch("/api/admin/timesheet/vacation/pending"),
        fetch("/api/admin/timesheet/change-request/pending"),
        fetch("/api/admin/team"),
      ]);
      if (entriesRes.ok) setEntries(await entriesRes.json());
      if (vacRes.ok) setPendingVacation(await vacRes.json());
      if (changeRes.ok) setPendingChanges(await changeRes.json());
      if (membersRes.ok) setMembers(await membersRes.json());
    } catch { /* silent */ } finally { setLoading(false); }
  }

  useEffect(() => { fetchAll(); }, [viewDate, dateRange, activeTab]);

  const memberMap = new Map(members.map((m: any) => [m.id ?? m._id, m]));
  function getMember(id: string) { return memberMap.get(id); }
  function getMemberName(id: string) { return memberMap.get(id)?.name ?? "Unknown"; }

  const today = new Date().toISOString().split("T")[0];
  const pendingReviewCount = pendingVacation.length + pendingChanges.length;

  function handleDateChange(days: number) {
    const d = new Date(viewDate);
    d.setDate(d.getDate() + days);
    setViewDate(d.toISOString().split("T")[0]);
  }

  async function handleVacationReview(requestId: string, action: "approve" | "deny") {
    const note = action === "deny" ? prompt("Reason for denial (optional):") : undefined;
    await fetch("/api/admin/timesheet/vacation/review", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, action, reviewNote: note ?? undefined }),
    });
    fetchAll();
  }

  async function handleChangeReview(requestId: string, action: "approve" | "deny") {
    const note = action === "deny" ? prompt("Reason for denial (optional):") : undefined;
    await fetch("/api/admin/timesheet/change-request/review", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, action, reviewNote: note ?? undefined }),
    });
    fetchAll();
  }

  // Deduplicate members by email, only clock-in roles
  // Build email → all member IDs mapping so we can find entries across duplicate records
  const emailToIds = new Map<string, string[]>();
  for (const m of members) {
    const email = (m.email || "").toLowerCase();
    const id = m.id ?? m._id;
    const existing = emailToIds.get(email) ?? [];
    existing.push(id);
    emailToIds.set(email, existing);
  }

  const deduped = (() => {
    const seen = new Set<string>();
    return members.filter((m: any) => {
      if (m.active === false) return false;
      // Hide employees on leave, terminated, etc.
      const status = m.employeeStatus;
      if (status && status !== "active") return false;
      if (!CLOCK_IN_ROLES.has(m.roleLevel ?? "employee")) return false;
      const email = (m.email || "").toLowerCase();
      if (seen.has(email)) return false;
      seen.add(email);
      return true;
    }).sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
  })();

  // Helper: find entry for a member, checking ALL duplicate IDs for same email
  function findEntryForMember(m: any, date: string): TimesheetEntry | null {
    const email = (m.email || "").toLowerCase();
    const allIds = emailToIds.get(email) ?? [m.id ?? m._id];
    for (const id of allIds) {
      const entry = entries.find((e) => e.teamMemberId === id && e.date === date);
      if (entry) return entry;
    }
    return null;
  }

  // Helper: find ALL entries for a member across duplicate IDs
  function findAllEntriesForMember(m: any): TimesheetEntry[] {
    const email = (m.email || "").toLowerCase();
    const allIds = new Set(emailToIds.get(email) ?? [m.id ?? m._id]);
    return entries.filter((e) => allIds.has(e.teamMemberId));
  }

  // --- Period Summaries (aggregated per employee, matches Ollie exactly) ---
  const periodSummaries = deduped.map((emp: any) => {
    const empEntries = findAllEntriesForMember(emp);

    let totalMinutes = 0;
    let daysWorked = 0;
    let sickDays = 0;
    let vacationDays = 0;

    empEntries.forEach((entry) => {
      if (entry.isSickDay) {
        sickDays++;
        if (entry.workedMinutes && entry.workedMinutes > 0) {
          totalMinutes += entry.workedMinutes;
          daysWorked++;
        }
      } else if (entry.isVacation) {
        vacationDays++;
      } else {
        totalMinutes += entry.workedMinutes ?? 0;
        if ((entry.workedMinutes ?? 0) > 0) daysWorked++;
      }
    });

    const hours = totalMinutes / 60;
    const pay = hours * (emp.hourlyRate || 0);

    return { employee: emp, totalMinutes, totalPay: pay, daysWorked, sickDays, vacationDays };
  }).filter((s: any) => s.totalMinutes > 0 || s.sickDays > 0 || s.vacationDays > 0);

  const totalPayroll = periodSummaries.reduce((acc: number, s: any) => acc + s.totalPay, 0);
  const totalPeriodMinutes = periodSummaries.reduce((acc: number, s: any) => acc + s.totalMinutes, 0);

  // Daily summaries — uses findEntryForMember to check all duplicate IDs
  type DailySummary = { member: any; entry: TimesheetEntry | null };
  const dailySummaries: DailySummary[] = deduped.map((m: any) => {
    const entry = findEntryForMember(m, viewDate);
    return { member: m, entry };
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF9500]" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 pb-20">
      {/* Tab Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-end gap-6 mb-8">
        <div className="flex items-center gap-2">
          {activeTab === "daily" && pendingReviewCount > 0 && (
            <button
              onClick={() => setShowReviewOnly(!showReviewOnly)}
              className={`relative p-3 rounded-full transition-all ${showReviewOnly ? "bg-red-600 text-white shadow-md" : "bg-white text-[#6B6B6B] hover:text-[#1A1A1A] border border-[#F6F5F1] shadow-sm"}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              {!showReviewOnly && (
                <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-lg">
                  {pendingReviewCount}
                </span>
              )}
            </button>
          )}
          <div className="flex items-center gap-2 bg-white p-1 rounded-full border border-[#F6F5F1] shadow-sm">
            <button
              onClick={() => { setActiveTab("daily"); setShowReviewOnly(false); }}
              className={`px-4 py-2 text-sm font-medium rounded-full transition-all whitespace-nowrap ${activeTab === "daily" ? "bg-[#FF9500] text-white shadow-md" : "text-[#6B6B6B] hover:text-[#1A1A1A]"}`}
            >
              Daily Review
            </button>
            <button
              onClick={() => { setActiveTab("period"); setShowReviewOnly(false); }}
              className={`px-4 py-2 text-sm font-medium rounded-full transition-all whitespace-nowrap ${activeTab === "period" ? "bg-[#FF9500] text-white shadow-md" : "text-[#6B6B6B] hover:text-[#1A1A1A]"}`}
            >
              Pay Period
            </button>
          </div>
        </div>
      </div>

      {/* ===================== DAILY VIEW ===================== */}
      {activeTab === "daily" && (
        <>
          {/* Date Navigator */}
          {!showReviewOnly && (
            <div className="flex items-center justify-center gap-6 mb-8">
              <button onClick={() => handleDateChange(-1)} className="p-2 text-[#9CA3AF] hover:text-[#1A1A1A] hover:bg-[#F0EEE6] rounded-full transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div className="text-center w-48">
                <span className="block text-lg font-semibold text-[#1A1A1A]">{formatDateForDisplay(viewDate)}</span>
                {viewDate === today && <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Today</span>}
              </div>
              <button onClick={() => handleDateChange(1)} className="p-2 text-[#9CA3AF] hover:text-[#1A1A1A] hover:bg-[#F0EEE6] rounded-full transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          )}

          {showReviewOnly && (
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-bold text-[#1A1A1A] mb-2">Pending Reviews</h2>
              <p className="text-[#6B6B6B] text-sm">Showing all pending time card changes and vacation requests</p>
            </div>
          )}

          {/* Pending requests */}
          {pendingVacation.length > 0 && (
            <div className="space-y-3 mb-6">
              {pendingVacation.map((req) => (
                <div key={req.id} className="bg-purple-50 border border-purple-200 rounded-2xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center"><span className="text-2xl">✈️</span></div>
                    <div className="flex-1">
                      <h4 className="font-bold text-purple-900 text-base mb-1">{getMemberName(req.teamMemberId)} — Vacation Request</h4>
                      <p className="text-sm text-purple-700">{formatDateForDisplay(req.startDate)} – {formatDateForDisplay(req.endDate)} ({req.totalDays} day{req.totalDays !== 1 ? "s" : ""}){req.reason ? ` — ${req.reason}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-4">
                    <button onClick={() => handleVacationReview(req.id, "deny")} className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-sm font-medium">Deny</button>
                    <button onClick={() => handleVacationReview(req.id, "approve")} className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-sm font-medium">Approve</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {pendingChanges.length > 0 && (
            <div className="space-y-3 mb-6">
              {pendingChanges.map((req) => (
                <div key={req.id} className="bg-[#FFF7ED] border border-[#FDBA74] rounded-2xl p-4">
                  <h4 className="font-bold text-[#1A1A1A] text-base">{getMemberName(req.teamMemberId)} — Change Request</h4>
                  <p className="text-sm text-[#1A1A1A]">{req.reason}</p>
                  <div className="space-y-1 text-xs text-[#6B6B6B] mt-2">
                    <div className="flex justify-between"><span>Original:</span><span className="font-mono">{formatTime(req.originalClockIn)} – {formatTime(req.originalClockOut)}</span></div>
                    <div className="flex justify-between"><span>Proposed:</span><span className="font-mono">{formatTime(req.proposedClockIn)} – {formatTime(req.proposedClockOut)}</span></div>
                    {req.minutesDelta !== null && (
                      <div className={`flex justify-between font-bold ${req.minutesDelta > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        <span>Adjustment:</span><span>{req.minutesDelta > 0 ? "+" : ""}{req.minutesDelta}m</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3 mt-4">
                    <button onClick={() => handleChangeReview(req.id, "deny")} className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-sm font-medium">Deny</button>
                    <button onClick={() => handleChangeReview(req.id, "approve")} className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-sm font-medium">Approve</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Mobile Card Layout (matches Ollie exactly) */}
          <div className="md:hidden space-y-4">
            {dailySummaries.map(({ member, entry }) => (
              <div
                key={member.id ?? member._id}
                onClick={() => openTimeCard(entry, viewDate, member.name)}
                className="bg-white p-4 rounded-2xl shadow-sm border border-[#F6F5F1] active:scale-[0.98] transition-transform cursor-pointer"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="font-bold text-[#1A1A1A]">{member.name}</div>
                    <div className="text-xs text-[#6B6B6B]">{member.role}</div>
                  </div>
                  {entry?.clockInTime && !entry.isSickDay && !entry.isVacation ? (
                    <div className="text-right">
                      <div className="text-lg font-bold text-[#1A1A1A]">{formatDuration(entry.workedMinutes ?? 0)}</div>
                      <div className="text-xs text-[#9CA3AF] font-mono">
                        {formatTime(entry.clockInTime)} – {formatTime(entry.clockOutTime)}
                      </div>
                    </div>
                  ) : entry?.isSickDay ? (
                    <div className="px-3 py-1 bg-rose-100 text-rose-700 text-xs font-bold rounded-full">SICK DAY</div>
                  ) : entry?.isVacation ? (
                    <div className="px-3 py-1 bg-sky-100 text-sky-700 text-xs font-bold rounded-full">VACATION</div>
                  ) : (
                    <div className="text-xs text-[#E5E3DA] italic">No Time</div>
                  )}
                </div>
                <div className="flex justify-between items-center border-t border-[#F6F5F1] pt-3">
                  <div className="flex gap-2 flex-wrap">
                    {entry ? <EntryIssueBadges entry={entry} /> : <span className="text-[10px] text-[#9CA3AF]">No Issues</span>}
                  </div>
                  <span className="text-xs text-[#9CA3AF]">Tap to edit</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table Layout */}
          <div className="hidden md:block bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.04)] border border-[#F6F5F1] overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#F6F5F1] bg-[#F0EEE6]">
                  <th className="py-4 px-5 text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">Employee</th>
                  <th className="py-4 px-4 text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">Time Range</th>
                  <th className="py-4 px-4 text-xs font-bold text-[#6B6B6B] uppercase tracking-wider text-right">Worked</th>
                  <th className="py-4 px-4 text-xs font-bold text-[#6B6B6B] uppercase tracking-wider text-right">Break</th>
                  <th className="py-4 px-4 text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F6F5F1]">
                {dailySummaries.map(({ member, entry }) => (
                  <tr
                    key={member.id ?? member._id}
                    className="hover:bg-[#F0EEE6] cursor-pointer transition-colors"
                    onClick={() => openTimeCard(entry, viewDate, member.name)}
                  >
                    <td className="py-4 px-5">
                      <div className="font-medium text-[#1A1A1A]">{member.name}</div>
                      <div className="text-xs text-[#6B6B6B]">{member.role}</div>
                    </td>
                    <td className="py-4 px-4 font-mono text-sm text-[#484848]">
                      {entry?.clockInTime && !entry.isSickDay && !entry.isVacation ? (
                        <>{formatTime(entry.clockInTime)} <span className="text-[#E5E3DA] mx-1">–</span> {formatTime(entry.clockOutTime)}</>
                      ) : entry?.isSickDay ? <span className="text-rose-400">Sick Day</span>
                      : entry?.isVacation ? <span className="text-sky-400">Vacation</span>
                      : <span className="text-[#E5E3DA]">--:--</span>}
                    </td>
                    <td className="py-4 px-4 text-right font-medium text-[#1A1A1A]">{entry?.workedMinutes ? formatDuration(entry.workedMinutes) : "—"}</td>
                    <td className="py-4 px-4 text-right text-[#6B6B6B] text-sm">{entry?.totalBreakMinutes ? formatDuration(entry.totalBreakMinutes) : "—"}</td>
                    <td className="py-4 px-4">
                      {entry ? <EntryBadge entry={entry} /> : <span className="text-[#E5E3DA] italic text-xs">No Entry</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ===================== PAY PERIOD VIEW (matches Ollie exactly) ===================== */}
      {activeTab === "period" && (
        <>
          {/* Date Range Card (matches Ollie's styled date pickers) */}
          <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.04)] border border-[#F6F5F1] p-6 mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 flex items-center gap-4">
              <div>
                <label className="block text-xs font-bold text-[#6B6B6B] mb-1.5">Start date</label>
                <input type="date" value={dateRange.start} onChange={(e) => setDateRange((r) => ({ ...r, start: e.target.value }))}
                  className="px-4 py-2.5 bg-[#F0EEE6] border border-[#E5E3DA] rounded-full text-sm text-[#1A1A1A] focus:ring-2 focus:ring-[#FF9500] outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#6B6B6B] mb-1.5">End date</label>
                <input type="date" value={dateRange.end} onChange={(e) => setDateRange((r) => ({ ...r, end: e.target.value }))}
                  className="px-4 py-2.5 bg-[#F0EEE6] border border-[#E5E3DA] rounded-full text-sm text-[#1A1A1A] focus:ring-2 focus:ring-[#FF9500] outline-none" />
              </div>
            </div>
            <button
              onClick={async () => {
                const email = prompt("Enter bookkeeper email:");
                if (!email) return;
                try {
                  await fetch("/api/admin/timesheet/email/bookkeeper", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      bookkeeperEmail: email,
                      companyName: "Choquer Agency",
                      periodStart: dateRange.start,
                      periodEnd: dateRange.end,
                      employees: periodSummaries.map((s: any) => ({
                        name: s.employee.name,
                        hours: formatDuration(s.totalMinutes),
                        decimalHours: (s.totalMinutes / 60).toFixed(2),
                        sickHours: s.sickDays > 0 ? `${s.sickDays * 8}h` : "",
                        vacationDays: s.vacationDays,
                      })),
                    }),
                  });
                  alert("Report sent!");
                } catch {
                  alert("Failed to send report.");
                }
              }}
              className="px-6 py-2.5 bg-[#FF9500] text-white rounded-lg text-sm font-medium hover:bg-[#E68600] transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              Send to Bookkeeper
            </button>
          </div>

          {/* Summary Cards (matches Ollie: Total hours, Total payroll (green), Team members) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-6">
            <div className="bg-white p-6 rounded-2xl border border-[#F6F5F1] shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
              <h3 className="text-xs font-bold uppercase text-[#6B6B6B] mb-2">Total hours</h3>
              <div className="text-2xl md:text-3xl font-bold text-[#1A1A1A]">{formatDuration(totalPeriodMinutes)}</div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-[#F6F5F1] shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
              <h3 className="text-xs font-bold uppercase text-[#6B6B6B] mb-2">Total payroll</h3>
              <div className="text-2xl md:text-3xl font-bold text-[#FF9500]">{formatCurrency(totalPayroll)}</div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-[#F6F5F1] shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
              <h3 className="text-xs font-bold uppercase text-[#6B6B6B] mb-2">Team members</h3>
              <div className="text-2xl md:text-3xl font-bold text-[#1A1A1A]">{periodSummaries.length}</div>
            </div>
          </div>

          {/* Period Table (aggregated per employee, matches Ollie exactly) */}
          <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.04)] border border-[#F6F5F1] overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#F6F5F1] bg-[#F0EEE6]">
                  <th className="py-4 px-5 text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">Employee</th>
                  <th className="py-4 px-4 text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">Total Hours</th>
                  <th className="py-4 px-4 text-xs font-bold text-[#6B6B6B] uppercase tracking-wider text-center">Days Worked</th>
                  <th className="py-4 px-4 text-xs font-bold text-[#6B6B6B] uppercase tracking-wider text-center">Sick</th>
                  <th className="py-4 px-4 text-xs font-bold text-[#6B6B6B] uppercase tracking-wider text-center">Vacation</th>
                  <th className="py-4 px-4 text-xs font-bold text-[#6B6B6B] uppercase tracking-wider text-right">Total Pay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F6F5F1]">
                {periodSummaries.map((s: any) => (
                  <tr
                    key={s.employee.id ?? s.employee._id}
                    className="hover:bg-[#F0EEE6] cursor-pointer transition-colors"
                    onClick={() => openPeriodDetail(s.employee, findAllEntriesForMember(s.employee))}
                  >
                    <td className="py-4 px-5">
                      <div className="font-medium text-[#1A1A1A]">{s.employee.name}</div>
                      <div className="text-xs text-[#6B6B6B]">{s.employee.role}</div>
                    </td>
                    <td className="py-4 px-4 font-medium text-[#1A1A1A]">{formatDuration(s.totalMinutes)}</td>
                    <td className="py-4 px-4 text-center text-[#1A1A1A]">{s.daysWorked}</td>
                    <td className="py-4 px-4 text-center text-[#1A1A1A]">{s.sickDays}</td>
                    <td className="py-4 px-4 text-center text-[#1A1A1A]">{s.vacationDays}</td>
                    <td className="py-4 px-4 text-right font-bold text-[#FF9500]">{formatCurrency(s.totalPay)}</td>
                  </tr>
                ))}
                {periodSummaries.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-[#6B6B6B]">No data for this period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      {/* TimeCardModal — editable for admin */}
      <TimeCardModal
        isOpen={isTimeCardOpen}
        onClose={closeTimeCard}
        entry={selectedEntry}
        breaks={selectedBreaks}
        employeeName={selectedEmployeeName}
        date={selectedDate}
        isEmployeeView={false}
        onSave={(updates, breaks) => handleTimeCardSave(updates)}
        onDelete={handleTimeCardDelete}
      />

      {/* PeriodDetailModal */}
      <PeriodDetailModal
        isOpen={isPeriodDetailOpen}
        onClose={() => setIsPeriodDetailOpen(false)}
        employeeName={periodDetailEmployee?.name ?? ""}
        employeeRole={periodDetailEmployee?.role}
        entries={periodDetailEntries}
        periodStart={dateRange.start}
        periodEnd={dateRange.end}
        onEntryClick={(entry, date) => {
          setIsPeriodDetailOpen(false);
          openTimeCard(entry, date, periodDetailEmployee?.name ?? "");
        }}
      />
    </div>
  );
}

// Mobile card issue badges (matches Ollie's multi-badge layout)
function EntryIssueBadges({ entry }: { entry: TimesheetEntry }) {
  const badgeClass = (color: string) =>
    `text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider ${color}`;

  // Collect all issues to display
  const badges: { label: string; color: string }[] = [];

  if (entry.changeRequest) {
    badges.push({ label: "REVIEW NEEDED", color: "bg-indigo-100 text-indigo-700" });
  }
  if (entry.pendingApproval && entry.isVacation) {
    badges.push({ label: "VACATION REQ", color: "bg-purple-100 text-purple-700" });
  }
  if (entry.issues.includes("MISSING_CLOCK_OUT")) {
    badges.push({ label: "MISSING CLOCK OUT", color: "bg-amber-50 text-amber-700" });
  }
  if (entry.issues.includes("LONG_SHIFT_NO_BREAK")) {
    badges.push({ label: "LONG SHIFT NO BREAK", color: "bg-amber-50 text-amber-700" });
  }
  if (entry.issues.includes("OVERTIME_WARNING")) {
    badges.push({ label: "OVERTIME WARNING", color: "bg-amber-50 text-amber-700" });
  }
  if (entry.issues.includes("OPEN_BREAK")) {
    badges.push({ label: "OPEN BREAK", color: "bg-amber-50 text-amber-700" });
  }

  if (badges.length > 0) {
    return (
      <>
        {badges.map((b) => (
          <span key={b.label} className={badgeClass(b.color)}>{b.label}</span>
        ))}
      </>
    );
  }

  // No issues
  if (!entry.clockOutTime && !entry.isSickDay && !entry.isVacation) {
    return <span className={badgeClass("bg-emerald-100 text-emerald-700")}>Active</span>;
  }
  return <span className="text-[10px] text-[#9CA3AF]">No Issues</span>;
}

// Desktop table status badge
function EntryBadge({ entry }: { entry: TimesheetEntry }) {
  if (entry.pendingApproval && entry.changeRequest) return <span className="text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-full">Change Request</span>;
  if (entry.pendingApproval && entry.isVacation) return <span className="text-xs font-bold text-purple-600 bg-purple-50 px-3 py-1 rounded-full">Vacation Pending</span>;
  if (entry.pendingApproval && entry.isSickDay) return <span className="text-xs font-bold text-rose-600 bg-rose-50 px-3 py-1 rounded-full">Sick Pending</span>;
  if (entry.isSickDay && entry.isHalfSickDay) return <span className="text-xs font-bold text-rose-600 bg-rose-50 px-3 py-1 rounded-full">Partial Sick</span>;
  if (entry.isSickDay) return <span className="text-xs font-bold text-rose-600 bg-rose-50 px-3 py-1 rounded-full">Sick</span>;
  if (entry.isVacation) return <span className="text-xs font-bold text-sky-600 bg-sky-50 px-3 py-1 rounded-full">Vacation</span>;
  if (!entry.clockOutTime && !entry.isSickDay && !entry.isVacation) return <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">Active</span>;
  if (entry.issues.includes("MISSING_CLOCK_OUT")) return <span className="text-xs font-bold text-rose-600 bg-rose-50 px-3 py-1 rounded-full">Missing Out</span>;
  if (entry.issues.includes("LONG_SHIFT_NO_BREAK")) return <span className="text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-full">No Break</span>;
  if (entry.issues.includes("OVERTIME_WARNING")) return <span className="text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-full">Overtime</span>;
  return <span className="text-xs text-[#9CA3AF]">OK</span>;
}
