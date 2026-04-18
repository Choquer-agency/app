"use client";

import { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";

export type FilterOption = {
  value: string;
  label: string;
  count?: number;
  dot?: string;
};

export default function FilterDropdown({
  label,
  value,
  options,
  onChange,
  fullWidth = false,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function toggleOpen(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      setPos({
        top: rect.bottom / zoom + 4,
        left: rect.left / zoom,
        width: rect.width / zoom,
      });
    }
    setOpen(!open);
  }

  const current = options.find((o) => o.value === value);
  const currentLabel = current?.label ?? "";
  const currentCount = current?.count;
  const currentDot = current?.dot;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        className={`${
          fullWidth ? "w-full flex justify-between" : "inline-flex"
        } items-center gap-2 px-3 py-2 text-sm font-medium bg-white border border-[var(--border)] rounded-lg text-[var(--foreground)] hover:border-[var(--accent)] transition focus:outline-none`}
      >
        {currentDot && (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: currentDot }}
          />
        )}
        {label && <span className="text-[var(--muted)]">{label}:</span>}
        <span>{currentLabel}</span>
        {currentCount !== undefined && (
          <span className="text-[var(--muted)]">({currentCount})</span>
        )}
        <svg className="w-3 h-3 text-[var(--muted)] ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open &&
        typeof document !== "undefined" &&
        ReactDOM.createPortal(
          <div
            ref={menuRef}
            className="bg-white border border-[var(--border)] rounded-lg shadow-xl py-1 overflow-y-auto"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              minWidth: Math.max(pos.width, 200),
              maxHeight: "min(320px, calc(100vh - " + (pos.top + 16) + "px))",
              zIndex: 9999,
            }}
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--hover-tan)] transition flex items-center gap-2.5 ${
                  opt.value === value ? "font-semibold bg-[var(--hover-tan)]" : ""
                }`}
              >
                {opt.dot && (
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: opt.dot }}
                  />
                )}
                <span className="flex-1">{opt.label}</span>
                {opt.count !== undefined && (
                  <span className="text-xs text-[var(--muted)]">({opt.count})</span>
                )}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
