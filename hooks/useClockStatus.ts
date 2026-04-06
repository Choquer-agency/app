"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import type { TimesheetEntry } from "@/types";

export interface ShiftStatus {
  isClockedIn: boolean;
  isOnBreak: boolean;
  activeShift: {
    id: string;
    clockInTime: string;
    totalBreakMinutes: number;
    isSickDay?: boolean;
    isVacation?: boolean;
    clockOutTime?: string;
    breakCount?: number;
  } | null;
  activeBreak: { id: string; startTime: string } | null;
}

export type ClockStatus = "idle" | "working" | "break" | "done" | "sick" | "vacation";

export function deriveClockStatus(status: ShiftStatus | null): ClockStatus {
  if (!status?.activeShift) return "idle";
  const shift = status.activeShift;
  if (shift.isSickDay) return "sick";
  if (shift.isVacation) return "vacation";
  if (shift.clockOutTime) return "done";
  if (status.isOnBreak) return "break";
  return "working";
}

export function useClockStatus(teamMemberId: string, onStatusChange?: () => void) {
  const typedId = teamMemberId as Id<"teamMembers">;

  // ── Real-time Convex queries (replaces polling) ──
  const activeShiftDoc = useQuery(api.timesheetEntries.getActiveShift, { teamMemberId: typedId });
  const activeBreakDoc = useQuery(
    api.timesheetBreaks.getActiveBreak,
    activeShiftDoc?._id ? { timesheetEntryId: activeShiftDoc._id } : "skip"
  );
  const breaksForEntry = useQuery(
    api.timesheetBreaks.listByEntry,
    activeShiftDoc?._id ? { timesheetEntryId: activeShiftDoc._id } : "skip"
  );

  // History query for issue detection (past open shifts)
  const recentEntries = useQuery(api.timesheetEntries.listByMember, {
    teamMemberId: typedId,
    limit: 30,
  });

  // ── Convex mutations ──
  const clockInMutation = useMutation(api.timesheetEntries.clockIn);
  const clockOutMutation = useMutation(api.timesheetEntries.clockOut);
  const startBreakMutation = useMutation(api.timesheetBreaks.startBreak);
  const endBreakMutation = useMutation(api.timesheetBreaks.endBreak);
  const markSickDayMutation = useMutation(api.timesheetEntries.markSickDay);
  const createChangeRequestMutation = useMutation(api.timesheetChangeRequests.create);
  const stopTimerByMemberMutation = useMutation(api.timeEntries.stopByMember);

  // ── Derive ShiftStatus from Convex queries ──
  const status: ShiftStatus | null = activeShiftDoc !== undefined
    ? {
        isClockedIn: !!activeShiftDoc && !activeShiftDoc.clockOutTime,
        isOnBreak: !!activeBreakDoc,
        activeShift: activeShiftDoc
          ? {
              id: activeShiftDoc._id,
              clockInTime: activeShiftDoc.clockInTime,
              totalBreakMinutes: activeShiftDoc.totalBreakMinutes ?? 0,
              isSickDay: activeShiftDoc.isSickDay,
              isVacation: activeShiftDoc.isVacation,
              clockOutTime: activeShiftDoc.clockOutTime,
              breakCount: breaksForEntry?.length ?? 0,
            }
          : null,
        activeBreak: activeBreakDoc
          ? { id: activeBreakDoc._id, startTime: activeBreakDoc.startTime }
          : null,
      }
    : null;

  const loading = activeShiftDoc === undefined;
  const [actionLoading, setActionLoading] = useState(false);
  const [breakTimer, setBreakTimer] = useState("00:00:00");
  const [pausedTicketId, setPausedTicketId] = useState<string | null>(null);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // Blocking issue: missing clock-out from a past day
  const [issueEntry, setIssueEntry] = useState<TimesheetEntry | null>(null);
  const [showFixModal, setShowFixModal] = useState(false);
  const [fixClockOut, setFixClockOut] = useState("");
  const [fixSubmitting, setFixSubmitting] = useState(false);

  // Detect past-day missing clock-out issues from real-time data
  useEffect(() => {
    if (!recentEntries) return;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Vancouver" });
    const issue = recentEntries.find((e) => {
      if (e.date >= today) return false;
      if (e.isSickDay || e.isVacation) return false;
      if ((e as any).changeRequest) return false;
      if (!e.clockOutTime) return true;
      return false;
    });

    if (issue) {
      setIssueEntry({
        id: issue._id,
        teamMemberId: issue.teamMemberId,
        date: issue.date,
        clockInTime: issue.clockInTime,
        clockOutTime: issue.clockOutTime ?? null,
        totalBreakMinutes: issue.totalBreakMinutes ?? 0,
        workedMinutes: issue.workedMinutes ?? null,
        isSickDay: issue.isSickDay ?? false,
        isHalfSickDay: issue.isHalfSickDay ?? false,
        isVacation: issue.isVacation ?? false,
        note: issue.note ?? "",
        issues: issue.issues ?? [],
        pendingApproval: issue.pendingApproval,
        sickHoursUsed: issue.sickHoursUsed,
        changeRequest: (issue as any).changeRequest,
      } as unknown as TimesheetEntry);
    } else {
      setIssueEntry(null);
    }
  }, [recentEntries]);

  // Dispatch window event when status changes (for AdminNav indicator)
  const prevStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const currentKey = status ? `${status.isClockedIn}-${status.isOnBreak}-${status.activeShift?.clockOutTime}` : "null";
    if (prevStatusRef.current !== null && prevStatusRef.current !== currentKey) {
      window.dispatchEvent(new CustomEvent("clockStatusChange"));
    }
    prevStatusRef.current = currentKey;
  }, [status]);

  const clockStatus = deriveClockStatus(status);

  // Break timer
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (clockStatus === "break" && status?.activeBreak) {
      const update = () => {
        const start = new Date(status.activeBreak!.startTime).getTime();
        const now = Date.now();
        const diff = Math.max(0, now - start);
        const hrs = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);
        setBreakTimer(
          `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
        );
      };
      update();
      intervalRef.current = setInterval(update, 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [clockStatus, status]);

  async function handleClockIn() {
    setActionLoading(true);
    try {
      await clockInMutation({ teamMemberId: typedId });
      onStatusChange?.();
    } catch (err) {
      console.error("Clock-in error:", err);
      alert("Clock-in failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleClockOut() {
    if (!activeShiftDoc?._id) return;
    setActionLoading(true);
    try {
      await clockOutMutation({ id: activeShiftDoc._id });
      onStatusChange?.();
    } catch (err) {
      console.error("Clock-out error:", err);
      alert("Clock-out failed. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleStartBreak() {
    if (!activeShiftDoc?._id) return;
    setActionLoading(true);
    try {
      // Auto-stop any running ticket timer when starting a break
      const stoppedTimer = await stopTimerByMemberMutation({ teamMemberId: typedId });
      if (stoppedTimer?.ticketId) {
        setPausedTicketId(stoppedTimer.ticketId);
      }
      await startBreakMutation({ timesheetEntryId: activeShiftDoc._id });
      window.dispatchEvent(new CustomEvent("timerChange"));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleEndBreak() {
    if (!status?.activeBreak) return;
    setActionLoading(true);
    try {
      await endBreakMutation({ id: status.activeBreak.id as Id<"timesheetBreaks"> });
      if (pausedTicketId) {
        setShowResumePrompt(true);
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleResumeTimer() {
    if (!pausedTicketId) return;
    try {
      await fetch(`/api/admin/tickets/${pausedTicketId}/time`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "start" }),
      });
      window.dispatchEvent(new CustomEvent("timerChange"));
    } catch {}
    setPausedTicketId(null);
    setShowResumePrompt(false);
  }

  function handleDismissResume() {
    setPausedTicketId(null);
    setShowResumePrompt(false);
  }

  async function handleSickDay(isHalf: boolean) {
    setActionLoading(true);
    try {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Vancouver" });
      await markSickDayMutation({
        teamMemberId: typedId,
        date: today,
        isHalf,
      });
      onStatusChange?.();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleFixSubmit() {
    if (!fixClockOut || !issueEntry) return;
    setFixSubmitting(true);
    try {
      const [h, m] = fixClockOut.split(":").map(Number);
      const clockOutDate = new Date(issueEntry.date + "T00:00:00");
      clockOutDate.setHours(h, m, 0, 0);

      await createChangeRequestMutation({
        timesheetEntryId: issueEntry.id as Id<"timesheetEntries">,
        teamMemberId: typedId,
        proposedClockIn: issueEntry.clockInTime,
        proposedClockOut: clockOutDate.toISOString(),
        reason: "Forgot to clock out",
      });
      setIssueEntry(null);
      setShowFixModal(false);
      onStatusChange?.();
    } catch {
      alert("Failed to submit. Please try again.");
    } finally {
      setFixSubmitting(false);
    }
  }

  return {
    status,
    clockStatus,
    loading,
    actionLoading,
    breakTimer,
    pausedTicketId,
    showResumePrompt,
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
    setIssueEntry,
  };
}
