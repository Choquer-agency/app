"use client";

import { useState } from "react";

interface ManualTimeEntryProps {
  ticketId: string;
  onAdded: () => void;
  onCancel: () => void;
}

export default function ManualTimeEntry({ ticketId, onAdded, onCancel }: ManualTimeEntryProps) {
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const startISO = new Date(`${date}T${startTime}:00`).toISOString();
    const endISO = new Date(`${date}T${endTime}:00`).toISOString();

    if (new Date(endISO) <= new Date(startISO)) {
      setError("End time must be after start time");
      return;
    }

    const diffHours = (new Date(endISO).getTime() - new Date(startISO).getTime()) / 3600000;
    if (diffHours > 24) {
      setError("Entry cannot exceed 24 hours");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}/time`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "manual",
          startTime: startISO,
          endTime: endISO,
          note,
        }),
      });
      if (res.ok) {
        onAdded();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to add entry");
      }
    } catch {
      setError("Failed to add entry");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 rounded-lg p-3 space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={today}
            className="text-xs border border-[var(--border)] rounded px-2 py-1.5 bg-white outline-none focus:border-[var(--accent)]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Start</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="text-xs border border-[var(--border)] rounded px-2 py-1.5 bg-white outline-none focus:border-[var(--accent)]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-[var(--muted)]">End</label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="text-xs border border-[var(--border)] rounded px-2 py-1.5 bg-white outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>

      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        className="w-full text-xs border border-[var(--border)] rounded px-2 py-1.5 bg-white outline-none focus:border-[var(--accent)] placeholder:text-[var(--muted)]"
      />

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="text-xs font-medium text-white bg-[var(--accent)] hover:opacity-90 rounded-lg px-3 py-1.5 transition disabled:opacity-50"
        >
          {saving ? "Adding..." : "Add time"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
