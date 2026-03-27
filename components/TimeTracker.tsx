"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { TimeEntry } from "@/types";
import TimePopup from "./TimePopup";

interface TimeTrackerProps {
  ticketId: string;
  onTimerChange?: () => void;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatTotalHours(seconds: number): string {
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 1) return "";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
}

export default function TimeTracker({ ticketId, onTimerChange }: TimeTrackerProps) {
  const [running, setRunning] = useState(false);
  const [runningEntryId, setRunningEntryId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [clockInRequired, setClockInRequired] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const clockButtonRef = useRef<HTMLDivElement>(null);

  const fetchTimeData = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}/time`);
      if (res.ok) {
        const data = await res.json();
        const allEntries = (data.entries || []) as TimeEntry[];
        setEntries(allEntries);

        // Compute total client-side from actual entry time ranges (not stored duration_seconds)
        const completedTotal = allEntries
          .filter((e: TimeEntry) => e.endTime !== null)
          .reduce((sum: number, e: TimeEntry) => {
            const start = new Date(e.startTime).getTime();
            const end = new Date(e.endTime!).getTime();
            return sum + Math.max(0, Math.round((end - start) / 1000));
          }, 0);
        setTotalSeconds(completedTotal);

        const runningEntry = allEntries.find(
          (e: TimeEntry) => e.endTime === null
        );
        if (runningEntry) {
          setRunning(true);
          setRunningEntryId(runningEntry.id);
          setStartTime(runningEntry.startTime);
        } else {
          setRunning(false);
          setRunningEntryId(null);
          setStartTime(null);
        }
      }
    } catch {}
  }, [ticketId]);

  useEffect(() => {
    fetchTimeData();
  }, [fetchTimeData]);

  useEffect(() => {
    function handleTimerChange() {
      fetchTimeData();
    }
    window.addEventListener("timerChange", handleTimerChange);
    return () => window.removeEventListener("timerChange", handleTimerChange);
  }, [fetchTimeData]);

  // Live counter
  useEffect(() => {
    if (running && startTime) {
      const update = () => {
        const diff = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
        setElapsed(Math.max(0, diff));
      };
      update();
      intervalRef.current = setInterval(update, 1000);
      return () => clearInterval(intervalRef.current);
    } else {
      setElapsed(0);
      return () => clearInterval(intervalRef.current);
    }
  }, [running, startTime]);

  async function handleToggle() {
    if (running) {
      await handleStop();
    } else {
      await handleStart();
    }
  }

  async function handleStart() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}/time`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "start" }),
      });
      if (res.ok) {
        const entry = await res.json();
        setRunning(true);
        setRunningEntryId(entry.id);
        setStartTime(entry.startTime);
        onTimerChange?.();
      } else {
        const err = await res.json().catch(() => ({}));
        if (res.status === 403 && err.error?.includes("clock in")) {
          setClockInRequired(true);
          setTimeout(() => setClockInRequired(false), 5000);
        }
        console.error("Timer start failed:", res.status, err);
      }
    } catch (e) {
      console.error("Timer start error:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleStop() {
    if (!runningEntryId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}/time/${runningEntryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      if (res.ok) {
        setRunning(false);
        setRunningEntryId(null);
        setStartTime(null);
        await fetchTimeData();
        onTimerChange?.();
      }
    } catch {} finally {
      setLoading(false);
    }
  }

  const displayTotal = formatTotalHours(totalSeconds + (running ? elapsed : 0));

  return (
    <div className="relative" ref={wrapperRef}>
      {/* Clock-in required toast */}
      {clockInRequired && (
        <div className="absolute bottom-full left-0 mb-2 z-50 whitespace-nowrap">
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium px-3 py-2 rounded-lg shadow-lg">
            Clock in first to start tracking time
          </div>
        </div>
      )}
      <div className="flex items-center gap-1">
        {/* Play/Stop + label — single button */}
        <button
          onClick={handleToggle}
          disabled={loading}
          className={`flex items-center gap-1.5 text-sm transition rounded-md px-2 py-1 ${
            running
              ? "text-red-600 hover:bg-red-50"
              : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-gray-50"
          }`}
          title={running ? "Stop timer" : "Start timer"}
        >
          {running ? (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
              </svg>
              <span className="font-mono text-xs tabular-nums text-red-600">
                {formatDuration(elapsed)}
              </span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
              <span>Start</span>
            </>
          )}
        </button>

        {/* Clock icon — always visible, opens time popup */}
        <div className="relative" ref={clockButtonRef}>
          <button
            onClick={() => setPopupOpen(!popupOpen)}
            className="flex items-center text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-gray-50 transition rounded-md p-1"
            title="Add or view time entries"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </button>

          {popupOpen && (
            <TimePopup
              ticketId={ticketId}
              entries={entries}
              totalSeconds={totalSeconds + (running ? elapsed : 0)}
              onClose={() => setPopupOpen(false)}
              onEntriesChanged={() => {
                fetchTimeData();
                onTimerChange?.();
              }}
              anchorRef={clockButtonRef}
            />
          )}
        </div>

        {/* Total hours display */}
        {displayTotal && (
          <span className="text-xs text-[var(--muted)] px-1 py-0.5">
            {displayTotal}
          </span>
        )}
      </div>
    </div>
  );
}

export { formatDuration, formatTotalHours };
