"use client";

import { useState, useEffect } from "react";
import { useClockStatus } from "@/hooks/useClockStatus";
import VacationRequestForm from "./VacationRequestForm";

function formatDateForDisplay(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export default function QuickClockBar({
  teamMemberId,
}: {
  teamMemberId: string;
}) {
  const {
    status,
    clockStatus,
    loading,
    actionLoading,
    breakTimer,
    showResumePrompt,
    pausedTicketId,
    issueEntry,
    showFixModal,
    setShowFixModal,
    fixClockOut,
    setFixClockOut,
    fixSubmitting,
    handleClockIn,
    handleClockOut,
    handleStartBreak,
    handleEndBreak,
    handleResumeTimer,
    handleDismissResume,
    handleSickDay,
    handleFixSubmit,
  } = useClockStatus(teamMemberId);

  const [now, setNow] = useState(new Date());
  const [showVacationForm, setShowVacationForm] = useState(false);
  const [hidden, setHidden] = useState(false);

  // Hide entire bar if member has bypassClockIn
  useEffect(() => {
    fetch(`/api/admin/me?_=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.bypassClockIn) setHidden(true); })
      .catch(() => {});
  }, []);

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).toLowerCase();

  // Hide for bypassClockIn members
  if (hidden) return null;

  // ── Full-screen overlays (same as ClockInOutCard) ──

  // Missing clock-out blocking modal
  if (issueEntry) {
    if (showFixModal) {
      return (
        <div className="fixed inset-0 z-[60] bg-[#484848]/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 md:p-8 animate-slide-in-right">
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-2">Fix Your Timecard</h2>
            <p className="text-sm text-[#6B6B6B] mb-4">
              Enter your clock-out time for <span className="font-bold text-[#1A1A1A]">{formatDateForDisplay(issueEntry.date)}</span>.
            </p>
            <p className="text-xs text-[#9CA3AF] mb-4">
              Clocked in at {new Date(issueEntry.clockInTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()}
            </p>
            <div className="mb-6">
              <label className="block text-xs font-bold text-[#6B6B6B] uppercase mb-1.5">Clock Out Time</label>
              <input
                type="time"
                value={fixClockOut}
                onChange={(e) => setFixClockOut(e.target.value)}
                className="w-full p-3 bg-white border border-[#E5E3DA] rounded-2xl text-base text-[#1A1A1A] focus:ring-2 focus:ring-[#FF9500] outline-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowFixModal(false)}
                className="flex-1 py-3 border border-[#E5E3DA] text-[#484848] rounded-lg font-medium text-sm hover:bg-[#F0EEE6] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleFixSubmit}
                disabled={!fixClockOut || fixSubmitting}
                className="flex-1 py-3 bg-[#FF9500] text-white rounded-lg font-medium text-sm hover:bg-[#E68600] transition-colors disabled:opacity-50"
              >
                {fixSubmitting ? "Submitting..." : "Submit Fix"}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-[60] bg-[#484848]/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-6">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 md:p-8 text-center animate-slide-in-right">
          <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-600">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-[#1A1A1A] mb-2">Action Required</h2>
          <p className="text-[#6B6B6B] mb-6 text-sm md:text-base">
            You didn&apos;t clock out on <span className="font-bold text-[#1A1A1A]">{formatDateForDisplay(issueEntry.date)}</span>.
            Please update your time card.
          </p>
          <button
            onClick={() => setShowFixModal(true)}
            className="w-full min-h-[48px] py-3 bg-[#FF9500] text-white rounded-lg font-bold text-base hover:bg-[#E68600] transition-colors"
          >
            Review & Fix Now
          </button>
        </div>
      </div>
    );
  }

  // Full screen break overlay
  if (clockStatus === "break") {
    return (
      <div className="fixed inset-0 z-[60] bg-rose-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="mb-12">
          <h1 className="text-4xl md:text-6xl font-bold text-rose-900 mb-4 tracking-tight">
            You are on break
          </h1>
          <p className="text-rose-700 font-mono text-xl md:text-3xl opacity-80">
            {breakTimer}
          </p>
        </div>
        <button
          onClick={handleEndBreak}
          disabled={actionLoading}
          className="bg-rose-600 text-white text-2xl font-bold py-8 px-16 rounded-lg shadow-2xl shadow-rose-600/30 hover:bg-rose-700 hover:scale-105 transition-all transform active:scale-95 disabled:opacity-50"
        >
          End Break
        </button>
      </div>
    );
  }

  // Resume timer prompt
  if (showResumePrompt && pausedTicketId) {
    return (
      <div className="fixed inset-0 z-[60] bg-[#484848]/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-6">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 md:p-8 text-center animate-slide-in-right">
          <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-600">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">Welcome Back!</h2>
          <p className="text-sm text-[#6B6B6B] mb-6">
            Your ticket timer was paused when you went on break. Resume where you left off?
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleDismissResume}
              className="flex-1 py-3 border border-[#E5E3DA] text-[#484848] rounded-lg font-medium text-sm hover:bg-[#F0EEE6] transition-colors"
            >
              No Thanks
            </button>
            <button
              onClick={handleResumeTimer}
              className="flex-1 py-3 bg-[#FF9500] text-white rounded-lg font-medium text-sm hover:bg-[#E68600] transition-colors"
            >
              Resume Timer
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── The bar itself ──

  if (loading) {
    return (
      <div className="rounded-2xl bg-white border border-[#F6F5F1] shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-4 mb-5">
        <div className="flex items-center justify-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#FF9500]" />
          <span className="text-sm text-[#6B6B6B]">Loading timesheet...</span>
        </div>
      </div>
    );
  }

  // Status pill config
  const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
    idle: { label: "Ready to Start", bg: "bg-[#F6F5F1]", text: "text-[#6B6B6B]" },
    working: { label: "Clocked In", bg: "bg-emerald-100", text: "text-emerald-700" },
    done: { label: "Shift Complete", bg: "bg-[#F6F5F1]", text: "text-[#6B6B6B]" },
    sick: { label: "Sick Day", bg: "bg-rose-100", text: "text-rose-700" },
    vacation: { label: "Vacation", bg: "bg-sky-100", text: "text-sky-700" },
    break: { label: "On Break", bg: "bg-rose-100", text: "text-rose-700" },
  };
  const pill = statusConfig[clockStatus] || statusConfig.idle;

  // Today's summary
  const clockInTime = status?.activeShift?.clockInTime
    ? new Date(status.activeShift.clockInTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()
    : null;
  const breakMins = status?.activeShift?.totalBreakMinutes || 0;

  const isDone = clockStatus === "done" || clockStatus === "sick" || clockStatus === "vacation";

  return (
    <div className="rounded-2xl bg-white border border-[#F6F5F1] shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-4 md:p-5 mb-5">
      {/* Desktop layout */}
      <div className="hidden md:flex items-center gap-4">
        {/* Status pill */}
        <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold tracking-wide uppercase whitespace-nowrap ${pill.bg} ${pill.text}`}>
          {clockStatus === "working" && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
          )}
          {pill.label}
        </span>

        {/* Live clock */}
        <span className="font-mono text-lg text-[#1A1A1A] tracking-tight tabular-nums">
          {clockStatus === "sick" || clockStatus === "vacation" ? "OFF" : timeStr}
        </span>

        {/* Divider */}
        <div className="w-px h-8 bg-[#F6F5F1]" />

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {clockStatus === "idle" && (
            <button
              onClick={handleClockIn}
              disabled={actionLoading}
              className="px-5 py-2 bg-[#FF9500] text-white rounded-xl font-bold text-sm hover:bg-[#E68600] transition-colors disabled:opacity-50"
            >
              {actionLoading ? "..." : "Clock In"}
            </button>
          )}

          {clockStatus === "working" && (
            <>
              <button
                onClick={handleStartBreak}
                disabled={actionLoading}
                className="px-4 py-2 bg-[#F6F5F1] text-[#1A1A1A] rounded-xl font-medium text-sm hover:bg-[#E5E3DA] transition-colors disabled:opacity-50 border border-[#F6F5F1]"
              >
                Start Break
              </button>
              <button
                onClick={handleClockOut}
                disabled={actionLoading}
                className="px-4 py-2 bg-rose-900 text-white rounded-xl font-medium text-sm hover:bg-rose-800 transition-colors disabled:opacity-50"
              >
                Clock Out
              </button>
            </>
          )}

          {clockStatus === "idle" && (
            <>
              <button
                onClick={() => handleSickDay(false)}
                disabled={actionLoading}
                className="px-3 py-2 rounded-xl text-sm font-medium transition-colors border bg-white border-[#F6F5F1] text-[#6B6B6B] hover:border-rose-200 hover:bg-rose-50"
                title="Mark as sick day"
              >
                🤒 Sick
              </button>
              <button
                onClick={() => setShowVacationForm(true)}
                disabled={actionLoading}
                className="px-3 py-2 rounded-xl text-sm font-medium transition-colors border bg-white border-[#F6F5F1] text-[#6B6B6B] hover:border-sky-200 hover:bg-sky-50"
                title="Request vacation"
              >
                ✈️ Vacation
              </button>
            </>
          )}

          {clockStatus === "sick" && (
            <button
              onClick={() => handleSickDay(false)}
              disabled={actionLoading}
              className="px-3 py-2 rounded-xl text-sm font-medium transition-colors border bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100"
            >
              🤒 Undo Sick Day
            </button>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Today's summary */}
        {clockInTime && clockStatus !== "sick" && clockStatus !== "vacation" && (
          <div className="flex items-center gap-4 text-xs text-[#6B6B6B]">
            <span>
              In: <span className="font-mono text-[#1A1A1A]">{clockInTime}</span>
            </span>
            {breakMins > 0 && (
              <span>
                Break: <span className="font-mono text-[#1A1A1A]">{breakMins}m</span>
              </span>
            )}
            {status?.activeShift?.clockOutTime && (
              <span>
                Out: <span className="font-mono text-[#1A1A1A]">
                  {new Date(status.activeShift.clockOutTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()}
                </span>
              </span>
            )}
          </div>
        )}

        {clockStatus === "done" && status?.activeShift?.clockOutTime && (
          <span className="text-xs text-emerald-600 font-medium">
            Done for the day
          </span>
        )}
      </div>

      {/* Mobile layout */}
      <div className="md:hidden space-y-3">
        {/* Row 1: Status + Time + Summary */}
        <div className="flex items-center justify-between">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase ${pill.bg} ${pill.text}`}>
            {clockStatus === "working" && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
            )}
            {pill.label}
          </span>
          <span className="font-mono text-base text-[#1A1A1A] tracking-tight tabular-nums">
            {clockStatus === "sick" || clockStatus === "vacation" ? "OFF" : timeStr}
          </span>
        </div>

        {/* Row 2: Action buttons */}
        <div className="flex items-center gap-2">
          {clockStatus === "idle" && (
            <>
              <button
                onClick={handleClockIn}
                disabled={actionLoading}
                className="flex-1 py-2.5 bg-[#FF9500] text-white rounded-xl font-bold text-sm hover:bg-[#E68600] transition-colors disabled:opacity-50"
              >
                {actionLoading ? "..." : "Clock In"}
              </button>
              <button
                onClick={() => handleSickDay(false)}
                disabled={actionLoading}
                className="px-3 py-2.5 rounded-xl text-sm border border-[#F6F5F1] text-[#6B6B6B] hover:border-rose-200 hover:bg-rose-50 transition-colors"
                title="Sick day"
              >
                🤒
              </button>
              <button
                onClick={() => setShowVacationForm(true)}
                disabled={actionLoading}
                className="px-3 py-2.5 rounded-xl text-sm border border-[#F6F5F1] text-[#6B6B6B] hover:border-sky-200 hover:bg-sky-50 transition-colors"
                title="Vacation"
              >
                ✈️
              </button>
            </>
          )}

          {clockStatus === "working" && (
            <>
              <button
                onClick={handleStartBreak}
                disabled={actionLoading}
                className="flex-1 py-2.5 bg-[#F6F5F1] text-[#1A1A1A] rounded-xl font-medium text-sm hover:bg-[#E5E3DA] transition-colors disabled:opacity-50 border border-[#F6F5F1]"
              >
                Start Break
              </button>
              <button
                onClick={handleClockOut}
                disabled={actionLoading}
                className="flex-1 py-2.5 bg-rose-900 text-white rounded-xl font-medium text-sm hover:bg-rose-800 transition-colors disabled:opacity-50"
              >
                Clock Out
              </button>
            </>
          )}

          {clockStatus === "sick" && (
            <button
              onClick={() => handleSickDay(false)}
              disabled={actionLoading}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors border bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100"
            >
              🤒 Undo Sick Day
            </button>
          )}

          {clockStatus === "done" && (
            <span className="text-xs text-emerald-600 font-medium">
              Done for the day
            </span>
          )}
        </div>

        {/* Row 3: Today's summary (mobile) */}
        {clockInTime && clockStatus !== "sick" && clockStatus !== "vacation" && (
          <div className="flex items-center gap-3 text-[10px] text-[#6B6B6B] border-t border-[#F6F5F1] pt-2">
            <span>In: <span className="font-mono text-[#1A1A1A]">{clockInTime}</span></span>
            {breakMins > 0 && (
              <span>Break: <span className="font-mono text-[#1A1A1A]">{breakMins}m</span></span>
            )}
            {status?.activeShift?.clockOutTime && (
              <span>Out: <span className="font-mono text-[#1A1A1A]">
                {new Date(status.activeShift.clockOutTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()}
              </span></span>
            )}
          </div>
        )}
      </div>

      {/* Vacation request form — auto-opens its own full-screen modal */}
      {showVacationForm && (
        <VacationRequestForm
          teamMemberId={teamMemberId}
          onSubmit={() => setShowVacationForm(false)}
          defaultOpen
          onClose={() => setShowVacationForm(false)}
        />
      )}
    </div>
  );
}
