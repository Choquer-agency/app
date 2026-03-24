"use client";

import { useState } from "react";
import DatePicker from "@/components/DatePicker";

export type PeriodPreset = "this_week" | "last_week" | "this_month" | "last_month" | "this_quarter" | "custom";

interface ReportPeriodSelectorProps {
  value: PeriodPreset;
  customStart?: string;
  customEnd?: string;
  onChange: (preset: PeriodPreset, start: string, end: string) => void;
}

function getDateRange(preset: PeriodPreset, customStart?: string, customEnd?: string): { start: string; end: string } {
  const now = new Date();

  switch (preset) {
    case "this_week": {
      // Monday to current day (end of today)
      const day = now.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1; // Sunday = go back 6, else go back day-1
      const start = new Date(now);
      start.setDate(now.getDate() - diffToMonday);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case "last_week": {
      // Last Monday to last Friday
      const day = now.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() - diffToMonday);
      const start = new Date(thisMonday);
      start.setDate(thisMonday.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 4); // Friday
      end.setHours(23, 59, 59, 999);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month
      end.setHours(23, 59, 59, 999);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case "this_quarter": {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      const start = new Date(now.getFullYear(), qMonth, 1);
      const end = new Date(now.getFullYear(), qMonth + 3, 1);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case "custom": {
      if (customStart && customEnd) {
        return {
          start: new Date(customStart + "T00:00:00").toISOString(),
          end: new Date(customEnd + "T23:59:59").toISOString(),
        };
      }
      // fallback to this month
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { start: start.toISOString(), end: end.toISOString() };
    }
  }
}

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "this_week", label: "This Week" },
  { value: "last_week", label: "Last Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_quarter", label: "This Quarter" },
  { value: "custom", label: "Custom" },
];

export default function ReportPeriodSelector({ value, customStart, customEnd, onChange }: ReportPeriodSelectorProps) {
  const [localStart, setLocalStart] = useState(customStart || "");
  const [localEnd, setLocalEnd] = useState(customEnd || "");

  function handlePreset(preset: PeriodPreset) {
    if (preset === "custom") {
      if (localStart && localEnd) {
        const range = getDateRange("custom", localStart, localEnd);
        onChange("custom", range.start, range.end);
      } else {
        onChange("custom", "", "");
      }
    } else {
      const range = getDateRange(preset);
      onChange(preset, range.start, range.end);
    }
  }

  function handleCustomDate(type: "start" | "end", dateStr: string | null) {
    const newStart = type === "start" ? (dateStr || "") : localStart;
    const newEnd = type === "end" ? (dateStr || "") : localEnd;
    if (type === "start") setLocalStart(newStart);
    else setLocalEnd(newEnd);

    if (newStart && newEnd) {
      const range = getDateRange("custom", newStart, newEnd);
      onChange("custom", range.start, range.end);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center bg-[#F5F5F5] rounded-lg p-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => handlePreset(p.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
              value === p.value
                ? "bg-[#1A1A1A] text-white shadow-sm"
                : "text-[#6B7280] hover:text-[#1A1A1A]"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {value === "custom" && (
        <div className="flex items-center gap-2">
          <DatePicker
            value={localStart || null}
            onChange={(d) => handleCustomDate("start", d)}
            placeholder="Start date"
            displayFormat="full"
            clearable
          />
          <span className="text-xs text-[#9CA3AF]">to</span>
          <DatePicker
            value={localEnd || null}
            onChange={(d) => handleCustomDate("end", d)}
            placeholder="End date"
            displayFormat="full"
            clearable
          />
        </div>
      )}
    </div>
  );
}

export { getDateRange };
