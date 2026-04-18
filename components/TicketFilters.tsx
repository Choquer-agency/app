"use client";

import { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { ClientConfig, TeamMember, TicketStatus, TicketPriority, TicketFilters as Filters } from "@/types";
import { STATUS_ORDER, getStatusLabel } from "./TicketStatusBadge";
import { getPriorityLabel } from "./TicketPriorityBadge";
import { useClients } from "@/hooks/useClients";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import FilterDropdown from "./FilterDropdown";

interface TicketFiltersProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
}

export default function TicketFilters({
  filters,
  onFiltersChange,
}: TicketFiltersProps) {
  const [open, setOpen] = useState(false);
  const { clients } = useClients();
  const { teamMembers } = useTeamMembers();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function toggleOpen() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      const panelWidth = 340;
      let left = rect.right / zoom - panelWidth;
      if (left < 8) left = rect.left / zoom;
      setPos({ top: rect.bottom / zoom + 6, left });
    }
    setOpen(!open);
  }

  const activeFilterCount = [
    filters.clientId,
    filters.assigneeId,
    filters.status,
    filters.priority,
  ].filter(Boolean).length;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        className={`p-1.5 rounded-lg transition ${
          open || activeFilterCount > 0
            ? "text-[var(--accent)] bg-[var(--accent-light)]"
            : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-gray-100"
        }`}
        title="Filters"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
        </svg>
        {activeFilterCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-[var(--accent)] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {activeFilterCount}
          </span>
        )}
      </button>

      {open &&
        typeof document !== "undefined" &&
        ReactDOM.createPortal(
          <div
            ref={panelRef}
            className="bg-white border border-[var(--border)] rounded-xl shadow-xl w-[340px]"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              zIndex: 9999,
            }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Filters</h3>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => {
                    onFiltersChange({ archived: false });
                    setOpen(false);
                  }}
                  className="p-1 text-[var(--muted)] hover:text-red-500 transition"
                  title="Clear all filters"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </button>
              )}
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-[var(--muted)] mb-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" />
                  </svg>
                  Client
                </label>
                <FilterDropdown
                  label=""
                  value={filters.clientId != null ? String(filters.clientId) : ""}
                  onChange={(v) =>
                    onFiltersChange({ ...filters, clientId: v ? Number(v) : undefined })
                  }
                  options={[
                    { value: "", label: "All Clients" },
                    ...clients.map((c) => ({ value: String(c.id), label: c.name })),
                  ]}
                  fullWidth
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-[var(--muted)] mb-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  Status
                </label>
                <FilterDropdown
                  label=""
                  value={Array.isArray(filters.status) ? "" : (filters.status as string) || ""}
                  onChange={(v) =>
                    onFiltersChange({ ...filters, status: (v as TicketStatus) || undefined })
                  }
                  options={[
                    { value: "", label: "All Statuses" },
                    ...STATUS_ORDER.map((s) => ({ value: String(s), label: getStatusLabel(s) })),
                  ]}
                  fullWidth
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-[var(--muted)] mb-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" />
                  </svg>
                  Priority
                </label>
                <FilterDropdown
                  label=""
                  value={Array.isArray(filters.priority) ? "" : (filters.priority as string) || ""}
                  onChange={(v) =>
                    onFiltersChange({ ...filters, priority: (v as TicketPriority) || undefined })
                  }
                  options={[
                    { value: "", label: "All Priorities" },
                    ...(["urgent", "high", "normal", "low"] as TicketPriority[]).map((p) => ({
                      value: String(p),
                      label: getPriorityLabel(p),
                    })),
                  ]}
                  fullWidth
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-[var(--muted)] mb-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                  </svg>
                  Assignee
                </label>
                <FilterDropdown
                  label=""
                  value={filters.assigneeId != null ? String(filters.assigneeId) : ""}
                  onChange={(v) =>
                    onFiltersChange({ ...filters, assigneeId: v ? Number(v) : undefined })
                  }
                  options={[
                    { value: "", label: "All Assignees" },
                    ...teamMembers.filter((m) => m.active).map((m) => ({ value: String(m.id), label: m.name })),
                  ]}
                  fullWidth
                />
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
