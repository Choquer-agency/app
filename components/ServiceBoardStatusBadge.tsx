"use client";

import { useState, useRef, useEffect } from "react";
import { ServiceBoardStatus } from "@/types";

const STATUS_CONFIG: Record<ServiceBoardStatus, { label: string; bg: string; text: string; dot: string }> = {
  needs_attention: { label: "Backlog", bg: "bg-orange-100", text: "text-orange-700", dot: "bg-orange-500" },
  in_progress: { label: "In Progress", bg: "bg-blue-100", text: "text-blue-700", dot: "bg-blue-500" },
  report_ready: { label: "Report Ready", bg: "bg-purple-100", text: "text-purple-700", dot: "bg-purple-500" },
  email_sent: { label: "Email Sent", bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
};

interface ServiceBoardStatusBadgeProps {
  status: ServiceBoardStatus;
  onChange?: (status: ServiceBoardStatus) => void;
}

export default function ServiceBoardStatusBadge({ status, onChange }: ServiceBoardStatusBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.needs_attention;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!onChange) {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
        {config.label}
      </span>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text} hover:ring-1 hover:ring-gray-300 transition`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
        {config.label}
        <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="opacity-50">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-[160px]">
          {(Object.keys(STATUS_CONFIG) as ServiceBoardStatus[]).map((s) => {
            const c = STATUS_CONFIG[s];
            return (
              <button
                key={s}
                onClick={() => { onChange(s); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 transition ${
                  s === status ? "font-semibold" : ""
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                <span className={c.text}>{c.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function getStatusLabel(status: ServiceBoardStatus): string {
  return STATUS_CONFIG[status]?.label || status;
}
