"use client";

import { useState, useEffect } from "react";

interface CalendarEvent {
  id: number;
  title: string;
  eventDate: string;
  eventType: string;
  recurrence: string;
}

const EVENT_TYPES = [
  { value: "holiday", label: "Holiday" },
  { value: "event", label: "Team Event" },
  { value: "custom", label: "Custom" },
];

const RECURRENCE_OPTIONS = [
  { value: "none", label: "One-time" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
  { value: "quarterly", label: "Every quarter" },
  { value: "yearly", label: "Every year" },
];

const TYPE_ICONS: Record<string, string> = {
  holiday: "🏖️",
  event: "📌",
  custom: "📌",
};

const RECURRENCE_LABELS: Record<string, string> = {
  none: "None",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

function RecurringIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? "#1A1A1A" : "#D1D5DB"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function EventRow({
  event,
  onDelete,
  onUpdate,
}: {
  event: CalendarEvent;
  onDelete: (id: number) => void;
  onUpdate: () => void;
}) {
  const [showRecurrenceDropdown, setShowRecurrenceDropdown] = useState(false);
  const isRecurring = event.recurrence !== "none";

  async function handleRecurrenceChange(newRecurrence: string) {
    setShowRecurrenceDropdown(false);
    try {
      // Update via a PATCH-style call — we'll use POST with an id
      await fetch("/api/admin/bulletin/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: event.id,
          title: event.title,
          eventDate: event.eventDate,
          eventType: event.eventType,
          recurrence: newRecurrence,
        }),
      });
      onUpdate();
    } catch {}
  }

  return (
    <div className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition">
      <span className="text-base">{TYPE_ICONS[event.eventType] || "📌"}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--foreground)]">{event.title}</p>
        <p className="text-xs text-[var(--muted)]">
          {new Date(event.eventDate + "T00:00:00").toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-[var(--muted)] font-medium capitalize">
          {event.eventType}
        </span>

        {/* Recurrence icon + dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowRecurrenceDropdown(!showRecurrenceDropdown)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-gray-100 transition"
            title={isRecurring ? `Repeats ${RECURRENCE_LABELS[event.recurrence]}` : "Not recurring — click to set"}
          >
            <RecurringIcon active={isRecurring} />
            {isRecurring && (
              <span className="text-[10px] font-medium text-[var(--foreground)]">
                {RECURRENCE_LABELS[event.recurrence]}
              </span>
            )}
          </button>

          {showRecurrenceDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowRecurrenceDropdown(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-lg shadow-lg border border-[var(--border)] py-1 w-36">

                {RECURRENCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleRecurrenceChange(opt.value)}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition flex items-center gap-2 ${
                      event.recurrence === opt.value ? "font-semibold text-[var(--foreground)]" : "text-[var(--muted)]"
                    }`}
                  >
                    <RecurringIcon active={opt.value !== "none"} />
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <button
          onClick={() => onDelete(event.id)}
          className="text-xs text-[var(--muted)] hover:text-red-500 p-1"
          title="Delete"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default function CalendarSettings() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventType, setEventType] = useState("holiday");
  const [recurrence, setRecurrence] = useState("none");
  const [submitting, setSubmitting] = useState(false);

  async function fetchEvents() {
    try {
      const res = await fetch("/api/admin/bulletin/calendar");
      if (res.ok) setEvents(await res.json());
    } catch {
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchEvents();
  }, []);

  async function handleAdd() {
    if (!title.trim() || !eventDate) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/bulletin/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, eventDate, eventType, recurrence }),
      });
      if (res.ok) {
        setTitle("");
        setEventDate("");
        setEventType("holiday");
        setRecurrence("none");
        setShowForm(false);
        fetchEvents();
      }
    } catch {
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      const res = await fetch(`/api/admin/bulletin/calendar?id=${id}`, { method: "DELETE" });
      if (res.ok) fetchEvents();
    } catch {}
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)]">Calendar Events</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            Holidays, team events, and custom dates that show on the homepage
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 text-sm font-medium text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition"
        >
          + Add Event
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="rounded-xl border border-[var(--border)] bg-white p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--foreground)] mb-1">Event Name</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Good Friday"
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--foreground)] mb-1">Date</label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--foreground)] mb-1">Type</label>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)] bg-white"
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--foreground)] mb-1">Recurrence</label>
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)] bg-white"
              >
                {RECURRENCE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={submitting || !title.trim() || !eventDate}
              className="px-4 py-2 text-sm font-medium text-white bg-[var(--accent)] rounded-lg hover:opacity-90 disabled:opacity-50 transition"
            >
              {submitting ? "Adding..." : "Add Event"}
            </button>
          </div>
        </div>
      )}

      {/* Events list */}
      {events.length === 0 ? (
        <div className="text-center py-12 text-sm text-[var(--muted)]">
          No calendar events yet. Add holidays, team events, or custom dates.
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-white divide-y divide-[var(--border)]">
          {events.map((event) => (
            <EventRow key={event.id} event={event} onDelete={handleDelete} onUpdate={fetchEvents} />
          ))}
        </div>
      )}

      {/* Info note */}
      <div className="text-xs text-[var(--muted)] bg-gray-50 rounded-lg p-3">
        <strong>Tip:</strong> You can also add events via Slack by messaging the bot with{" "}
        <code className="bg-gray-200 px-1 rounded">add to calendar: Good Friday - April 3</code>
      </div>
    </div>
  );
}
