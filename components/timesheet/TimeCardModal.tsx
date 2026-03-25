"use client";

import React, { useState, useEffect } from "react";
import type { TimesheetEntry, TimesheetBreak } from "@/types";
import TimePicker from "./TimePicker";

// NOTE: Add the following to tailwind.config.ts under theme.extend.animation:
//   'slide-in-right': 'slideInRight 0.3s ease-out forwards',
// And under theme.extend.keyframes:
//   slideInRight: {
//     '0%': { transform: 'translateX(100%)' },
//     '100%': { transform: 'translateX(0)' },
//   },

interface TimeCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry: TimesheetEntry | null;
  breaks: TimesheetBreak[];
  employeeName: string;
  date: string;
  isEmployeeView: boolean;
  readOnly?: boolean;
  onSave: (updates: Partial<TimesheetEntry>, breaks: TimesheetBreak[]) => void;
  onDelete: (id: string) => void;
  onApproveChangeRequest?: (entryId: string) => void;
  onDenyChangeRequest?: (entryId: string) => void;
  onApprovePartialSick?: (entryId: string) => void;
  onDenyPartialSick?: (entryId: string) => void;
  onApproveVacation?: (entryId: string) => void;
  onDenyVacation?: (entryId: string) => void;
  standardWorkDayHours?: number;
}

// === Local Helpers ===

/** Convert "HH:mm" time input + YYYY-MM-DD base date to ISO string */
function getISOFromTimeInput(baseDateStr: string, timeInput: string): string {
  const [year, month, day] = baseDateStr.split("-").map(Number);
  const [hours, minutes] = timeInput.split(":").map(Number);
  const date = new Date(year, month - 1, day, hours, minutes);
  return date.toISOString();
}

