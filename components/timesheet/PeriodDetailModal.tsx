"use client";

import React, { useEffect } from "react";
import type { TimesheetEntry } from "@/types";

function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
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
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

interface PeriodDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeName: string;
  employeeRole?: string;
  entries: TimesheetEntry[];
  periodStart: string;
  periodEnd: string;
  onEntryClick: (entry: TimesheetEntry, date: string) => void;
}

export default function PeriodDetailModal({
  isOpen,
  onClose,
  employeeName,
  employeeRole,
  entries,
  periodStart,
  periodEnd,
  onEntryClick,
}: PeriodDetailModalProps) {
  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatPeriod = () => {
    const start = new Date(periodStart + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const end = new Date(periodEnd + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return `${start} - ${end}`;
  };

  // Sort entries by date ascending
  const sortedEntries = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-end bg-[#484848]/40 backdrop-blur-sm transition-all"
      onClick={onClose}
    >
      <div
        className="h-[95vh] md:h-full w-full md:max-w-5xl bg-[#FAF9F5] shadow-2xl rounded-t-2xl md:rounded-none p-6 md:p-8 overflow-y-auto flex flex-col animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-[#1A1A1A]">{employeeName}</h2>
            <p className="text-[#6B6B6B] font-medium text-sm">
              {employeeRole && <span className="mr-2">{employeeRole} ·</span>}
              {formatPeriod()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#9CA3AF] hover:text-[#484848] p-2 -mr-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <svg className="w-8 h-8 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Entries Table */}
        <div className="flex-1 bg-white rounded-xl border border-[var(--border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Date</th>
                <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Clock In</th>
                <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Clock Out</th>
                <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Break</th>
                <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Worked</th>
                <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody>
              {sortedEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 px-2 text-center text-[#9CA3AF] italic">
                    No time entries for this period
                  </td>
                </tr>
              ) : (
                sortedEntries.map((entry) => (
                  <tr
                    key={entry.id}
                    onClick={() => onEntryClick(entry, entry.date)}
                    className="border-b border-[var(--border)] hover:bg-[var(--hover-tan)] cursor-pointer transition-colors"
                  >
                    <td className="px-2 py-3 font-medium text-[#1A1A1A]">
                      {formatDateForDisplay(entry.date)}
                    </td>
                    <td className="px-2 py-3 text-[#484848] font-mono text-sm">
                      {entry.isSickDay || entry.isVacation ? "—" : formatTime(entry.clockInTime)}
                    </td>
                    <td className="px-2 py-3 text-[#484848] font-mono text-sm">
                      {entry.isSickDay || entry.isVacation ? "—" : formatTime(entry.clockOutTime)}
                    </td>
                    <td className="px-2 py-3 text-right text-[#6B6B6B] text-sm">
                      {formatDuration(entry.totalBreakMinutes)}
                    </td>
                    <td className="px-2 py-3 text-right font-medium text-[#1A1A1A]">
                      {entry.workedMinutes !== null ? formatDuration(entry.workedMinutes) : "—"}
                    </td>
                    <td className="px-2 py-3">
                      {entry.isSickDay && entry.isHalfSickDay ? (
                        <span className="px-3 py-1 bg-rose-100 text-rose-700 text-xs font-bold rounded-full">
                          PARTIAL SICK{entry.sickHoursUsed ? ` (${entry.sickHoursUsed}h)` : ""}
                        </span>
                      ) : entry.isSickDay ? (
                        <span className="px-3 py-1 bg-rose-100 text-rose-700 text-xs font-bold rounded-full">SICK</span>
                      ) : entry.isVacation ? (
                        <span className="px-3 py-1 bg-sky-100 text-sky-700 text-xs font-bold rounded-full">VACATION</span>
                      ) : entry.changeRequest ? (
                        <span className="px-3 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">PENDING</span>
                      ) : entry.pendingApproval ? (
                        <span className="px-3 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded-full">PENDING</span>
                      ) : entry.issues && entry.issues.length > 0 ? (
                        <span className="text-xs text-amber-600 font-medium">
                          {entry.issues.includes("MISSING_CLOCK_OUT") ? "Missing Out" :
                           entry.issues.includes("OVERTIME_WARNING") ? "Overtime" :
                           entry.issues[0]}
                        </span>
                      ) : (
                        <span className="text-xs text-[#9CA3AF]">OK</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
