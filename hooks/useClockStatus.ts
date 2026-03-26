"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
  const [status, setStatus] = useState<ShiftStatus | null>(null);
  const [loading, setLoading] = useState(true);
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

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/timesheet/status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        // Notify other components (e.g. AdminNav status indicator)
        window.dispatchEvent(new CustomEvent("clockStatusChange"));
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  // Check for unresolved past-day missing clock-outs
  useEffect(() => {
    async function checkIssues() {
      try {
        const res = await fetch("/api/admin/timesheet/history");
        if (!res.ok) return;
        const entries: TimesheetEntry[] = await res.json();
        const today = new Date().toISOString().split("T")[0];

        const issue = entries.find((e) => {
          if (e.date >= today) return false;
          if (e.isSickDay || e.isVacation) return false;
          if (e.changeRequest) return false;
          if (!e.clockOutTime) return true;
          return false;
        });

        setIssueEntry(issue ?? null);
      } catch {
        // silent
      }
    }
    checkIssues();
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

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
      const res = await fetch("/api/admin/timesheet/clock-in", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        alert("Clock-in failed: " + (data.error || "Unknown error"));
      }
      await fetchStatus();
      onStatusChange?.();
    } catch (err) {
      console.error("Clock-in error:", err);
      alert("Clock-in failed. Check console.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleClockOut() {
    setActionLoading(true);
    try {
      await fetch("/api/admin/timesheet/clock-out", { method: "POST" });
      await fetchStatus();
      onStatusChange?.();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleStartBreak() {
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/timesheet/break/start", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.stoppedTimerTicketId) {
          setPausedTicketId(data.stoppedTimerTicketId);
        }
        window.dispatchEvent(new CustomEvent("timerChange"));
      }
      await fetchStatus();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleEndBreak() {
    if (!status?.activeBreak) return;
    setActionLoading(true);
    try {
      await fetch("/api/admin/timesheet/break/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ breakId: status.activeBreak.id }),
      });
      await fetchStatus();
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
      await fetch("/api/admin/timesheet/sick-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isHalf }),
      });
      await fetchStatus();
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

      await fetch("/api/admin/timesheet/change-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timesheetEntryId: issueEntry.id,
          proposedClockIn: issueEntry.clockInTime,
          proposedClockOut: clockOutDate.toISOString(),
          reason: "Forgot to clock out",
        }),
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
