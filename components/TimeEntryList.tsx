"use client";

import { useState, useEffect, useCallback } from "react";
import { TimeEntry } from "@/types";
import { friendlyDate } from "@/lib/date-format";
import ManualTimeEntry from "./ManualTimeEntry";

interface TimeEntryListProps {
  ticketId: string;
  refreshKey?: number;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(iso: string): string {
  // friendlyDate expects a date-only string, not a full ISO timestamp
  return friendlyDate(iso.split("T")[0]);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function TimeEntryList({ ticketId, refreshKey }: TimeEntryListProps) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}/time`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries, refreshKey]);

  async function handleDelete(entryId: string) {
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}/time/${entryId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setEntries((prev) => prev.filter((e) => e.id !== entryId));
        window.dispatchEvent(new CustomEvent("timerChange"));
      }
    } catch {}
  }

  async function handleEditNote(entryId: string) {
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}/time/${entryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: editNote }),
      });
      if (res.ok) {
        setEditingId(null);
        fetchEntries();
      }
    } catch {}
  }

  function handleManualAdded() {
    setShowManualForm(false);
    fetchEntries();
    window.dispatchEvent(new CustomEvent("timerChange"));
  }

  const completedEntries = entries.filter((e) => e.endTime !== null);

  if (loading) return null;
  if (completedEntries.length === 0 && !showManualForm) {
    return (
      <div className="border-t border-[var(--border)] pt-4 mt-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Time Entries</h3>
          <button
            onClick={() => setShowManualForm(true)}
            className="flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add time
          </button>
        </div>
        {showManualForm && (
          <ManualTimeEntry
            ticketId={ticketId}
            onAdded={handleManualAdded}
            onCancel={() => setShowManualForm(false)}
          />
        )}
        <p className="text-xs text-[var(--muted)]">No time entries yet</p>
      </div>
    );
  }

  const totalSeconds = completedEntries.reduce((sum, e) => sum + (e.durationSeconds || 0), 0);

  return (
    <div className="border-t border-[var(--border)] pt-4 mt-2">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)] hover:text-[var(--accent)] transition"
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
          Time Entries
          <span className="text-xs font-normal text-[var(--muted)]">
            {completedEntries.length} &middot; {formatDuration(totalSeconds)}
          </span>
        </button>
        <button
          onClick={() => { setShowManualForm(true); setExpanded(true); }}
          className="flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add time
        </button>
      </div>

      {expanded && (
        <div className="space-y-0.5">
          {showManualForm && (
            <div className="mb-3">
              <ManualTimeEntry
                ticketId={ticketId}
                onAdded={handleManualAdded}
                onCancel={() => setShowManualForm(false)}
              />
            </div>
          )}

          {completedEntries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-gray-50 group text-sm"
            >
              {/* Member avatar */}
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                style={{ backgroundColor: entry.memberColor || "#6b7280" }}
                title={entry.memberName}
              >
                {(entry.memberName || "?")[0].toUpperCase()}
              </div>

              {/* Date + time range */}
              <div className="flex flex-col min-w-[100px]">
                <span className="text-xs text-[var(--foreground)]">{formatDate(entry.startTime)}</span>
                <span className="text-[10px] text-[var(--muted)]">
                  {formatTime(entry.startTime)} – {entry.endTime ? formatTime(entry.endTime) : "running"}
                </span>
              </div>

              {/* Duration */}
              <span className="text-xs font-mono text-[var(--foreground)] min-w-[50px]">
                {entry.durationSeconds ? formatDuration(entry.durationSeconds) : "—"}
              </span>

              {/* Manual badge */}
              {entry.isManual && (
                <span className="text-[10px] text-[var(--muted)] bg-gray-100 px-1.5 py-0.5 rounded" title="Manual entry">
                  manual
                </span>
              )}

              {/* Note */}
              {editingId === entry.id ? (
                <div className="flex items-center gap-1 flex-1">
                  <input
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleEditNote(entry.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="flex-1 text-xs bg-white border border-[var(--border)] rounded px-2 py-1 outline-none focus:border-[var(--accent)]"
                    autoFocus
                  />
                  <button
                    onClick={() => handleEditNote(entry.id)}
                    className="text-xs text-[var(--accent)]"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <span
                  className="text-xs text-[var(--muted)] truncate flex-1 cursor-pointer hover:text-[var(--foreground)]"
                  onClick={() => { setEditingId(entry.id); setEditNote(entry.note); }}
                  title={entry.note || "Click to add note"}
                >
                  {entry.note || ""}
                </span>
              )}

              {/* Delete */}
              <button
                onClick={() => handleDelete(entry.id)}
                className="opacity-0 group-hover:opacity-100 text-[var(--muted)] hover:text-red-500 transition p-1"
                title="Delete entry"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
