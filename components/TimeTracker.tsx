"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { TimeEntry } from "@/types";
import TimePopup from "./TimePopup";
import { useSession } from "@/hooks/useSession";

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
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [clockInRequired, setClockInRequired] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const clockButtonRef = useRef<HTMLDivElement>(null);
  const session = useSession();
  const currentMemberId = session?.teamMemberId ?? null;

  // Real-time Convex subscription — auto-updates when timers start/stop
  const rawEntries = useQuery(api.timeEntries.listByTicket, {
    ticketId: ticketId as Id<"tickets">,
  });

  // Map Convex docs to TimeEntry type and derive state
  const entries: TimeEntry[] = useMemo(() =>
    (rawEntries ?? []).map((doc: any) => ({
      id: doc._id,
      ticketId: doc.ticketId,
      teamMemberId: doc.teamMemberId,
      startTime: doc.startTime,
      endTime: doc.endTime ?? null,
      durationSeconds: doc.durationSeconds ?? null,
      isManual: doc.isManual ?? false,
      note: doc.note ?? "",
      createdAt: doc._creationTime ? new Date(doc._creationTime).toISOString() : "",
      rate: doc.rate ?? 1.0,
    })),
  [rawEntries]);

  // Only the current user's running timer drives the play/stop button —
  // teammates' active timers live on their avatar's red dot instead, so
  // anyone can start their own timer on the same ticket concurrently.
  const runningEntry = entries.find(
    (e) => e.endTime === null && String(e.teamMemberId) === String(currentMemberId)
  );
  const running = !!runningEntry;
  const runningEntryId = runningEntry?.id ?? null;
  const startTime = runningEntry?.startTime ?? null;
  const runningRate = runningEntry?.rate ?? 1.0;

  const totalSeconds = useMemo(() =>
    entries
      .filter((e) => e.endTime !== null)
      .reduce((sum, e) => {
        const start = new Date(e.startTime).getTime();
        const end = new Date(e.endTime!).getTime();
        const wallSeconds = Math.max(0, Math.round((end - start) / 1000));
        const rate = e.rate ?? 1.0;
        return sum + Math.round(wallSeconds * rate);
      }, 0),
  [entries]);

  // Live counter — ticks at `runningRate` speed (e.g. 1.5x for non-website multiplier)
  useEffect(() => {
    if (running && startTime) {
      const update = () => {
        const wall = (Date.now() - new Date(startTime).getTime()) / 1000;
        setElapsed(Math.max(0, Math.floor(wall * runningRate)));
      };
      update();
      intervalRef.current = setInterval(update, 1000);
      return () => clearInterval(intervalRef.current);
    } else {
      setElapsed(0);
      return () => clearInterval(intervalRef.current);
    }
  }, [running, startTime, runningRate]);

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
        // No manual state update — Convex subscription auto-updates
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
        // No manual state update — Convex subscription auto-updates
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
      <div className="flex items-center gap-0.5">
        {/* Play/Stop button — icon only */}
        <button
          onClick={handleToggle}
          disabled={loading}
          className={`flex items-center transition rounded-md p-1 ${
            running
              ? "text-red-600 hover:bg-red-50"
              : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-gray-50"
          }`}
          title={running ? "Stop timer" : "Start timer"}
        >
          {running ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
          )}
        </button>

        {running ? (
          /* Active timer: show only live duration next to stop button */
          <span className="font-mono text-xs tabular-nums text-red-600 ml-1">
            {formatDuration(elapsed)}
          </span>
        ) : (
          <>
            {/* Clock icon — opens time popup, same size as play */}
            <div className="relative" ref={clockButtonRef}>
              <button
                onClick={() => setPopupOpen(!popupOpen)}
                className="flex items-center text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-gray-50 transition rounded-md p-1"
                title="Add or view time entries"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
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
                    onTimerChange?.();
                  }}
                  anchorRef={clockButtonRef}
                />
              )}
            </div>

            {/* Total hours display — tight spacing */}
            {displayTotal && (
              <span className="text-xs text-[var(--muted)]">
                {displayTotal}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export { formatDuration, formatTotalHours };
