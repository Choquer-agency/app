"use client";

import { useState, useEffect } from "react";
import type { TimesheetEntry } from "@/types";
import HoursDisplay from "./HoursDisplay";

function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(minutes: number) {
  if (!minutes || minutes <= 0) return "0h 0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatDateForDisplay(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function MyTimesheetHistory({
  teamMemberId,
  refreshKey,
}: {
  teamMemberId: string;
  refreshKey: number;
}) {
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [memberInfo, setMemberInfo] = useState<{ vacationDaysTotal?: number; vacationDaysUsed?: number; sickHoursTotal?: number } | null>(null);

  // Change request modal state
  const [selectedEntry, setSelectedEntry] = useState<TimesheetEntry | null>(null);
  const [editClockIn, setEditClockIn] = useState("");
  const [editClockOut, setEditClockOut] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");

  useEffect(() => {
    async function fetch_() {
      setLoading(true);
      try {
        let url = "/api/admin/timesheet/history?";
        if (filterStartDate) url += `startDate=${filterStartDate}&`;
        if (filterEndDate) url += `endDate=${filterEndDate}&`;
        const [entriesRes, memberRes] = await Promise.all([
          fetch(url),
          fetch("/api/admin/team/me"),
        ]);
        if (entriesRes.ok) {
          setEntries(await entriesRes.json());
        }
        if (memberRes.ok) {
          const data = await memberRes.json();
          setMemberInfo(data);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    fetch_();
  }, [filterStartDate, filterEndDate, refreshKey]);

  function openEntryModal(entry: TimesheetEntry) {
    setSelectedEntry(entry);
    // Convert ISO to HH:mm for time inputs
    if (entry.clockInTime && !entry.isSickDay && !entry.isVacation) {
      const cin = new Date(entry.clockInTime);
      setEditClockIn(`${cin.getHours().toString().padStart(2, "0")}:${cin.getMinutes().toString().padStart(2, "0")}`);
    } else {
      setEditClockIn("");
    }
    if (entry.clockOutTime) {
      const cout = new Date(entry.clockOutTime);
      setEditClockOut(`${cout.getHours().toString().padStart(2, "0")}:${cout.getMinutes().toString().padStart(2, "0")}`);
    } else {
      setEditClockOut("");
    }
    setEditReason("");
    setEditError("");
  }

  async function handleSubmitChangeRequest() {
    if (!selectedEntry || !editReason.trim()) {
      setEditError("Please provide a reason for the change.");
      return;
    }
    setEditSubmitting(true);
    setEditError("");
    try {
      const buildISO = (date: string, time: string) => {
        if (!time) return undefined;
        const [h, m] = time.split(":").map(Number);
        const d = new Date(date + "T00:00:00");
        d.setHours(h, m, 0, 0);
        return d.toISOString();
      };

      const res = await fetch("/api/admin/timesheet/change-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timesheetEntryId: selectedEntry.id,
          proposedClockIn: buildISO(selectedEntry.date, editClockIn) || selectedEntry.clockInTime,
          proposedClockOut: buildISO(selectedEntry.date, editClockOut) || undefined,
          reason: editReason.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setEditError(data.error || "Failed to submit request");
        return;
      }
      setSelectedEntry(null);
      // Refresh entries
      const url = `/api/admin/timesheet/history?${filterStartDate ? `startDate=${filterStartDate}&` : ""}${filterEndDate ? `endDate=${filterEndDate}` : ""}`;
      const refreshRes = await fetch(url);
      if (refreshRes.ok) setEntries(await refreshRes.json());
    } catch {
      setEditError("Failed to submit request");
    } finally {
      setEditSubmitting(false);
    }
  }

  const isFilterActive = filterStartDate !== "" || filterEndDate !== "";
  const totalWorkedMins = entries.reduce(
    (sum, e) => sum + (e.workedMinutes ?? 0),
    0
  );
  const totalBreakMins = entries.reduce(
    (sum, e) => sum + (e.totalBreakMinutes ?? 0),
    0
  );
  const sickDayCount = entries.filter((e) => e.isSickDay).length;
  const vacationDaysUsed = entries.filter((e) => e.isVacation).length;
  const vacationDaysTotal = memberInfo?.vacationDaysTotal ?? 10;
  const vacationRemaining = Math.max(0, vacationDaysTotal - vacationDaysUsed);

  return (
    <>
      {/* Date Range Filter */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-6 md:mb-8">
        <div className="flex-1 min-w-0">
          <label className="block text-xs font-bold text-[#6B6B6B] uppercase mb-1.5">
            From
          </label>
          <input
            type="date"
            value={filterStartDate}
            onChange={(e) => setFilterStartDate(e.target.value)}
            className="w-full p-3 bg-white border border-[#F6F5F1] rounded-2xl focus:ring-2 focus:ring-[#FF9500] outline-none text-sm text-[#1A1A1A]"
          />
        </div>
        <div className="flex-1 min-w-0">
          <label className="block text-xs font-bold text-[#6B6B6B] uppercase mb-1.5">
            To
          </label>
          <input
            type="date"
            value={filterEndDate}
            onChange={(e) => setFilterEndDate(e.target.value)}
            className="w-full p-3 bg-white border border-[#F6F5F1] rounded-2xl focus:ring-2 focus:ring-[#FF9500] outline-none text-sm text-[#1A1A1A]"
          />
        </div>
        {isFilterActive && (
          <button
            onClick={() => {
              setFilterStartDate("");
              setFilterEndDate("");
            }}
            className="text-sm text-[#6B6B6B] hover:text-[#1A1A1A] whitespace-nowrap"
          >
            Clear Filter
          </button>
        )}
      </div>

      {/* Stats Cards (4-column, matches Ollie) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
        <div className="bg-sky-50 p-4 md:p-6 rounded-2xl border border-sky-100 text-sky-900">
          <h3 className="text-xs font-bold uppercase opacity-70 mb-1">
            Vacation Remaining
          </h3>
          <div className="text-2xl md:text-3xl font-bold">
            {vacationRemaining}{" "}
            <span className="text-sm font-normal opacity-70">/ {vacationDaysTotal}</span>
          </div>
        </div>
        <div className="bg-rose-50 p-4 md:p-6 rounded-2xl border border-rose-100 text-rose-900">
          <h3 className="text-xs font-bold uppercase opacity-70 mb-1">
            Sick Days Used
          </h3>
          <div className="text-2xl md:text-3xl font-bold">
            {sickDayCount}{" "}
            <span className="text-sm font-normal opacity-70">Days</span>
          </div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-2xl border border-[#F6F5F1] text-[#1A1A1A] shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <h3 className="text-xs font-bold uppercase text-[#6B6B6B] mb-1">
            {isFilterActive ? "Hours (Filtered)" : "Total Hours Worked"}
          </h3>
          <div className="text-2xl md:text-3xl font-bold">
            {formatDuration(totalWorkedMins)}
          </div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-2xl border border-[#F6F5F1] text-[#1A1A1A] shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <h3 className="text-xs font-bold uppercase text-[#6B6B6B] mb-1">
            {isFilterActive ? "Break (Filtered)" : "Total Break Time"}
          </h3>
          <div className="text-2xl md:text-3xl font-bold">
            {formatDuration(totalBreakMins)}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-[#6B6B6B]">Loading...</div>
      ) : (
        <>
          {/* Mobile Card Layout */}
          <div className="md:hidden space-y-3">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.04)] border border-[#F6F5F1] p-4 cursor-pointer active:bg-[#F6F5F1]/50 transition-colors"
                onClick={() => openEntryModal(entry)}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="font-medium text-[#1A1A1A]">
                    {formatDateForDisplay(entry.date)}
                  </div>
                  <EntryStatusBadge entry={entry} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-[#6B6B6B] uppercase mb-1">
                      Clock In
                    </div>
                    <div className="text-[#1A1A1A] font-mono">
                      {entry.isSickDay || entry.isVacation
                        ? "—"
                        : formatTime(entry.clockInTime)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[#6B6B6B] uppercase mb-1">
                      Clock Out
                    </div>
                    <div className="text-[#1A1A1A] font-mono">
                      {entry.isSickDay || entry.isVacation
                        ? "—"
                        : formatTime(entry.clockOutTime)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[#6B6B6B] uppercase mb-1">
                      Break
                    </div>
                    <div className="text-[#6B6B6B]">
                      {formatDuration(entry.totalBreakMinutes)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[#6B6B6B] uppercase mb-1">
                      Worked
                    </div>
                    <div className="font-medium text-[#1A1A1A]">
                      {entry.workedMinutes !== null
                        ? formatDuration(entry.workedMinutes)
                        : "—"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {entries.length === 0 && (
              <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.04)] border border-[#F6F5F1] py-8 text-center text-[#6B6B6B]">
                No history available.
              </div>
            )}
          </div>

          {/* Desktop Table Layout (matches Ollie exactly) */}
          <div className="hidden md:block bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.04)] border border-[#F6F5F1] overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#F6F5F1] bg-[#F6F5F1]/50">
                  <th className="py-4 px-6 text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">
                    Date
                  </th>
                  <th className="py-4 px-6 text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">
                    Clock In
                  </th>
                  <th className="py-4 px-6 text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">
                    Clock Out
                  </th>
                  <th className="py-4 px-6 text-xs font-bold text-[#6B6B6B] uppercase tracking-wider text-right">
                    Break
                  </th>
                  <th className="py-4 px-6 text-xs font-bold text-[#6B6B6B] uppercase tracking-wider text-right">
                    Worked
                  </th>
                  <th className="py-4 px-6 text-xs font-bold text-[#6B6B6B] uppercase tracking-wider text-right">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F6F5F1]">
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-[#F6F5F1]/30 cursor-pointer transition-colors"
                    onClick={() => openEntryModal(entry)}
                  >
                    <td className="py-4 px-6 font-medium text-[#1A1A1A]">
                      {formatDateForDisplay(entry.date)}
                    </td>
                    <td className="py-4 px-6 text-[#1A1A1A] font-mono text-sm">
                      {entry.isSickDay || entry.isVacation
                        ? "—"
                        : formatTime(entry.clockInTime)}
                    </td>
                    <td className="py-4 px-6 text-[#1A1A1A] font-mono text-sm">
                      {entry.isSickDay || entry.isVacation
                        ? "—"
                        : formatTime(entry.clockOutTime)}
                    </td>
                    <td className="py-4 px-6 text-right text-[#6B6B6B] text-sm">
                      {formatDuration(entry.totalBreakMinutes)}
                    </td>
                    <td className="py-4 px-6 text-right font-medium text-[#1A1A1A]">
                      {entry.workedMinutes !== null
                        ? formatDuration(entry.workedMinutes)
                        : "—"}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <EntryStatusBadge entry={entry} />
                    </td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-8 text-center text-[#6B6B6B]"
                    >
                      No history available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Change Request Modal */}
      {selectedEntry && (
        <div
          className="fixed inset-0 z-50 bg-[#484848]/40 backdrop-blur-sm flex items-end md:items-center justify-center"
          onClick={() => setSelectedEntry(null)}
        >
          <div
            className="w-full md:max-w-md bg-white md:rounded-2xl shadow-2xl flex flex-col overflow-hidden rounded-t-2xl max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-shrink-0 flex justify-between items-center p-4 md:p-6 border-b border-[#F6F5F1]">
              <div>
                <h2 className="text-lg font-bold text-[#1A1A1A]">Edit Timecard</h2>
                <p className="text-sm text-[#6B6B6B]">
                  {new Date(selectedEntry.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </p>
              </div>
              <button onClick={() => setSelectedEntry(null)} className="text-[#9CA3AF] hover:text-[#1A1A1A] p-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
              {selectedEntry.changeRequest && (
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
                  <span className="font-bold">Pending Review:</span> You already submitted a request for this day. Submitting again will update it.
                </div>
              )}

              {!selectedEntry.isSickDay && !selectedEntry.isVacation && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-[#6B6B6B] uppercase mb-1.5">Clock In</label>
                    <input
                      type="time"
                      value={editClockIn}
                      onChange={(e) => setEditClockIn(e.target.value)}
                      className="w-full p-3 bg-white border border-[#F6F5F1] rounded-xl focus:ring-2 focus:ring-[#FF9500] outline-none text-base text-[#1A1A1A]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#6B6B6B] uppercase mb-1.5">Clock Out</label>
                    <input
                      type="time"
                      value={editClockOut}
                      onChange={(e) => setEditClockOut(e.target.value)}
                      className="w-full p-3 bg-white border border-[#F6F5F1] rounded-xl focus:ring-2 focus:ring-[#FF9500] outline-none text-base text-[#1A1A1A]"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-bold text-[#6B6B6B] uppercase mb-1.5">Reason for change</label>
                <textarea
                  rows={2}
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="e.g., Forgot to clock out, actual time was 5:00 PM"
                  className="w-full p-3 bg-white border border-[#F6F5F1] rounded-xl focus:ring-2 focus:ring-[#FF9500] outline-none text-sm text-[#1A1A1A] placeholder:text-[#9CA3AF]"
                />
              </div>

              {editError && (
                <div className="p-3 bg-rose-50 text-rose-700 text-sm rounded-xl">{editError}</div>
              )}
            </div>

            <div className="flex-shrink-0 flex gap-3 p-4 md:p-6 border-t border-[#F6F5F1]">
              <button
                onClick={() => setSelectedEntry(null)}
                className="flex-1 py-3 border border-[#E5E3DA] text-[#484848] rounded-lg font-medium text-sm hover:bg-[#F0EEE6] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitChangeRequest}
                disabled={editSubmitting || !editReason.trim()}
                className="flex-1 py-3 bg-[#FF9500] text-white rounded-lg font-medium text-sm hover:bg-[#E68600] transition-colors disabled:opacity-50"
              >
                {editSubmitting ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function EntryStatusBadge({ entry }: { entry: TimesheetEntry }) {
  if (entry.isSickDay && entry.isHalfSickDay) {
    return (
      <span className="text-xs font-bold text-rose-600 bg-rose-50 px-3 py-1 rounded-full">
        Partial Sick
      </span>
    );
  }
  if (entry.isSickDay) {
    return (
      <span className="text-xs font-bold text-rose-600 bg-rose-50 px-3 py-1 rounded-full">
        Sick
      </span>
    );
  }
  if (entry.isVacation) {
    return (
      <span className="text-xs font-bold text-sky-600 bg-sky-50 px-3 py-1 rounded-full">
        Vacation
      </span>
    );
  }
  if (entry.issues.length > 0) {
    return (
      <span className="text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-full">
        {entry.issues.includes("MISSING_CLOCK_OUT")
          ? "Missing Out"
          : entry.issues.includes("OVERTIME_WARNING")
            ? "Overtime"
            : "Issue"}
      </span>
    );
  }
  return <span className="text-xs text-[#6B6B6B]">OK</span>;
}
