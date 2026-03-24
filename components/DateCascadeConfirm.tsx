"use client";

import { useState, useEffect } from "react";
import { DateCascadePreview } from "@/types";
import { friendlyDate, friendlyDateWithDay } from "@/lib/date-format";

interface DateCascadeConfirmProps {
  projectId: number;
  ticketId: number;
  ticketTitle: string;
  field: "startDate" | "dueDate";
  oldDate: string;
  newDate: string;
  onClose: () => void;
  onApplied: () => void;
}

export default function DateCascadeConfirm({
  projectId,
  ticketId,
  ticketTitle,
  field,
  oldDate,
  newDate,
  onClose,
  onApplied,
}: DateCascadeConfirmProps) {
  const [previews, setPreviews] = useState<DateCascadePreview[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");

  // Calculate delta
  const deltaMs = new Date(newDate).getTime() - new Date(oldDate).getTime();
  const deltaDays = Math.round(deltaMs / (1000 * 60 * 60 * 24));
  const direction = deltaDays > 0 ? "forward" : "back";

  // Fetch preview on mount
  useEffect(() => {
    fetch(`/api/admin/projects/${projectId}/cascade-dates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId, newDate, field }),
    })
      .then((r) => r.json())
      .then((data) => {
        setPreviews(data.previews || []);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to calculate date changes");
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleApply() {
    setApplying(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/cascade-dates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, newDate, field, confirm: true }),
      });
      if (res.ok) {
        onApplied();
      } else {
        setError("Failed to apply date changes");
      }
    } catch {
      setError("Failed to apply date changes");
    } finally {
      setApplying(false);
    }
  }

  // Deduplicate previews by ticket (show both start and due on same line)
  const ticketMap = new Map<number, DateCascadePreview[]>();
  if (previews) {
    for (const p of previews) {
      if (!ticketMap.has(p.ticketId)) ticketMap.set(p.ticketId, []);
      ticketMap.get(p.ticketId)!.push(p);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6 max-h-[80vh] flex flex-col">
        <h2 className="text-lg font-bold mb-1">Shift Following Dates</h2>
        <p className="text-sm text-[var(--muted)] mb-4">
          Push {Math.abs(deltaDays)} day{Math.abs(deltaDays) !== 1 ? "s" : ""} {direction}?
        </p>

        {/* Changed ticket summary */}
        <div className="px-3 py-2 bg-blue-50 rounded-lg mb-3 text-xs">
          <span className="font-medium">{ticketTitle}</span>
          <span className="text-[var(--muted)]">
            {" "}{friendlyDateWithDay(oldDate)} → {friendlyDateWithDay(newDate)}
          </span>
        </div>

        {/* Preview list */}
        <div className="flex-1 overflow-y-auto mb-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[var(--accent)]" />
            </div>
          ) : previews && previews.length === 0 ? (
            <p className="text-sm text-[var(--muted)] text-center py-4">
              No other tickets have dates to shift.
            </p>
          ) : (
            <div className="space-y-1.5">
              {Array.from(ticketMap.entries()).map(([tId, changes]) => (
                <div
                  key={tId}
                  className="px-3 py-2 bg-gray-50 rounded-lg text-xs space-y-0.5"
                >
                  <div className="font-medium text-[var(--foreground)] flex items-center gap-1.5">
                    <span className="text-[var(--muted)]">{changes[0].ticketNumber}</span>
                    <span className="truncate">{changes[0].ticketTitle}</span>
                  </div>
                  {changes.map((c) => (
                    <div key={`${c.ticketId}-${c.field}`} className="text-[var(--muted)] flex items-center gap-1">
                      <span className="w-12 shrink-0">{c.field === "startDate" ? "Start:" : "Due:"}</span>
                      <span>{friendlyDate(c.oldDate)}</span>
                      <span>→</span>
                      <span className={c.weekendAdjusted ? "text-amber-600 font-medium" : ""}>
                        {friendlyDateWithDay(c.newDate)}
                      </span>
                      {c.weekendAdjusted && (
                        <span className="text-[10px] text-amber-600" title="Adjusted to avoid weekend">
                          wknd adj.
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

        <div className="flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition"
          >
            Skip (change only this ticket)
          </button>
          <button
            onClick={handleApply}
            disabled={applying || loading || !previews || previews.length === 0}
            className="px-4 py-2 text-sm bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition disabled:opacity-50"
          >
            {applying
              ? "Shifting..."
              : `Shift ${previews ? previews.length : 0} date${previews && previews.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
