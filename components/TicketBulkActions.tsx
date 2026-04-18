"use client";

import { TicketStatus, TicketPriority, TeamMember } from "@/types";
import { STATUS_ORDER, getStatusLabel } from "./TicketStatusBadge";
import { getPriorityLabel } from "./TicketPriorityBadge";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import FilterDropdown from "./FilterDropdown";

interface TicketBulkActionsProps {
  selectedCount: number;
  onBulkAction: (action: string, value: string | number) => void;
  onClear: () => void;
  onDelete: () => void;
}

export default function TicketBulkActions({
  selectedCount,
  onBulkAction,
  onClear,
  onDelete,
}: TicketBulkActionsProps) {
  const { teamMembers } = useTeamMembers();

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[var(--foreground)] text-white rounded-xl shadow-2xl px-5 py-3 flex items-center gap-4 text-sm">
      <span className="font-medium">{selectedCount} selected</span>
      <div className="w-px h-5 bg-white/20" />

      {/* Status */}
      <FilterDropdown
        label="Status"
        value=""
        onChange={(v) => {
          if (v) onBulkAction("status", v);
        }}
        options={[
          { value: "", label: "Choose..." },
          ...STATUS_ORDER.map((s) => ({ value: String(s), label: getStatusLabel(s) })),
        ]}
      />

      {/* Priority */}
      <FilterDropdown
        label="Priority"
        value=""
        onChange={(v) => {
          if (v) onBulkAction("priority", v);
        }}
        options={[
          { value: "", label: "Choose..." },
          ...(["urgent", "high", "normal", "low"] as TicketPriority[]).map((p) => ({
            value: String(p),
            label: getPriorityLabel(p),
          })),
        ]}
      />

      {/* Assign */}
      <FilterDropdown
        label="Assign to"
        value=""
        onChange={(v) => {
          if (v) onBulkAction("assign", Number(v));
        }}
        options={[
          { value: "", label: "Choose..." },
          ...teamMembers.filter((m) => m.active).map((m) => ({ value: String(m.id), label: m.name })),
        ]}
      />

      <div className="w-px h-5 bg-white/20" />
      <button
        onClick={onDelete}
        className="text-red-400 hover:text-red-300 transition p-1.5 rounded-lg hover:bg-white/10"
        title="Archive selected"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
        </svg>
      </button>
      <button
        onClick={onClear}
        className="text-white/70 hover:text-white transition text-sm"
      >
        Clear
      </button>
    </div>
  );
}
