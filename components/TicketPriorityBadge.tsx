"use client";

import { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { TicketPriority } from "@/types";

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; color: string; hex: string }> = {
  low: { label: "Low", color: "text-gray-400", hex: "#9ca3af" },
  normal: { label: "Normal", color: "text-blue-500", hex: "#3b82f6" },
  high: { label: "High", color: "text-orange-500", hex: "#f97316" },
  urgent: { label: "Urgent", color: "text-red-600", hex: "#dc2626" },
};

const PRIORITY_ORDER: TicketPriority[] = ["urgent", "high", "normal", "low"];

export function getPriorityLabel(priority: TicketPriority): string {
  return PRIORITY_CONFIG[priority]?.label || priority;
}

function PriorityIcon({ className }: { className?: string }) {
  return (
    <svg className={className || "w-3.5 h-3.5"} fill="currentColor" viewBox="0 0 256 256">
      <path d="M239.22,59.44l-45.63,95.82a3.54,3.54,0,0,1-.16.34l-34.21,71.84a8,8,0,1,1-14.44-6.88L173.62,160H40a8,8,0,0,1-5.66-13.66L76.69,104,34.34,61.66A8,8,0,0,1,40,48H232a8,8,0,0,1,7.22,11.44Z" />
    </svg>
  );
}

export default function TicketPriorityBadge({
  priority,
  showLabel = false,
}: {
  priority: TicketPriority;
  showLabel?: boolean;
}) {
  const config = PRIORITY_CONFIG[priority];
  if (!config) return null;

  return (
    <span className={`inline-flex items-center gap-1 ${config.color}`}>
      <PriorityIcon className="w-3.5 h-3.5" />
      {showLabel && <span className="text-xs font-medium">{config.label}</span>}
    </span>
  );
}

// Inline priority dropdown — portal-based, same pattern as status/assignee
export function PriorityDropdown({
  priority,
  onChange,
  size = "xs",
}: {
  priority: TicketPriority;
  onChange: (newPriority: TicketPriority) => void;
  size?: "xs" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

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
    setOpen(!open);
  }

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        className="cursor-pointer focus:outline-none"
      >
        <span className={`inline-flex items-center gap-1 ${PRIORITY_CONFIG[priority].color}`}>
          <PriorityIcon className="w-3.5 h-3.5" />
          <span className={`${size === "sm" ? "text-sm" : "text-xs"} font-medium`}>{PRIORITY_CONFIG[priority].label}</span>
        </span>
      </button>
      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-1 z-50 bg-white border border-[var(--border)] rounded-lg shadow-xl py-0 overflow-hidden min-w-[160px]"
        >
          {PRIORITY_ORDER.map((p) => (
            <button
              key={p}
              onClick={(e) => {
                e.stopPropagation();
                onChange(p);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--accent-light)] transition flex items-center gap-2.5 ${
                p === priority ? "font-semibold bg-[var(--accent-light)]" : ""
              }`}
            >
              <span style={{ color: PRIORITY_CONFIG[p].hex }}>
                <PriorityIcon className="w-4 h-4" />
              </span>
              {PRIORITY_CONFIG[p].label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
