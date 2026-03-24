"use client";

import { useState } from "react";

interface MonthPickerProps {
  value: string; // ISO date for first of month, e.g. "2026-03-01"
  onChange: (month: string) => void;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function MonthPicker({ value, onChange }: MonthPickerProps) {
  const date = new Date(value + "T12:00:00");
  const month = date.getMonth();
  const year = date.getFullYear();
  const label = `${MONTH_NAMES[month]} ${year}`;

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const isCurrentMonth = value === currentMonth;

  function navigate(delta: number) {
    const d = new Date(value + "T12:00:00");
    d.setMonth(d.getMonth() + delta);
    const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    onChange(newMonth);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => navigate(-1)}
        className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition"
        title="Previous month"
      >
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <span className="text-sm font-semibold text-gray-900 min-w-[140px] text-center">
        {label}
      </span>

      <button
        onClick={() => navigate(1)}
        disabled={isCurrentMonth}
        className={`p-1.5 rounded-md transition ${
          isCurrentMonth
            ? "text-gray-300 cursor-not-allowed"
            : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
        }`}
        title="Next month"
      >
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {!isCurrentMonth && (
        <button
          onClick={() => onChange(currentMonth)}
          className="ml-1 px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
        >
          Today
        </button>
      )}
    </div>
  );
}