/** Convert ISO string to "HH:mm" time input value */
function getTimeInputFromISO(isoString: string | null): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** Format ISO string for human display */
function formatTimeForDisplay(isoString: string | null): string {
  if (!isoString) return "Not set";
  return new Date(isoString).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Calculate minutes between two ISO date strings */
function calculateMinutes(
  startIso: string | null,
  endIso: string | null
): number {
  if (!startIso) return 0;
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  return Math.max(0, Math.floor((end - start) / 1000 / 60));
}

/** Format minutes as "Xh Ym" */
function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0h 0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

/** Calculate worked and break minutes from form state */
function calculateStats(
  clockInIso: string | null,
  clockOutIso: string | null,
  breaks: TimesheetBreak[]
): { totalWorkedMinutes: number; totalBreakMinutes: number } {
  if (!clockInIso) return { totalWorkedMinutes: 0, totalBreakMinutes: 0 };

  const grossMinutes = calculateMinutes(clockInIso, clockOutIso);

  let totalBreakMinutes = 0;
  for (const b of breaks) {
    totalBreakMinutes += calculateMinutes(b.startTime, b.endTime);
  }

  const totalWorkedMinutes = Math.max(0, grossMinutes - totalBreakMinutes);
  return { totalWorkedMinutes, totalBreakMinutes };
}

// === Button Styles ===

const btnPrimary =
  "bg-[#FF9500] hover:bg-[#E68600] text-white rounded-lg px-6 py-3 font-bold transition-colors";
const btnOutline =
  "border border-[#E5E3DA] text-[#484848] rounded-lg px-6 py-3 font-bold hover:bg-[#F0EEE6] transition-colors";
const btnDanger =
  "bg-rose-600 hover:bg-rose-700 text-white rounded-lg px-6 py-3 font-bold transition-colors";
const btnApprove =
  "bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-6 py-3 font-bold transition-colors";

export default function TimeCardModal({
  isOpen,
  onClose,
  entry,
  breaks: initialBreaks,
  employeeName,
  date,
  isEmployeeView,
  readOnly = false,
  onSave,
  onDelete,
  onApproveChangeRequest,
  onDenyChangeRequest,
  onApprovePartialSick,
  onDenyPartialSick,
  onApproveVacation,
  onDenyVacation,
  standardWorkDayHours = 8,
}: TimeCardModalProps) {
  // Form state
  const [clockInInput, setClockInInput] = useState("");
  const [clockOutInput, setClockOutInput] = useState("");
  const [isSickDay, setIsSickDay] = useState(false);
  const [isHalfSickDay, setIsHalfSickDay] = useState(false);
  const [isVacation, setIsVacation] = useState(false);
  const [note, setNote] = useState("");
  const [formBreaks, setFormBreaks] = useState<TimesheetBreak[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Initialize form when modal opens or entry changes
  useEffect(() => {
    if (isOpen) {
      if (entry) {
        setClockInInput(getTimeInputFromISO(entry.clockInTime));
        setClockOutInput(getTimeInputFromISO(entry.clockOutTime));
        setIsSickDay(entry.isSickDay);
        setIsHalfSickDay(entry.isHalfSickDay);
        setIsVacation(entry.isVacation);
        setNote(entry.note || "");
        setFormBreaks(JSON.parse(JSON.stringify(initialBreaks)));
      } else {
        setClockInInput("");
        setClockOutInput("");
        setIsSickDay(false);
        setIsHalfSickDay(false);
        setIsVacation(false);
        setNote("");
        setFormBreaks([]);
      }
      setError(null);
    }
  }, [isOpen, entry, initialBreaks]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isFullSickDay = isSickDay && !clockInInput;
  const isOffDay = isFullSickDay || isVacation;

  // Live stats calculation
  const clockInIso =
    !isOffDay && clockInInput
      ? getISOFromTimeInput(date, clockInInput)
      : null;
  const clockOutIso =
    !isOffDay && clockOutInput
      ? getISOFromTimeInput(date, clockOutInput)
      : null;
  const stats = calculateStats(clockInIso, clockOutIso, isOffDay ? [] : formBreaks);

  // --- Change request detection ---
  // In Choquer, change requests are separate records. The parent page should pass
  // change request data via entry fields or separate props. For now we check for
  // issues array containing relevant flags.
  const hasChangeRequest =
    entry?.issues?.includes("MISSING_CLOCK_OUT") === false &&
    false; // Change requests are handled via separate props/callbacks
  const hasPendingVacation = isVacation && entry !== null;
  const hasPendingPartialSick = isSickDay && isHalfSickDay && entry !== null;

  // --- Handlers ---

  const handleToggleOffDay = (type: "sick" | "vacation") => {
    if (type === "sick") {
      const newSick = !isSickDay;
      setIsSickDay(newSick);
      setIsVacation(false);
      if (!newSick) setIsHalfSickDay(false);
    } else {
      const newVacation = !isVacation;
      setIsVacation(newVacation);
      setIsSickDay(false);
      setIsHalfSickDay(false);
    }
  };

  const addBreak = () => {
    const newBreak: TimesheetBreak = {
      id: crypto.randomUUID(),
      timesheetEntryId: entry?.id || "",
      startTime: getISOFromTimeInput(date, "12:00"),
      endTime: getISOFromTimeInput(date, "12:30"),
      breakType: "unpaid",
      durationMinutes: 30,
    };
    setFormBreaks((prev) => [...prev, newBreak]);
  };

  const removeBreak = (breakId: string) => {
    setFormBreaks((prev) => prev.filter((b) => b.id !== breakId));
  };

  const updateBreak = (
    breakId: string,
    field: "startTime" | "endTime",
    timeValue: string
  ) => {
    setFormBreaks((prev) =>
      prev.map((b) => {
        if (b.id === breakId) {
          return {
            ...b,
            [field]: timeValue ? getISOFromTimeInput(date, timeValue) : null,
          };
        }
        return b;
      })
    );
  };

  const handleSave = () => {
    setError(null);

    const finalIsOffDay = isSickDay || isVacation;
    const finalClockIn = finalIsOffDay
      ? null
      : clockInInput
        ? getISOFromTimeInput(date, clockInInput)
        : null;
    const finalClockOut = finalIsOffDay
      ? null
      : clockOutInput
        ? getISOFromTimeInput(date, clockOutInput)
        : null;
    const finalBreaks = finalIsOffDay ? [] : formBreaks;

    // Validation
    if (!finalIsOffDay) {
      if (!finalClockIn && finalBreaks.length > 0) {
        setError("Cannot log breaks without a clock-in time.");
        return;
      }

      if (finalBreaks.length > 0) {
        const sortedBreaks = [...finalBreaks].sort(
          (a, b) =>
            new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );

        const clockInTime = finalClockIn
          ? new Date(finalClockIn).getTime()
          : 0;
        const clockOutTime = finalClockOut
          ? new Date(finalClockOut).getTime()
          : null;

        for (let i = 0; i < sortedBreaks.length; i++) {
          const b = sortedBreaks[i];
          const bStart = new Date(b.startTime).getTime();
          const bEnd = b.endTime ? new Date(b.endTime).getTime() : null;

          if (finalClockIn && bStart < clockInTime) {
            setError("A break cannot start before clock-in time.");
            return;
          }

          if (clockOutTime) {
            if (bStart > clockOutTime) {
              setError("A break cannot start after clock-out.");
              return;
            }
            if (bEnd && bEnd > clockOutTime) {
              setError("A break must end before or at clock-out.");
              return;
            }
          }

          if (bEnd && i < sortedBreaks.length - 1) {
            const nextBreakStart = new Date(
              sortedBreaks[i + 1].startTime
            ).getTime();
            if (bEnd > nextBreakStart) {
              setError("Breaks cannot overlap.");
              return;
            }
          }
        }
      }
    }

    const updates: Partial<TimesheetEntry> = {
      clockInTime: finalClockIn ?? undefined,
      clockOutTime: finalClockOut,
      isSickDay,
      isHalfSickDay,
      isVacation,
      note,
      totalBreakMinutes: stats.totalBreakMinutes,
      workedMinutes: stats.totalWorkedMinutes,
    };

    onSave(updates, finalBreaks);
    onClose();
  };

  // --- Determine footer mode ---
  const hasApproveChangeRequest =
    !isEmployeeView &&
    onApproveChangeRequest &&
    onDenyChangeRequest &&
    entry;
  const hasApprovePartialSick =
    !isEmployeeView &&
    onApprovePartialSick &&
    onDenyPartialSick &&
    entry?.isHalfSickDay &&
    entry?.isSickDay;
  const hasApproveVacation =
    !isEmployeeView &&
    onApproveVacation &&
    onDenyVacation &&
    entry?.isVacation;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#484848]/40 backdrop-blur-sm transition-all overflow-hidden"
      onClick={onClose}
      style={{ touchAction: "none" }}
    >
      <div
        className="absolute right-0 top-0 bottom-0 w-full md:max-w-2xl bg-[#FAF9F5] shadow-2xl md:rounded-none animate-slide-in-right overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="absolute top-0 left-0 right-0 z-10 flex justify-between items-start p-4 md:p-8 md:pb-4 bg-[#FAF9F5] border-b border-[#F6F5F1] md:border-b-0"
          style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 16px)" }}
        >
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-[#1A1A1A]">
              {employeeName}
            </h2>
            <p className="text-[#6B6B6B] font-medium text-sm">
              {(() => {
                const [year, month, day] = date.split("-").map(Number);
                return new Date(year, month - 1, day).toLocaleDateString(
                  "en-US",
                  { weekday: "long", month: "long", day: "numeric" }
                );
              })()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#9CA3AF] hover:text-[#484848] p-2 -mr-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <svg
              className="w-8 h-8 md:w-6 md:h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div
          className="absolute inset-0 overflow-y-auto pt-[88px] md:pt-[100px] pb-[140px] md:pb-[120px] px-4 md:px-8"
          style={{
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {/* Vacation Request Pending Banner (Admin Only) */}
          {!isEmployeeView &&
            entry?.isVacation &&
            onApproveVacation &&
            onDenyVacation && (
              <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-2xl">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                    <span className="text-2xl">
                      <svg
                        className="w-5 h-5 text-purple-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                        />
                      </svg>
                    </span>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-purple-900 text-base mb-1">
                      Vacation Request Pending
                    </h4>
                    <p className="text-sm text-purple-700">
                      {employeeName} has requested this day off as vacation.
                      Review and approve or deny the request below.
                    </p>
                  </div>
                </div>
              </div>
            )}

          {/* Partial Sick Day Request Banner (Admin Only) */}
          {!isEmployeeView &&
            entry?.isSickDay &&
            entry?.isHalfSickDay &&
            onApprovePartialSick &&
            onDenyPartialSick && (
              <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center">
                    <svg
                      className="w-5 h-5 text-rose-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                      />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-rose-900 text-base mb-1">
                      Partial Sick Day Request
                    </h4>
                    <p className="text-sm text-rose-700">
                      {employeeName} worked a partial day and is requesting sick
                      time. Review and approve or deny below.
                    </p>
                  </div>
                </div>
              </div>
            )}

          {/* Change Request Banner (Admin Only) */}
          {!isEmployeeView &&
            onApproveChangeRequest &&
            onDenyChangeRequest &&
            entry && (
              <div className="mb-6 p-4 bg-[#FFF7ED] border border-[#FDBA74] rounded-2xl">
                <div className="mb-3">
                  <h4 className="font-bold text-[#1A1A1A] text-base">
                    Change Requested
                  </h4>
                  <p className="text-sm text-[#1A1A1A]">
                    Showing employee&apos;s requested changes. Original values
                    below for reference.
                  </p>
                </div>
                <div className="mt-3 pt-3 border-t border-[#FDBA74]/30 space-y-2 text-xs text-[#6B6B6B]">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Original Clock In:</span>
                    <span className="font-mono">
                      {formatTimeForDisplay(entry.clockInTime)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Original Clock Out:</span>
                    <span className="font-mono">
                      {formatTimeForDisplay(entry.clockOutTime)}
                    </span>
                  </div>
                  {(() => {
                    const originalStats = calculateStats(
                      entry.clockInTime,
                      entry.clockOutTime,
                      initialBreaks
                    );
                    const proposedStats = calculateStats(
                      clockInIso,
                      clockOutIso,
                      formBreaks
                    );
                    const timeDiffMinutes =
                      proposedStats.totalWorkedMinutes -
                      originalStats.totalWorkedMinutes;
                    const isIncrease = timeDiffMinutes > 0;
                    const absMinutes = Math.abs(timeDiffMinutes);
                    const hours = Math.floor(absMinutes / 60);
                    const minutes = absMinutes % 60;

                    let adjustmentText = "";
                    if (timeDiffMinutes === 0) {
                      adjustmentText = "No change";
                    } else {
                      const sign = isIncrease ? "+" : "-";
                      if (hours > 0 && minutes > 0) {
                        adjustmentText = `${sign}${hours} ${hours === 1 ? "hour" : "hours"} ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
                      } else if (hours > 0) {
                        adjustmentText = `${sign}${hours} ${hours === 1 ? "hour" : "hours"}`;
                      } else {
                        adjustmentText = `${sign}${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
                      }
                    }

                    return (
                      <>
                        <div
                          className={`flex justify-between items-center pt-1 border-t border-[#FDBA74]/20 ${isIncrease ? "text-emerald-600" : timeDiffMinutes < 0 ? "text-rose-600" : "text-[#6B6B6B]"}`}
                        >
                          <span className="font-bold">
                            Total Time Adjustment:
                          </span>
                          <span className="font-mono font-bold">
                            {adjustmentText}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-[#1A1A1A]">
                          <span className="font-bold">
                            Total Hours Worked:
                          </span>
                          <span className="font-mono font-bold">
                            {formatDuration(proposedStats.totalWorkedMinutes)}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                  {initialBreaks.length > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Original Breaks:</span>
                      <span className="font-mono">
                        {initialBreaks.length} break(s)
                      </span>
                    </div>
                  )}
                  {(entry.isSickDay || entry.isVacation) && (
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Original Status:</span>
                      <span className="font-semibold">
                        {entry.isSickDay && entry.clockInTime
                          ? "Partial Sick"
                          : entry.isSickDay
                            ? "Sick Day"
                            : entry.isVacation
                              ? "Vacation"
                              : "Regular Day"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

          {/* Change Request Info (Employee Only) */}
          {isEmployeeView && entry && (
            <div className="mb-6 p-3 bg-blue-50 border border-blue-100 rounded-2xl text-xs text-blue-700">
              <span className="font-bold">Note:</span> Submitting will create a
              change request for admin review.
            </div>
          )}

          {/* Main Content */}
          <div className="flex-1 space-y-4 md:space-y-6">
            {/* Sick / Vacation Toggle Cards */}
            <div className="flex flex-col md:flex-row gap-4">
              {/* Sick Day Toggle */}
              <div
                onClick={() => !readOnly && handleToggleOffDay("sick")}
                className={`flex-1 flex items-center justify-between p-4 rounded-2xl border ${readOnly ? "cursor-default opacity-75" : "cursor-pointer"} ${isSickDay ? "bg-rose-50 border-rose-200" : "bg-[#FAF9F5] border-[#E5E3DA]"}`}
              >
                <div>
                  <h3
                    className={`text-base font-bold ${isSickDay ? "text-rose-900" : "text-[#1A1A1A]"}`}
                  >
                    Sick Day
                  </h3>
                  <p
                    className={`text-sm ${isSickDay ? "text-rose-700" : "text-[#6B6B6B]"}`}
                  >
                    {isSickDay ? "Marked as sick leave" : "Mark as sick leave"}
                  </p>
                </div>
                <div
                  className={`w-12 h-7 rounded-full transition-colors relative ${isSickDay ? "bg-rose-500" : "bg-[#E5E3DA]"}`}
                >
                  <div
                    className={`absolute top-1 left-1 bg-white w-5 h-5 rounded-full shadow-sm transition-transform ${isSickDay ? "translate-x-5" : ""}`}
                  />
                </div>
              </div>

              {/* Vacation Day Toggle */}
              <div
                onClick={() => !readOnly && handleToggleOffDay("vacation")}
                className={`flex-1 flex items-center justify-between p-4 rounded-2xl border ${readOnly ? "cursor-default opacity-75" : "cursor-pointer"} ${isVacation ? "bg-sky-50 border-sky-200" : "bg-[#FAF9F5] border-[#E5E3DA]"}`}
              >
                <div>
                  <h3
                    className={`text-base font-bold ${isVacation ? "text-sky-900" : "text-[#1A1A1A]"}`}
                  >
                    Vacation
                  </h3>
                  <p
                    className={`text-sm ${isVacation ? "text-sky-700" : "text-[#6B6B6B]"}`}
                  >
                    Mark as vacation
                  </p>
                </div>
                <div
                  className={`w-12 h-7 rounded-full transition-colors relative ${isVacation ? "bg-sky-500" : "bg-[#E5E3DA]"}`}
                >
                  <div
                    className={`absolute top-1 left-1 bg-white w-5 h-5 rounded-full shadow-sm transition-transform ${isVacation ? "translate-x-5" : ""}`}
                  />
                </div>
              </div>
            </div>

            {!isOffDay && (
              <>
                {/* Shift Hours Section */}
                <section className="bg-[#FAF9F5] p-6 rounded-2xl border border-[#E5E3DA]">
                  <div className="flex justify-between items-end mb-4">
                    <h3 className="text-base font-bold text-[#1A1A1A]">
                      Shift Hours
                    </h3>
                    <span className="text-2xl font-bold font-mono text-[#1A1A1A]">
                      {formatDuration(stats.totalWorkedMinutes)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 md:gap-6">
                    <div
                      className={
                        readOnly ? "opacity-75 pointer-events-none" : ""
                      }
                    >
                      <TimePicker
                        label="Clock In"
                        value={clockInInput || null}
                        onChange={setClockInInput}
                      />
                      {!isEmployeeView &&
                        onApproveChangeRequest &&
                        entry && (
                          <div className="mt-1 text-xs text-[#9CA3AF] pl-1">
                            Original:{" "}
                            <span className="font-mono">
                              {formatTimeForDisplay(entry.clockInTime)}
                            </span>
                          </div>
                        )}
                    </div>
                    <div
                      className={
                        readOnly ? "opacity-75 pointer-events-none" : ""
                      }
                    >
                      <TimePicker
                        label="Clock Out"
                        value={clockOutInput || null}
                        onChange={setClockOutInput}
                      />
                      {!isEmployeeView &&
                        onApproveChangeRequest &&
                        entry && (
                          <div className="mt-1 text-xs text-[#9CA3AF] pl-1">
                            Original:{" "}
                            <span className="font-mono">
                              {formatTimeForDisplay(entry.clockOutTime)}
                            </span>
                          </div>
                        )}
                    </div>
                  </div>
                </section>

                {/* Unpaid Breaks Section */}
                <section className="bg-[#FAF9F5] p-6 rounded-2xl border border-[#E5E3DA]">
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-baseline gap-4">
                      <h3 className="text-base font-bold text-[#1A1A1A]">
                        Unpaid Breaks
                      </h3>
                      <span className="text-xs font-medium text-[#6B6B6B] bg-[#F0EEE6] px-3 py-1 rounded-full">
                        Total: {formatDuration(stats.totalBreakMinutes)}
                      </span>
                    </div>
                    {!readOnly && (
                      <button
                        onClick={addBreak}
                        className="text-[#484848] border border-[#F6F5F1] hover:bg-[#F0EEE6] rounded-lg px-4 py-2 text-sm font-bold transition-colors"
                      >
                        + Add
                      </button>
                    )}
                  </div>

                  {!isEmployeeView &&
                    onApproveChangeRequest &&
                    initialBreaks.length > 0 && (
                      <div className="mb-3 text-xs text-[#9CA3AF] pl-1">
                        Original: {initialBreaks.length} break(s) totaling{" "}
                        {formatDuration(
                          calculateStats(
                            entry?.clockInTime ?? null,
                            entry?.clockOutTime ?? null,
                            initialBreaks
                          ).totalBreakMinutes
                        )}
                      </div>
                    )}

                  <div
                    className={`space-y-3 ${readOnly ? "opacity-75" : ""}`}
                  >
                    {formBreaks.length === 0 && (
                      <p className="text-sm text-[#9CA3AF] italic">
                        No breaks recorded.
                      </p>
                    )}
                    {formBreaks.map((b) => (
                      <div
                        key={b.id}
                        className="relative group flex flex-col md:flex-row items-center gap-3 p-3 rounded-2xl border border-[#F6F5F1] bg-[#FAF9F5]"
                      >
                        <div
                          className={`flex-1 w-full grid grid-cols-2 gap-3 ${readOnly ? "pointer-events-none" : ""}`}
                        >
                          <TimePicker
                            value={getTimeInputFromISO(b.startTime) || null}
                            onChange={(val) =>
                              updateBreak(b.id, "startTime", val)
                            }
                          />
                          <TimePicker
                            value={getTimeInputFromISO(b.endTime) || null}
                            onChange={(val) =>
                              updateBreak(b.id, "endTime", val)
                            }
                          />
                        </div>
                        {!readOnly && (
                          <button
                            onClick={() => removeBreak(b.id)}
                            className="absolute -top-2 -right-2 md:static md:bg-transparent md:p-2 bg-white rounded-full shadow-sm border border-[#F6F5F1] md:border-none md:shadow-none text-[#9CA3AF] hover:text-rose-500 transition-colors"
                          >
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}

            {/* Notes Section */}
            <section className="bg-[#FAF9F5] p-6 rounded-2xl border border-[#E5E3DA]">
              <h3 className="text-base font-bold text-[#1A1A1A] mb-3">
                {isEmployeeView
                  ? "Reason for Adjustment"
                  : readOnly
                    ? "Notes"
                    : "Admin Notes"}
              </h3>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  isEmployeeView
                    ? "I forgot to clock in because..."
                    : "Add internal notes about this shift..."
                }
                className={`w-full p-3 text-sm bg-white border border-[#E5E3DA] rounded-2xl focus:ring-2 focus:ring-[#FF9500] focus:border-[#FF9500] ${readOnly ? "opacity-75 cursor-default" : ""}`}
                readOnly={readOnly}
              />
            </section>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          className="absolute bottom-0 left-0 right-0 z-10 px-4 md:px-8 pt-4 md:pt-6 flex flex-col gap-4 bg-[#FAF9F5] border-t border-[#F6F5F1]"
          style={{
            paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)",
          }}
        >
          {error && !readOnly && (
            <div className="bg-rose-50 text-rose-700 p-3 rounded-2xl text-sm flex items-center gap-2">
              <svg
                className="w-5 h-5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {error}
            </div>
          )}

          {/* Read-only mode */}
          {readOnly ? (
            <div className="flex justify-center w-full">
              <button onClick={onClose} className={btnOutline + " px-8"}>
                Close
              </button>
            </div>
          ) : /* Admin + change request pending */
          hasApproveChangeRequest ? (
            <div className="flex flex-col gap-3">
              <div className="flex gap-3 w-full">
                <button
                  onClick={onClose}
                  className={btnOutline + " flex-1 justify-center"}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onDenyChangeRequest!(entry!.id);
                    onClose();
                  }}
                  className={btnDanger + " flex-1 justify-center"}
                >
                  Deny Changes
                </button>
                <button
                  onClick={() => {
                    onApproveChangeRequest!(entry!.id);
                    onClose();
                  }}
                  className={btnApprove + " flex-1 justify-center"}
                >
                  Approve Changes
                </button>
              </div>
              {entry && (
                <button
                  onClick={() => {
                    if (
                      confirm(
                        "Are you sure you want to completely delete this time card?"
                      )
                    ) {
                      onDelete(entry.id);
                      onClose();
                    }
                  }}
                  className="text-sm text-rose-600 hover:text-rose-700 text-center py-2"
                >
                  Delete Entry
                </button>
              )}
            </div>
          ) : /* Admin + partial sick pending */
          hasApprovePartialSick ? (
            <div className="flex flex-col gap-3">
              <div className="flex gap-3 w-full">
                <button
                  onClick={onClose}
                  className={btnOutline + " flex-1 justify-center"}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onDenyPartialSick!(entry!.id);
                    onClose();
                  }}
                  className={btnDanger + " flex-1 justify-center"}
                >
                  Deny Sick Day
                </button>
                <button
                  onClick={() => {
                    onApprovePartialSick!(entry!.id);
                    onClose();
                  }}
                  className={btnApprove + " flex-1 justify-center"}
                >
                  Approve ({standardWorkDayHours}h)
                </button>
              </div>
            </div>
          ) : /* Admin + vacation pending */
          hasApproveVacation ? (
            <div className="flex flex-col gap-3">
              <div className="flex gap-3 w-full">
                <button
                  onClick={onClose}
                  className={btnOutline + " flex-1 justify-center"}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onDenyVacation!(entry!.id);
                    onClose();
                  }}
                  className={btnDanger + " flex-1 justify-center"}
                >
                  Deny Vacation
                </button>
                <button
                  onClick={() => {
                    onApproveVacation!(entry!.id);
                    onClose();
                  }}
                  className={btnApprove + " flex-1 justify-center"}
                >
                  Approve Vacation
                </button>
              </div>
            </div>
          ) : (
            /* Normal edit mode or employee view */
            <div className="flex flex-col-reverse md:flex-row justify-between items-center w-full gap-4">
              {!isEmployeeView && entry && (
                <button
                  onClick={() => {
                    if (
                      confirm(
                        "Are you sure you want to completely delete this time card?"
                      )
                    ) {
                      onDelete(entry.id);
                      onClose();
                    }
                  }}
                  className="text-sm text-rose-600 hover:text-rose-700 w-full md:w-auto text-center py-2"
                >
                  Delete Entry
                </button>
              )}
              <div className="flex gap-3 ml-auto w-full md:w-auto">
                <button
                  onClick={onClose}
                  className={
                    btnOutline + " flex-1 md:flex-none justify-center"
                  }
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className={
                    btnPrimary + " flex-1 md:flex-none justify-center"
                  }
                >
                  {isEmployeeView ? "Submit Request" : "Save Changes"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
