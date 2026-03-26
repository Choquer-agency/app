"use client";

import { useClockStatus } from "@/hooks/useClockStatus";

function formatDateForDisplay(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export default function ClockInOutCard({
  teamMemberId,
  onStatusChange,
}: {
  teamMemberId: string;
  onStatusChange: () => void;
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
  } = useClockStatus(teamMemberId, onStatusChange);

  // ── Blocking "Action Required" modal for missing clock-out ──
  if (issueEntry) {
    if (showFixModal) {
      return (
        <div className="fixed inset-0 z-50 bg-[#484848]/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-6">
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
      <div className="fixed inset-0 z-50 bg-[#484848]/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-6">
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
      <div className="fixed inset-0 z-50 bg-rose-50 flex flex-col items-center justify-center p-6 text-center">
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

  // Resume timer prompt after break ends
  if (showResumePrompt && pausedTicketId) {
    return (
      <div className="fixed inset-0 z-50 bg-[#484848]/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-6">
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

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-6 md:p-8 border border-[#F6F5F1] text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF9500] mx-auto mb-4" />
        <p className="text-[#6B6B6B]">Loading...</p>
      </div>
    );
  }

  // --- Sick/Vacation Toggle Buttons ---
  const showToggles =
    clockStatus === "idle" ||
    clockStatus === "sick" ||
    clockStatus === "vacation" ||
    clockStatus === "done";

  return (
    <>
      {/* Sick/Vacation Toggles */}
      {showToggles && (
        <div className="mb-4 md:mb-6">
          <div className="grid grid-cols-2 gap-2 md:gap-3">
            {/* Sick Day Toggle */}
            <button
              onClick={() => handleSickDay(false)}
              disabled={actionLoading || clockStatus === "vacation"}
              className={`flex flex-col items-center justify-between p-2 md:p-3 rounded-2xl border transition-all min-h-[100px] ${
                clockStatus === "sick"
                  ? "bg-rose-50 border-rose-200 shadow-md cursor-pointer hover:bg-rose-100"
                  : clockStatus === "vacation"
                    ? "bg-gray-50 border-gray-200 opacity-50 cursor-not-allowed"
                    : "bg-white border-[#F6F5F1] hover:border-rose-200 hover:bg-rose-50 cursor-pointer"
              }`}
            >
              <div className="text-center mb-2">
                <div className="text-xl mb-1">🤒</div>
                <h3
                  className={`text-xs font-bold ${clockStatus === "sick" ? "text-rose-900" : "text-[#1A1A1A]"}`}
                >
                  Sick Day
                </h3>
                {clockStatus === "sick" && (
                  <p className="text-[10px] text-rose-600 mt-1">
                    Click to undo
                  </p>
                )}
              </div>
              <div
                className={`w-10 h-6 rounded-full transition-colors relative ${clockStatus === "sick" ? "bg-rose-500" : "bg-[#E5E3DA]"}`}
              >
                <div
                  className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full shadow-sm transition-transform ${clockStatus === "sick" ? "translate-x-4" : ""}`}
                />
              </div>
            </button>

            {/* Vacation Day Toggle */}
            <button
              onClick={() => {
                // For vacation, we use the vacation request flow instead
              }}
              disabled={
                actionLoading ||
                clockStatus === "sick"
              }
              className={`flex flex-col items-center justify-between p-2 md:p-3 rounded-2xl border transition-all min-h-[100px] ${
                clockStatus === "vacation"
                  ? "bg-sky-50 border-sky-200 shadow-md cursor-pointer hover:bg-sky-100"
                  : clockStatus === "sick"
                    ? "bg-gray-50 border-gray-200 opacity-50 cursor-not-allowed"
                    : "bg-white border-[#F6F5F1] hover:border-sky-200 hover:bg-sky-50 cursor-pointer"
              }`}
            >
              <div className="text-center mb-2">
                <div className="text-xl mb-1">✈️</div>
                <h3
                  className={`text-xs font-bold ${clockStatus === "vacation" ? "text-sky-900" : "text-[#1A1A1A]"}`}
                >
                  Vacation
                </h3>
                {clockStatus === "vacation" && (
                  <p className="text-[10px] text-sky-600 mt-1">
                    Click to undo
                  </p>
                )}
              </div>
              <div
                className={`w-10 h-6 rounded-full transition-colors relative ${clockStatus === "vacation" ? "bg-sky-500" : "bg-[#E5E3DA]"}`}
              >
                <div
                  className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full shadow-sm transition-transform ${clockStatus === "vacation" ? "translate-x-4" : ""}`}
                />
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Main Clock Card */}
      <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-6 md:p-8 border border-[#F6F5F1] text-center relative overflow-hidden">
        {/* Status pill + time display */}
        <div className="mb-6 md:mb-8 mt-2 md:mt-4">
          <span
            className={`inline-block px-4 py-2 rounded-full text-xs font-bold tracking-wide uppercase ${
              clockStatus === "working"
                ? "bg-emerald-100 text-emerald-700"
                : clockStatus === "done"
                  ? "bg-[#F6F5F1] text-[#6B6B6B]"
                  : clockStatus === "sick"
                    ? "bg-rose-100 text-rose-700"
                    : clockStatus === "vacation"
                      ? "bg-sky-100 text-sky-700"
                      : "bg-[#F6F5F1] text-[#6B6B6B]"
            }`}
          >
            {clockStatus === "sick"
              ? "Sick Day"
              : clockStatus === "vacation"
                ? "Vacation"
                : clockStatus === "idle"
                  ? "Ready to Start"
                  : clockStatus === "done"
                    ? "Shift Complete"
                    : "Clocked In"}
          </span>

          <div className="mt-4 text-4xl md:text-5xl font-mono text-[#1A1A1A] tracking-tight">
            {clockStatus === "sick" || clockStatus === "vacation"
              ? "OFF"
              : new Date()
                  .toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })
                  .toLowerCase()}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-4">
          {clockStatus === "idle" && (
            <button
              onClick={handleClockIn}
              disabled={actionLoading}
              className="w-full py-4 md:py-5 bg-[#FF9500] text-white rounded-2xl font-bold text-xl hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {actionLoading ? "..." : "Clock In"}
            </button>
          )}

          {clockStatus === "working" && (
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              <button
                onClick={handleStartBreak}
                disabled={actionLoading}
                className="h-16 md:h-20 bg-[#F6F5F1] text-[#1A1A1A] rounded-2xl font-medium text-sm md:text-base hover:bg-[#E5E3DA] transition-colors disabled:opacity-50 border border-[#F6F5F1]"
              >
                Start Break
              </button>
              <button
                onClick={handleClockOut}
                disabled={actionLoading}
                className="h-16 md:h-20 bg-rose-900 text-white rounded-2xl font-medium text-sm md:text-base hover:bg-rose-800 transition-colors disabled:opacity-50"
              >
                Clock Out
              </button>
            </div>
          )}

          {clockStatus === "done" && status?.activeShift?.clockOutTime && (
            <div className="p-4 bg-emerald-50 rounded-2xl text-emerald-800 text-sm border border-emerald-100">
              You clocked out at{" "}
              {new Date(status.activeShift.clockOutTime).toLocaleTimeString(
                "en-US",
                { hour: "numeric", minute: "2-digit" }
              )}
              . <br /> See you tomorrow! Have a great evening.
            </div>
          )}

          {clockStatus === "sick" && (
            <div className="p-4 bg-rose-50 rounded-2xl text-rose-700 text-sm border border-rose-100">
              You are marked as sick today. Get well soon!
            </div>
          )}

          {clockStatus === "vacation" && (
            <div className="p-4 bg-sky-50 rounded-2xl text-sky-700 text-sm border border-sky-100">
              You are on vacation today. Enjoy!
            </div>
          )}
        </div>
      </div>

      {/* Today's Activity */}
      {status?.activeShift &&
        !status.activeShift.isSickDay &&
        !status.activeShift.isVacation && (
          <div className="mt-8 border-t border-[#F6F5F1] pt-6">
            <h3 className="text-base font-bold text-[#1A1A1A] mb-4">
              Today&apos;s Activity
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-[#6B6B6B]">Clock In</span>
                <span className="font-mono text-[#1A1A1A]">
                  {new Date(
                    status.activeShift.clockInTime
                  ).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              {((status.activeShift as any).breakCount > 0 || status.activeShift.totalBreakMinutes > 0) && (
                <div className="flex justify-between text-sm pl-4 border-l-2 border-amber-100">
                  <span className="text-[#6B6B6B]">Breaks</span>
                  <span className="font-mono text-[#1A1A1A]">
                    {status.activeShift.totalBreakMinutes > 0
                      ? `${status.activeShift.totalBreakMinutes}m`
                      : "< 1m"}
                  </span>
                </div>
              )}
              {status.activeShift.clockOutTime && (
                <div className="flex justify-between text-sm">
                  <span className="text-[#6B6B6B]">Clock Out</span>
                  <span className="font-mono text-[#1A1A1A]">
                    {new Date(
                      status.activeShift.clockOutTime
                    ).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
    </>
  );
}
