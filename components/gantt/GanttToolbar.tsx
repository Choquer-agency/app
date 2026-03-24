"use client";

interface GanttToolbarProps {
  zoom: "week" | "month";
  onZoomChange: (zoom: "week" | "month") => void;
  onScrollToToday: () => void;
  onAutoFit: () => void;
}

export default function GanttToolbar({ zoom, onZoomChange, onScrollToToday, onAutoFit }: GanttToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] bg-white">
      <button
        onClick={onScrollToToday}
        className="px-3 py-1.5 text-xs font-medium bg-white border border-[var(--border)] rounded-lg hover:bg-gray-50 transition"
      >
        Today
      </button>

      <button
        onClick={onAutoFit}
        className="px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition"
      >
        Auto fit
      </button>

      <div className="ml-auto flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
        <button
          onClick={() => onZoomChange("week")}
          className={`px-3 py-1 text-xs font-medium rounded-md transition ${
            zoom === "week" ? "bg-white shadow-sm text-[var(--foreground)]" : "text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          Week
        </button>
        <button
          onClick={() => onZoomChange("month")}
          className={`px-3 py-1 text-xs font-medium rounded-md transition ${
            zoom === "month" ? "bg-white shadow-sm text-[var(--foreground)]" : "text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          Month
        </button>
      </div>
    </div>
  );
}
