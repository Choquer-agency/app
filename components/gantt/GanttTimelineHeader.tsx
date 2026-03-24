"use client";

import { BusinessDay } from "./ganttUtils";

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_LABELS = ["", "M", "T", "W", "T", "F", ""];

interface GanttTimelineHeaderProps {
  businessDays: BusinessDay[];
  dayWidth: number;
  zoom: "week" | "month";
}

export default function GanttTimelineHeader({ businessDays, dayWidth, zoom }: GanttTimelineHeaderProps) {
  // Group into weeks for top row
  const topGroups: { label: string; span: number }[] = [];

  if (zoom === "week") {
    let i = 0;
    while (i < businessDays.length) {
      const d = businessDays[i].date;
      const dow = d.getDay();
      const monday = new Date(d);
      monday.setDate(d.getDate() - (dow - 1));
      const friday = new Date(monday);
      friday.setDate(monday.getDate() + 4);

      let span = 0;
      while (i < businessDays.length) {
        const cd = businessDays[i].date;
        if (cd > friday) break;
        span++;
        i++;
      }

      const weekNum = getWeekNumber(monday);
      topGroups.push({
        label: `W${weekNum} ${SHORT_MONTHS[monday.getMonth()]} ${monday.getDate()} - ${friday.getDate()}`,
        span,
      });
    }
  } else {
    let i = 0;
    while (i < businessDays.length) {
      const month = businessDays[i].date.getMonth();
      const year = businessDays[i].date.getFullYear();
      let span = 0;
      while (i < businessDays.length && businessDays[i].date.getMonth() === month && businessDays[i].date.getFullYear() === year) {
        span++;
        i++;
      }
      const now = new Date();
      const showYear = year !== now.getFullYear();
      topGroups.push({
        label: `${SHORT_MONTHS[month]}${showYear ? ` ${year}` : ""}`,
        span,
      });
    }
  }

  return (
    <div className="sticky top-0 z-20 bg-white border-b border-[var(--border)]">
      {/* Top row: weeks or months */}
      <div className="flex border-b border-gray-100" style={{ height: 28 }}>
        {topGroups.map((g, i) => (
          <div
            key={i}
            className="shrink-0 text-[10px] font-semibold text-[var(--muted)] flex items-center px-2 border-r border-gray-100 truncate"
            style={{ width: g.span * dayWidth }}
          >
            {g.label}
          </div>
        ))}
      </div>

      {/* Bottom row: individual weekdays */}
      <div className="flex" style={{ height: 24 }}>
        {businessDays.map((d, i) => (
          <div
            key={i}
            className="shrink-0 text-[9px] text-center flex items-center justify-center border-r border-gray-50 text-[var(--muted)]"
            style={{ width: dayWidth }}
          >
            {zoom === "week" ? DAY_LABELS[d.dayOfWeek] : (d.date.getDate() === 1 || i === 0 ? d.date.getDate() : d.date.getDate() % 5 === 0 ? d.date.getDate() : "")}
          </div>
        ))}
      </div>
    </div>
  );
}

function getWeekNumber(date: Date): number {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}
