"use client";

import { DateRange } from "@/types";

interface DateRangeSelectorProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

const RANGES: { label: string; value: DateRange }[] = [
  { label: "7D", value: "7d" },
  { label: "28D", value: "28d" },
  { label: "3M", value: "3m" },
  { label: "6M", value: "6m" },
  { label: "12M", value: "12m" },
];

export default function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  return (
    <div className="flex gap-0.5 text-xs" data-track="timerange">
      {RANGES.map((r) => (
        <button
          key={r.value}
          onClick={() => onChange(r.value)}
          className={`px-2.5 py-1 rounded transition ${
            value === r.value
              ? "bg-[#1A1A1A] text-white font-medium"
              : "text-muted hover:text-[#1A1A1A]"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
