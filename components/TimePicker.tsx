"use client";

import { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";

interface TimePickerProps {
  value: string | null; // "HH:MM" 24h format or null
  onChange: (time: string | null) => void;
  className?: string;
  placeholder?: string;
}

const HOURS_12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = ["00", "15", "30", "45"];

function to12Hour(time24: string): { hour: number; minute: string; period: "AM" | "PM" } {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const minute = String(m).padStart(2, "0");
  return { hour, minute, period };
}

function to24Hour(hour: number, minute: string, period: "AM" | "PM"): string {
  let h = hour;
  if (period === "AM" && h === 12) h = 0;
  if (period === "PM" && h !== 12) h += 12;
  return `${String(h).padStart(2, "0")}:${minute}`;
}

function formatDisplay(time24: string): string {
  const { hour, minute, period } = to12Hour(time24);
  return `${hour}:${minute} ${period}`;
}

export default function TimePicker({ value, onChange, className = "", placeholder = "Set time" }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  // Parse current value
  const parsed = value ? to12Hour(value) : null;
  const [selHour, setSelHour] = useState(parsed?.hour ?? 10);
  const [selMinute, setSelMinute] = useState(parsed?.minute ?? "00");
  const [selPeriod, setSelPeriod] = useState<"AM" | "PM">(parsed?.period ?? "AM");

  // Sync when value changes externally
  useEffect(() => {
    if (value) {
      const p = to12Hour(value);
      setSelHour(p.hour);
      setSelMinute(p.minute);
      setSelPeriod(p.period);
    }
  }, [value]);

  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      const pickerWidth = 240;
      const pickerHeight = 310;

      let left = rect.left / zoom;
      if (left + pickerWidth > window.innerWidth / zoom - 8) {
        left = rect.right / zoom - pickerWidth;
      }
      if (left < 8) left = 8;

      let top = rect.bottom / zoom + 4;
      if (top + pickerHeight > window.innerHeight / zoom) {
        top = rect.top / zoom - pickerHeight - 4;
        if (top < 8) top = 8;
      }

      setPos({ top, left });
    }
  }, [open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.body.style.overflow = "";
    };
  }, [open]);

  function handleSave() {
    onChange(to24Hour(selHour, selMinute, selPeriod));
    setOpen(false);
  }

  return (
    <span className="inline-flex align-middle">
      <button
        ref={triggerRef}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className={`inline-flex items-center gap-1 cursor-pointer hover:text-[var(--accent)] transition ${className}`}
      >
        <svg className="w-3.5 h-3.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
        {value ? formatDisplay(value) : <span className="opacity-40">{placeholder}</span>}
      </button>

      {open && ReactDOM.createPortal(
        <div
          ref={dropdownRef}
          className="bg-white border border-[var(--border)] rounded-xl shadow-xl overflow-hidden"
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999, width: 240 }}
        >
          <div className="flex h-[260px]">
            {/* Hours */}
            <div className="flex-1 overflow-y-auto border-r border-gray-100 py-1">
              <div className="px-2 py-1 text-[9px] font-semibold text-[var(--muted)] uppercase">Hour</div>
              {HOURS_12.map((h) => (
                <button
                  key={h}
                  onClick={() => setSelHour(h)}
                  className={`w-[calc(100%-8px)] mx-1 text-left px-2 py-1 text-sm rounded-md transition-colors ${
                    selHour === h ? "bg-[var(--accent)] text-white font-medium" : "hover:bg-gray-50 text-[var(--foreground)]"
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>

            {/* Minutes */}
            <div className="flex-1 overflow-y-auto border-r border-gray-100 py-1">
              <div className="px-2 py-1 text-[9px] font-semibold text-[var(--muted)] uppercase">Min</div>
              {MINUTES.map((m) => (
                <button
                  key={m}
                  onClick={() => setSelMinute(m)}
                  className={`w-[calc(100%-8px)] mx-1 text-left px-2 py-1 text-sm rounded-md transition-colors ${
                    selMinute === m ? "bg-[var(--accent)] text-white font-medium" : "hover:bg-gray-50 text-[var(--foreground)]"
                  }`}
                >
                  :{m}
                </button>
              ))}
            </div>

            {/* AM/PM */}
            <div className="w-16 py-1">
              <div className="px-2 py-1 text-[9px] font-semibold text-[var(--muted)] uppercase">&nbsp;</div>
              {(["AM", "PM"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setSelPeriod(p)}
                  className={`w-[calc(100%-8px)] mx-1 text-center px-2 py-1 text-sm rounded-md transition-colors ${
                    selPeriod === p ? "bg-[var(--accent)] text-white font-medium" : "hover:bg-gray-50 text-[var(--foreground)]"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100">
            <button
              onClick={() => { onChange(null); setOpen(false); }}
              className="text-xs text-[var(--muted)] hover:text-red-500 transition"
            >
              Clear
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--muted)]">
                {selHour}:{selMinute} {selPeriod}
              </span>
              <button
                onClick={handleSave}
                className="px-3 py-1 text-xs font-medium bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition"
              >
                Save
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </span>
  );
}
