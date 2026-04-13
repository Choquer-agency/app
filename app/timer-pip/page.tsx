"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useSession } from "@/hooks/useSession";
import { invokeDesktop } from "@/hooks/useDesktop";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function openTicketInMainWindow(ticketId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tauri = (window as any).__TAURI__;
  if (!tauri) return;
  tauri.core.invoke("show_main_and_navigate", {
    path: `/admin/tickets?ticket=${ticketId}`,
  }).catch(() => {});
}

export default function TimerPipPage() {
  const session = useSession();
  const [elapsed, setElapsed] = useState(0);
  const [stopping, setStopping] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // Make body transparent for the frameless Tauri window
  useEffect(() => {
    // Inject a style tag to override any inherited Tailwind bg classes
    const style = document.createElement("style");
    style.textContent = `
      html, body { background: transparent !important; margin: 0 !important; overflow: hidden !important; }
    `;
    document.head.appendChild(style);
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
    // Remove bg class from body if Tailwind added one
    document.body.classList.remove("bg-gray-50");
    return () => { style.remove(); };
  }, []);

  const rawTimer = useQuery(
    api.timeEntries.getRunning,
    session ? { teamMemberId: session.teamMemberId as Id<"teamMembers"> } : "skip"
  );

  // Defense-in-depth: never render a timer that doesn't belong to this session.
  const timer =
    rawTimer === undefined
      ? undefined
      : rawTimer && session && rawTimer.teamMemberId === session.teamMemberId
        ? rawTimer
        : null;

  const stopMutation = useMutation(api.timeEntries.stop);

  // Live counter
  useEffect(() => {
    if (timer) {
      const update = () => {
        const diff = Math.floor(
          (Date.now() - new Date(timer.startTime).getTime()) / 1000
        );
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

  // Auto-hide when no timer (or no session)
  useEffect(() => {
    if (timer === undefined) return;
    if (!timer || !session) {
      invokeDesktop("hide_timer_pip");
    }
  }, [timer, session]);

  // Follow cursor across monitors — poll every 2 seconds
  useEffect(() => {
    if (!timer) return;
    const interval = setInterval(() => {
      invokeDesktop("pip_follow_cursor");
    }, 2000);
    return () => clearInterval(interval);
  }, [timer]);

  async function handleStop() {
    if (!timer || !session) return;
    setStopping(true);
    try {
      await stopMutation({
        id: timer._id as Id<"timeEntries">,
        teamMemberId: session.teamMemberId as Id<"teamMembers">,
      });
    } catch {
      // Silent
    } finally {
      setStopping(false);
    }
  }

  function handleOpenTicket() {
    if (!timer) return;
    openTicketInMainWindow(timer.ticketId);
  }

  // Show loading pill while Convex connects
  if (timer === undefined) {
    return (
      <div
        data-tauri-drag-region=""
        className="flex items-center justify-center h-screen w-screen"
      >
        <div className="flex items-center gap-1 px-3 py-1.5 bg-white/90 backdrop-blur-md rounded-full shadow-lg border border-gray-200">
          <span className="text-[9px] text-gray-400">Loading...</span>
        </div>
      </div>
    );
  }

  if (!timer) return null;

  const isRunaway = elapsed > 36000;

  return (
    <div className="flex items-center justify-center h-screen w-screen">
      <div
        className={`flex items-center rounded-full shadow-lg border ${
          isRunaway
            ? "bg-red-50/95 backdrop-blur-md border-red-300"
            : "bg-white/95 backdrop-blur-md border-gray-200"
        }`}
      >
        {/* Left zone: click to open ticket */}
        <button
          onClick={handleOpenTicket}
          data-tauri-drag-region=""
          className="flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 min-w-0 rounded-l-full cursor-pointer bg-transparent"
          title="Open ticket"
        >
          {/* Pulsing dot */}
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isRunaway ? "bg-red-500" : "bg-green-500"
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                isRunaway ? "bg-red-500" : "bg-green-500"
              }`}
            />
          </span>

          <span className="text-[9px] text-gray-600 truncate max-w-[120px]">
            {timer.ticketTitle}
          </span>

          <span
            className={`font-mono text-[10px] tabular-nums shrink-0 ml-0.5 ${
              isRunaway ? "text-red-600 font-semibold" : "text-gray-900"
            }`}
          >
            {formatDuration(elapsed)}
          </span>
        </button>

        {/* Right zone: stop button */}
        <button
          onClick={handleStop}
          disabled={stopping}
          className="flex items-center justify-center w-6 h-6 mr-1 rounded-full text-red-500 hover:bg-red-100 transition shrink-0 disabled:opacity-50"
          title="Stop timer"
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
