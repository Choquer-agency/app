"use client";

interface HourCountdownProps {
  logged: number; // hours logged
  allocated: number; // hours allocated from package
  compact?: boolean; // smaller display for table rows
}

function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0 && m === 0) return "0h";
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Bar color:
 * - Green: normal progress OR at/over target (completed)
 * - Orange: almost there (less than 15 min remaining)
 *
 * Checkmark:
 * - None: not close yet (> 15 min remaining)
 * - Green: within 15 min of target (hit the mark)
 * - Red: over target (even by 1 min)
 */
function getState(logged: number, allocated: number) {
  if (allocated <= 0) return { barColor: "bg-emerald-500", check: null };

  const remaining = allocated - logged; // positive = still under, negative = over
  const remainingMinutes = remaining * 60;

  // Over target — bar green (done), checkmark red
  if (remainingMinutes < 0) {
    return {
      barColor: "bg-emerald-500",
      check: { color: "text-red-500" },
    };
  }

  // Within 15 min of target — bar green, checkmark green (nailed it)
  if (remainingMinutes <= 15) {
    return {
      barColor: "bg-emerald-500",
      check: { color: "text-emerald-500" },
    };
  }

  // Almost there — less than 15 min to go... wait, that's caught above.
  // "Almost there" = close but more than 15 min remaining. Let's use a range:
  // Less than 30 min remaining = orange bar (getting close)
  if (remainingMinutes <= 30) {
    return {
      barColor: "bg-amber-500",
      check: null,
    };
  }

  // Normal progress — green bar, no checkmark
  return { barColor: "bg-emerald-500", check: null };
}

export default function HourCountdown({ logged, allocated, compact }: HourCountdownProps) {
  const percent = allocated > 0 ? Math.min((logged / allocated) * 100, 100) : 0;
  const { barColor, check } = getState(logged, allocated);

  if (compact) {
    return (
      <div className="flex items-center gap-2 whitespace-nowrap">
        <div
          className="shrink-0 rounded-full overflow-hidden"
          style={{
            width: "72px",
            height: "8px",
            backgroundColor: "#e5e7eb",
            border: "1px solid #d1d5db",
          }}
        >
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="text-xs font-medium whitespace-nowrap text-gray-700 tabular-nums">
          {formatHours(logged)} / {formatHours(allocated)}
        </span>
        {check && (
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" className={`flex-shrink-0 ${check.color}`}>
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">
            {formatHours(logged)} / {formatHours(allocated)}
          </span>
          {check && (
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" className={check.color}>
              <path d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
