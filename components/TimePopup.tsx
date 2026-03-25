"use client";

import { useState, useEffect, useRef, RefObject } from "react";
import ReactDOM from "react-dom";
import { TimeEntry } from "@/types";
import { friendlyDateWithDay } from "@/lib/date-format";

interface TimePopupProps {
  ticketId: string;
  entries: TimeEntry[];
  totalSeconds: number;
  onClose: () => void;
  onEntriesChanged: () => void;
  anchorRef: RefObject<HTMLDivElement | null>;
}

function formatHours(seconds: number): string {
  const h = seconds / 3600;
  if (h < 0.01) return "0h";
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${Math.round(h * 10) / 10}h`;
}

function formatDate(iso: string): string {
  return friendlyDateWithDay(iso);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatEntryDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function parseDurationInput(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  // "3h 20m", "3h20m", "3h", "20m", "1.5h", "90m", "1:30"
  const colonMatch = trimmed.match(/^(\d+):(\d+)$/);
  if (colonMatch) {
    return parseInt(colonMatch[1]) * 3600 + parseInt(colonMatch[2]) * 60;
  }

  let totalSeconds = 0;
  const hourMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*h/);
  const minMatch = trimmed.match(/(\d+)\s*m/);

  if (hourMatch) totalSeconds += parseFloat(hourMatch[1]) * 3600;
  if (minMatch) totalSeconds += parseInt(minMatch[1]) * 60;

  // Plain number — treat as minutes
  if (!hourMatch && !minMatch) {
    const num = parseFloat(trimmed);
    if (!isNaN(num)) totalSeconds = num * 60;
  }

  return totalSeconds > 0 ? Math.round(totalSeconds) : null;
}

export default function TimePopup({
  ticketId,
  entries,
  totalSeconds,
  onClose,
  onEntriesChanged,
  anchorRef,
}: TimePopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [durationInput, setDurationInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editNote, setEditNote] = useState("");
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 });

  // Position on mount — same pattern as StatusDropdown
  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      const popupW = 380;
      const vw = window.innerWidth / zoom;

      let left = rect.left / zoom;
      // Clamp to right edge
      if (left + popupW > vw - 16) {
        left = vw - popupW - 16;
      }
      if (left < 16) left = 16;

      setPosition({ top: rect.bottom / zoom + 4, left });
    }
  }, [anchorRef]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose, anchorRef]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const completedEntries = entries.filter((e) => e.endTime !== null);

  // Group entries by member
  const grouped = new Map<string, { name: string; color: string; pic: string; totalSec: number; entries: TimeEntry[] }>();
  for (const entry of completedEntries) {
    const key = entry.memberName || "Unknown";
    if (!grouped.has(key)) {
      grouped.set(key, {
        name: key,
        color: entry.memberColor || "#6b7280",
        pic: entry.memberProfilePicUrl || "",
        totalSec: 0,
        entries: [],
      });
    }
    const g = grouped.get(key)!;
    g.totalSec += entry.durationSeconds || 0;
    g.entries.push(entry);
  }

  async function handleAddManual() {
    const durationSec = parseDurationInput(durationInput);
    if (!durationSec) return;

    setSaving(true);
    const now = new Date();
    const endTime = now.toISOString();
    const startTimeISO = new Date(now.getTime() - durationSec * 1000).toISOString();

    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}/time`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "manual",
          startTime: startTimeISO,
          endTime,
          note: noteInput,
        }),
      });
      if (res.ok) {
        setDurationInput("");
        setNoteInput("");
        onEntriesChanged();
      }
    } catch {} finally {
      setSaving(false);
    }
  }

  async function handleDelete(entryId: string) {
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}/time/${entryId}`, {
        method: "DELETE",
      });
      if (res.ok) onEntriesChanged();
    } catch {}
  }

  function startEdit(entry: TimeEntry) {
    setEditingId(entry.id);
    // Extract time portions for editing
    const s = new Date(entry.startTime);
    const e = entry.endTime ? new Date(entry.endTime) : new Date();
    setEditStart(`${String(s.getHours()).padStart(2, "0")}:${String(s.getMinutes()).padStart(2, "0")}`);
    setEditEnd(`${String(e.getHours()).padStart(2, "0")}:${String(e.getMinutes()).padStart(2, "0")}`);
    setEditNote(entry.note);
  }

  async function handleSaveEdit(entry: TimeEntry) {
    const dateStr = new Date(entry.startTime).toISOString().split("T")[0];
    const newStart = new Date(`${dateStr}T${editStart}:00`).toISOString();
    const newEnd = new Date(`${dateStr}T${editEnd}:00`).toISOString();

    if (new Date(newEnd) <= new Date(newStart)) return;

    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}/time/${entry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime: newStart, endTime: newEnd, note: editNote }),
      });
      if (res.ok) {
        setEditingId(null);
        onEntriesChanged();
      }
    } catch {}
  }

  return ReactDOM.createPortal(
    <div
      ref={popupRef}
      className="bg-white border border-[var(--border)] rounded-xl shadow-2xl w-[380px] max-h-[480px] overflow-hidden flex flex-col"
      style={{ position: "fixed", top: position.top, left: position.left, zIndex: 9999 }}
    >
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-[var(--border)]">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-[var(--foreground)]">Time on this task</span>
          <span className="text-sm font-semibold text-[var(--foreground)]">{formatHours(totalSeconds)}</span>
        </div>
      </div>

      {/* Manual entry form */}
      <div className="px-5 py-4 border-b border-[var(--border)] space-y-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={durationInput}
            onChange={(e) => setDurationInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddManual(); }}
            placeholder="Enter time (ex: 3h 20m)"
            className="flex-1 text-sm border border-[var(--border)] rounded-lg px-3 py-2 outline-none focus:border-[var(--accent)] placeholder:text-[var(--muted)] bg-white"
          />
          <button
            onClick={handleAddManual}
            disabled={saving || !durationInput.trim()}
            className="text-sm font-medium text-white bg-[var(--accent)] hover:opacity-90 rounded-lg px-4 py-2 transition disabled:opacity-40"
          >
            Save
          </button>
        </div>
        <div className="flex items-center gap-3">
          {/* Notes */}
          <div className="flex items-center gap-2 flex-1">
            <svg className="w-4 h-4 text-[var(--muted)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
            </svg>
            <input
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddManual(); }}
              placeholder="Notes"
              className="flex-1 text-xs text-[var(--foreground)] bg-transparent outline-none placeholder:text-[var(--muted)]"
            />
          </div>
        </div>
      </div>

      {/* Time entries list */}
      <div className="flex-1 overflow-y-auto">
        {completedEntries.length === 0 ? (
          <div className="px-5 py-6 text-center text-xs text-[var(--muted)]">
            No time entries yet
          </div>
        ) : (
          <div className="px-5 py-3">
            <div className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider mb-2">
              Time Entries
            </div>

            {Array.from(grouped.values()).map((group) => (
              <div key={group.name} className="mb-3">
                {/* Member header */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    {group.pic ? (
                      <img src={group.pic} alt="" className="w-5 h-5 rounded-full object-cover" />
                    ) : (
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                        style={{ backgroundColor: group.color }}
                      >
                        {group.name[0].toUpperCase()}
                      </div>
                    )}
                    <span className="text-xs font-medium text-[var(--foreground)]">{group.name}</span>
                  </div>
                  <span className="text-xs text-[var(--muted)]">{formatHours(group.totalSec)}</span>
                </div>

                {/* Entries */}
                <div className="space-y-1 ml-7">
                  {group.entries.map((entry) => (
                    <div key={entry.id} className="group">
                      {editingId === entry.id ? (
                        /* Edit mode */
                        <div className="bg-gray-50 rounded-lg p-2.5 space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="time"
                              value={editStart}
                              onChange={(e) => setEditStart(e.target.value)}
                              className="text-xs border border-[var(--border)] rounded px-2 py-1 bg-white outline-none focus:border-[var(--accent)]"
                            />
                            <span className="text-xs text-[var(--muted)]">–</span>
                            <input
                              type="time"
                              value={editEnd}
                              onChange={(e) => setEditEnd(e.target.value)}
                              className="text-xs border border-[var(--border)] rounded px-2 py-1 bg-white outline-none focus:border-[var(--accent)]"
                            />
                          </div>
                          <input
                            type="text"
                            value={editNote}
                            onChange={(e) => setEditNote(e.target.value)}
                            placeholder="Notes"
                            className="w-full text-xs border border-[var(--border)] rounded px-2 py-1 bg-white outline-none focus:border-[var(--accent)] placeholder:text-[var(--muted)]"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleSaveEdit(entry)}
                              className="text-xs font-medium text-white bg-[var(--accent)] rounded px-2.5 py-1 hover:opacity-90 transition"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* View mode */
                        <div className="flex items-center justify-between py-1.5 rounded hover:bg-gray-50 px-2 -mx-2">
                          <button
                            onClick={() => startEdit(entry)}
                            className="flex items-center gap-2 text-left min-w-0 flex-1"
                          >
                            <svg className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                            </svg>
                            <span className="text-xs text-[var(--foreground)]">
                              {formatDate(entry.startTime)}, {formatTime(entry.startTime)} – {entry.endTime ? formatTime(entry.endTime) : "now"}
                            </span>
                            {entry.note && (
                              <span className="text-[10px] text-[var(--muted)] truncate ml-1">
                                {entry.note}
                              </span>
                            )}
                          </button>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-[var(--muted)]">
                              {entry.durationSeconds ? formatEntryDuration(entry.durationSeconds) : "—"}
                            </span>
                            <button
                              onClick={() => handleDelete(entry.id)}
                              className="opacity-0 group-hover:opacity-100 text-[var(--muted)] hover:text-red-500 transition p-0.5"
                              title="Delete"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
