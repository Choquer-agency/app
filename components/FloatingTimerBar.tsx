"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useSession } from "@/hooks/useSession";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function FloatingTimerBar() {
  const router = useRouter();
  const session = useSession();
  const [elapsed, setElapsed] = useState(0);
  const [stopping, setStopping] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // Real-time query for running timer (replaces polling)
  const timer = useQuery(
    api.timeEntries.getRunning,
    session ? { teamMemberId: session.teamMemberId as Id<"teamMembers"> } : "skip"
  );

  const stopMutation = useMutation(api.timeEntries.stop);

  // Live counter
  useEffect(() => {
    if (timer) {
      const update = () => {
        const diff = Math.floor((Date.now() - new Date(timer.startTime).getTime()) / 1000);
        setElapsed(Math.max(0, diff));
      };
      update();
      intervalRef.current = setInterval(update, 1000);
      return () => clearInterval(intervalRef.current);
    } else {
      setElapsed(0);
      return () => clearInterval(intervalRef.current);
    }
  }, [timer]);

  async function handleStop() {
    if (!timer) return;
    setStopping(true);
    try {
      await stopMutation({ id: timer._id as Id<"timeEntries"> });
      window.dispatchEvent(new CustomEvent("timerChange"));
    } catch {} finally {
      setStopping(false);
    }
  }

  function handleNavigate() {
    if (timer) {
      router.push(`/admin/tickets?ticket=${timer.ticketId}`);
    }
  }

  if (!timer) return null;

  const isRunaway = elapsed > 36000; // 10 hours

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 border-t ${
        isRunaway
          ? "bg-red-100 border-red-300"
          : "bg-red-50 border-red-200"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {/* Pulsing dot */}
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              isRunaway ? "bg-red-500" : "bg-green-500"
            }`} />
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
              isRunaway ? "bg-red-500" : "bg-green-500"
            }`} />
          </span>

          <button
            onClick={handleNavigate}
            className="flex items-center gap-2 min-w-0 hover:underline"
          >
            <span className="text-xs font-mono text-[var(--muted)] shrink-0">
              {timer.ticketNumber}
            </span>
            <span className="text-sm text-[var(--foreground)] truncate">
              {timer.ticketTitle}
            </span>
          </button>

          {timer.clientName && (
            <span className="text-xs text-[var(--muted)] shrink-0 hidden sm:inline">
              {timer.clientName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {/* Live counter */}
          <span className={`font-mono text-sm tabular-nums ${
            isRunaway ? "text-red-600 font-semibold" : "text-[var(--foreground)]"
          }`}>
            {formatDuration(elapsed)}
          </span>

          {isRunaway && (
            <span className="text-xs text-red-600 font-medium hidden sm:inline">
              Runaway timer
            </span>
          )}

          {/* Stop button */}
          <button
            onClick={handleStop}
            disabled={stopping}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
            </svg>
            Stop
          </button>
        </div>
      </div>
    </div>
  );
}
