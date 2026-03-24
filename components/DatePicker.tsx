"use client";

import { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";

interface DatePickerProps {
  value: string | null; // ISO date string "YYYY-MM-DD" or null
  onChange: (date: string | null) => void;
  placeholder?: string;
  displayFormat?: "short" | "full"; // short: "3/20/26", full: "Mar 20, 2026"
  className?: string;
  clearable?: boolean;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDisplay(dateStr: string, format: "short" | "full"): string {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const showYear = d.getFullYear() !== now.getFullYear();
  if (format === "full") {
    return showYear
      ? `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
      : `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
  }
  return showYear
    ? `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
    : `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export default function DatePicker({
  value,
  onChange,
  placeholder = "Select date",
  displayFormat = "full",
  className = "",
  clearable = true,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => {
    if (value) return new Date(value + "T00:00:00").getFullYear();
    return new Date().getFullYear();
  });
  const [viewMonth, setViewMonth] = useState(() => {
    if (value) return new Date(value + "T00:00:00").getMonth();
    return new Date().getMonth();
  });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const selectedDate = value ? new Date(value + "T00:00:00") : null;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleScroll() { setOpen(false); }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      document.addEventListener("scroll", handleScroll, true);
    }
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  function toggleOpen(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      const calendarWidth = 300;
      const calendarHeight = 380; // approximate height of calendar popup

      let left = rect.left / zoom;
      // Keep within viewport horizontally
      if (left + calendarWidth > window.innerWidth / zoom - 8) {
        left = rect.right / zoom - calendarWidth;
      }
      if (left < 8) left = 8;

      // Place below button, or above if not enough room below
      let top = rect.bottom / zoom + 4;
      if (top + calendarHeight > window.innerHeight / zoom) {
        top = rect.top / zoom - calendarHeight - 4;
        if (top < 8) top = 8; // fallback: don't go above viewport
      }

      setPos({ top, left });
    }
    if (!open && value) {
      const d = new Date(value + "T00:00:00");
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
    setOpen(!open);
  }

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  }

  function selectDate(day: number) {
    const m = String(viewMonth + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    onChange(`${viewYear}-${m}-${d}`);
    setOpen(false);
  }

  function goToToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    onChange(`${today.getFullYear()}-${m}-${d}`);
    setOpen(false);
  }

  // Build calendar grid
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);
  const prevMonthDays = getDaysInMonth(viewYear, viewMonth === 0 ? 11 : viewMonth - 1);

  const cells: Array<{ day: number; inMonth: boolean; isToday: boolean; isSelected: boolean }> = [];

  // Previous month trailing days
  for (let i = firstDay - 1; i >= 0; i--) {
    const day = prevMonthDays - i;
    cells.push({ day, inMonth: false, isToday: false, isSelected: false });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(viewYear, viewMonth, d);
    cells.push({
      day: d,
      inMonth: true,
      isToday: isSameDay(date, today),
      isSelected: selectedDate ? isSameDay(date, selectedDate) : false,
    });
  }

  // Next month leading days
  const remaining = 7 - (cells.length % 7);
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      cells.push({ day: d, inMonth: false, isToday: false, isSelected: false });
    }
  }

  const isOverdue = selectedDate && selectedDate < today;

  const calendarEl = (
    <div
      ref={menuRef}
      className="bg-white border border-[var(--border)] rounded-xl shadow-xl p-4"
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        zIndex: 9999,
        width: 300,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Month/Year header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={prevMonth}
          className="p-1 rounded-lg hover:bg-gray-100 transition text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-[var(--foreground)]">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          onClick={nextMonth}
          className="p-1 rounded-lg hover:bg-gray-100 transition text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day names */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-[var(--muted)] py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => (
          <button
            key={i}
            disabled={!cell.inMonth}
            onClick={() => cell.inMonth && selectDate(cell.day)}
            className={`h-9 w-full text-xs rounded-lg transition flex items-center justify-center ${
              !cell.inMonth
                ? "text-gray-300 cursor-default"
                : cell.isSelected
                ? "bg-[var(--accent)] text-white font-semibold"
                : cell.isToday
                ? "bg-[var(--accent-light)] text-[var(--accent)] font-semibold"
                : "text-[var(--foreground)] hover:bg-gray-100"
            }`}
          >
            {cell.day}
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
        <button
          onClick={goToToday}
          className="text-xs font-medium text-[var(--accent)] hover:underline"
        >
          Today
        </button>
        {clearable && value && (
          <button
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="text-xs text-[var(--muted)] hover:text-red-500 transition"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        className={`focus:outline-none cursor-pointer text-left ${className}`}
      >
        {value ? (
          <span className={`${className.includes("text-sm") ? "" : "text-xs"} ${isOverdue ? "text-red-600 font-semibold" : "text-[var(--foreground)]"}`}>
            {formatDisplay(value, displayFormat)}
          </span>
        ) : (
          <span className={`${className.includes("text-sm") ? "" : "text-xs"} text-[var(--muted)]`}>{placeholder}</span>
        )}
      </button>
      {open &&
        typeof document !== "undefined" &&
        ReactDOM.createPortal(calendarEl, document.body)}
    </>
  );
}
