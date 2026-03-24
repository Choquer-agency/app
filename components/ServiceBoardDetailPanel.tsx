"use client";

import { useState, useEffect, useCallback } from "react";
import { ServiceBoardEntry } from "@/types";
import HourCountdown from "./HourCountdown";

interface DetailPanelProps {
  entry: ServiceBoardEntry;
  month: string;
  onClose: () => void;
  onUpdate: (updated: ServiceBoardEntry) => void;
}

export default function ServiceBoardDetailPanel({ entry, month, onClose, onUpdate }: DetailPanelProps) {
  const [timeData, setTimeData] = useState<{
    totalHours: number;
    byTicket: Array<{ ticketId: number; ticketNumber: string; ticketTitle: string; hours: number }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState(entry.notes);
  const [editingNotes, setEditingNotes] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const [manualHours, setManualHours] = useState("");
  const [manualMinutes, setManualMinutes] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [emailCopied, setEmailCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "email">(
    entry.generatedEmail ? "email" : "details"
  );

  const fetchTimeData = useCallback(async () => {
    setLoading(true);
    try {
      const [timeRes, timerRes] = await Promise.all([
        fetch(`/api/admin/service-board/${entry.id}/time-entries`),
        fetch("/api/admin/time/running"),
      ]);
      if (timeRes.ok) {
        const data = await timeRes.json();
        setTimeData(data);
      }
      // Check if the running timer belongs to this service board entry's service ticket
      if (timerRes.ok) {
        const timerData = await timerRes.json();
        if (timerData.timer?.serviceCategory === entry.category && timerData.timer?.clientId === entry.clientId) {
          setTimerRunning(true);
          setTimerElapsed(Math.floor((Date.now() - new Date(timerData.timer.startTime).getTime()) / 1000));
        } else {
          setTimerRunning(false);
          setTimerElapsed(0);
        }
      }
    } catch (e) {
      console.error("Failed to fetch time data:", e);
    } finally {
      setLoading(false);
    }
  }, [entry.id, entry.category, entry.clientId]);

  useEffect(() => {
    fetchTimeData();
  }, [fetchTimeData]);

  // Live elapsed counter when timer is running
  const [timerElapsed, setTimerElapsed] = useState(0);
  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => setTimerElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [timerRunning]);

  // Listen for global timer changes
  useEffect(() => {
    function handleTimerChange() { fetchTimeData(); }
    window.addEventListener("timerChange", handleTimerChange);
    return () => window.removeEventListener("timerChange", handleTimerChange);
  }, [fetchTimeData]);

  useEffect(() => {
    setNotes(entry.notes);
    setActiveTab(entry.generatedEmail ? "email" : "details");
  }, [entry.id, entry.notes, entry.generatedEmail]);

  // Lock body scroll when panel is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  async function handleStartTimer() {
    try {
      const res = await fetch(`/api/admin/service-board/${entry.id}/time-entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start_timer" }),
      });
      if (res.ok) {
        setTimerRunning(true);
        setTimerElapsed(0);
        window.dispatchEvent(new CustomEvent("timerChange"));
        fetchTimeData();
      }
    } catch (e) {
      console.error("Failed to start timer:", e);
    }
  }

  async function handleStopTimer() {
    try {
      const res = await fetch("/api/admin/time/stop", { method: "POST" });
      if (res.ok) {
        setTimerRunning(false);
        setTimerElapsed(0);
        window.dispatchEvent(new CustomEvent("timerChange"));
        fetchTimeData();
        const entryRes = await fetch(`/api/admin/service-board/${entry.id}`);
        if (entryRes.ok) onUpdate(await entryRes.json());
      }
    } catch (e) {
      console.error("Failed to stop timer:", e);
    }
  }

  async function handleManualSubmit() {
    const hours = parseInt(manualHours || "0");
    const minutes = parseInt(manualMinutes || "0");
    if (hours === 0 && minutes === 0) return;

    const now = new Date();
    const endTime = now.toISOString();
    const startTime = new Date(now.getTime() - (hours * 3600 + minutes * 60) * 1000).toISOString();

    try {
      const res = await fetch(`/api/admin/service-board/${entry.id}/time-entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "manual_entry", startTime, endTime, note: manualNote }),
      });
      if (res.ok) {
        setManualEntry(false);
        setManualHours("");
        setManualMinutes("");
        setManualNote("");
        fetchTimeData();
        const entryRes = await fetch(`/api/admin/service-board/${entry.id}`);
        if (entryRes.ok) onUpdate(await entryRes.json());
      }
    } catch (e) {
      console.error("Failed to add manual entry:", e);
    }
  }

  async function handleSaveNotes() {
    try {
      const res = await fetch(`/api/admin/service-board/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (res.ok) {
        onUpdate(await res.json());
        setEditingNotes(false);
      }
    } catch (e) {
      console.error("Failed to save notes:", e);
    }
  }

  function handleCopyEmail() {
    if (entry.generatedEmail) {
      navigator.clipboard.writeText(entry.generatedEmail);
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2000);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Panel — slides in from right */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 truncate">{entry.clientName}</h2>
            <p className="text-xs text-gray-500">{entry.packageName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition ml-3 shrink-0"
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6 shrink-0">
          <button
            onClick={() => setActiveTab("details")}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition ${
              activeTab === "details"
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab("email")}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition ${
              activeTab === "email"
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Email
            {entry.generatedEmail && (
              <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-purple-500 inline-block" />
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-6 py-4 space-y-6">
          {activeTab === "email" ? (
            /* ── Email Tab ── */
            entry.generatedEmail ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Generated Email</h3>
                  <button
                    onClick={handleCopyEmail}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition ${
                      emailCopied
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {emailCopied ? (
                      <>
                        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                        </svg>
                        Copy Email
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed border border-gray-200">
                  {entry.generatedEmail}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="mb-2">
                  <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <p className="text-sm">No email generated yet</p>
                <p className="text-xs mt-1">Change status to "Report Ready" to generate</p>
              </div>
            )
          ) : (
            /* ── Details Tab ── */
            <>
              {/* Hour Summary */}
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Hours This Month</h3>
                <HourCountdown logged={entry.loggedHours || 0} allocated={entry.includedHours || 0} />
              </div>

              {/* Quick Links */}
              <div className="flex gap-2">
                {entry.clientSlug && (
                  <a
                    href={`/${entry.clientSlug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 transition"
                  >
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                    </svg>
                    Dashboard
                  </a>
                )}
                {entry.clientNotionPageUrl && (
                  <a
                    href={entry.clientNotionPageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 transition"
                  >
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Notion
                  </a>
                )}
              </div>

              {/* Time Tracking */}
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Track Time</h3>
                <div className="flex gap-2">
                  {!timerRunning ? (
                    <button
                      onClick={handleStartTimer}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
                    >
                      <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      Start Timer
                    </button>
                  ) : (
                    <button
                      onClick={handleStopTimer}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-red-50 text-red-700 hover:bg-red-100 transition"
                    >
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                      </span>
                      {Math.floor(timerElapsed / 3600)}:{String(Math.floor((timerElapsed % 3600) / 60)).padStart(2, "0")}:{String(timerElapsed % 60).padStart(2, "0")}
                      <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
                    </button>
                  )}
                  <button
                    onClick={() => setManualEntry(!manualEntry)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 transition"
                  >
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" /></svg>
                    Manual Entry
                  </button>
                </div>

                {manualEntry && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg space-y-2">
                    <div className="flex gap-2 items-center">
                      <div className="flex items-center gap-1">
                        <input type="number" min="0" max="24" value={manualHours} onChange={(e) => setManualHours(e.target.value)} placeholder="0" className="w-14 px-2 py-1 text-xs border border-gray-200 rounded-md" />
                        <span className="text-xs text-gray-500">h</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <input type="number" min="0" max="59" value={manualMinutes} onChange={(e) => setManualMinutes(e.target.value)} placeholder="0" className="w-14 px-2 py-1 text-xs border border-gray-200 rounded-md" />
                        <span className="text-xs text-gray-500">m</span>
                      </div>
                    </div>
                    <input type="text" value={manualNote} onChange={(e) => setManualNote(e.target.value)} placeholder="Note (optional)" className="w-full px-2 py-1 text-xs border border-gray-200 rounded-md" />
                    <div className="flex gap-2">
                      <button onClick={handleManualSubmit} className="px-3 py-1 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition">Add</button>
                      <button onClick={() => setManualEntry(false)} className="px-3 py-1 text-xs rounded-md text-gray-500 hover:bg-gray-200 transition">Cancel</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Time Log */}
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Time Log</h3>
                {loading ? (
                  <div className="flex items-center justify-center h-12">
                    <div className="animate-spin w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full" />
                  </div>
                ) : !timeData || timeData.byTicket.length === 0 ? (
                  <p className="text-xs text-gray-400">No time logged this month</p>
                ) : (
                  <div className="space-y-1.5">
                    {timeData.byTicket.map((t) => (
                      <div key={t.ticketId} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-md">
                        <div>
                          <span className="text-xs font-mono text-gray-400 mr-1.5">{t.ticketNumber}</span>
                          <span className="text-xs text-gray-700">{t.ticketTitle}</span>
                        </div>
                        <span className="text-xs font-medium text-gray-600">{t.hours.toFixed(1)}h</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</h3>
                  {!editingNotes && (
                    <button onClick={() => setEditingNotes(true)} className="text-xs text-blue-600 hover:text-blue-700">Edit</button>
                  )}
                </div>
                {editingNotes ? (
                  <div className="space-y-2">
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500" placeholder="Add notes..." />
                    <div className="flex gap-2">
                      <button onClick={handleSaveNotes} className="px-3 py-1 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition">Save</button>
                      <button onClick={() => { setNotes(entry.notes); setEditingNotes(false); }} className="px-3 py-1 text-xs rounded-md text-gray-500 hover:bg-gray-200 transition">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">
                    {entry.notes || <span className="text-gray-400">No notes</span>}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in {
          animation: slideIn 0.2s ease-out;
        }
      `}</style>
    </>
  );
}
