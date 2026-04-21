"use client";

import React, { useState, useRef, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Ticket, TicketStatus, TicketPriority, TeamMember, ProjectGroup, isOverdueEligible } from "@/types";
import TicketStatusBadge, { StatusDot, getStatusDotColor } from "./TicketStatusBadge";
import TicketPriorityBadge, { getPriorityLabel } from "./TicketPriorityBadge";
import TicketAssigneeAvatars from "./TicketAssigneeAvatars";
import { useCurrentUser } from "@/hooks/useCurrentUser";

type GroupBy = "status" | "priority" | "assignee" | "client" | "group";

interface GroupedTickets {
  key: string;
  label: string;
  colorClass: string;
  tickets: Ticket[];
}

const GROUP_COLORS: Record<string, string> = {
  "#EF4444": "bg-red-100 text-red-700",
  "#F59E0B": "bg-amber-100 text-amber-700",
  "#10B981": "bg-green-100 text-green-700",
  "#3B82F6": "bg-blue-100 text-blue-700",
  "#8B5CF6": "bg-purple-100 text-purple-700",
  "#EC4899": "bg-pink-100 text-pink-700",
  "#6B7280": "bg-gray-100 text-gray-700",
};

interface KanbanBoardProps {
  groups: GroupedTickets[];
  groupBy: GroupBy;
  projectId?: string;
  teamMembers: TeamMember[];
  projectGroups: ProjectGroup[];
  onDragStart: (ticketId: string, groupKey: string) => void;
  onDragOver: (e: React.DragEvent, ticketId: string, groupKey: string) => void;
  onGroupDragOver: (e: React.DragEvent, groupKey: string) => void;
  onDrop: (targetId: string | null, groupKey: string) => void;
  onDragEnd: () => void;
  dragId: string | null;
  dragOverId: string | null;
  onTicketClick: (ticketId: string) => void;
  onTicketCreated: () => void;
  isPersonal?: boolean;
}

function isOverdue(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + "T00:00:00");
  return due < today;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

// Kanban quick-add for columns
function KanbanQuickAdd({ status, onCreated, projectId, isPersonal }: {
  status: TicketStatus;
  onCreated: () => void;
  projectId?: string;
  isPersonal?: boolean;
}) {
  const [active, setActive] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const createTicketMutation = useMutation(api.tickets.create);
  const { userId: currentUserId } = useCurrentUser();

  useEffect(() => {
    if (active) setTimeout(() => inputRef.current?.focus(), 0);
  }, [active]);

  async function createTicket() {
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await createTicketMutation({
        title: trimmed,
        status,
        ...(projectId && { projectId: projectId as Id<"projects"> }),
        ...(isPersonal && { isPersonal: true }),
        ...(currentUserId && { createdById: currentUserId as Id<"teamMembers"> }),
      });
      setTitle("");
      setActive(false);
      onCreated();
    } catch {} finally {
      setSaving(false);
    }
  }

  if (!active) {
    return (
      <button
        onClick={() => setActive(true)}
        className="w-full text-left px-3 py-2 text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition flex items-center gap-1.5 rounded-lg hover:bg-white/60"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Add ticket
      </button>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-[var(--border)] p-2.5 shadow-sm">
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") createTicket();
          if (e.key === "Escape") { setActive(false); setTitle(""); }
        }}
        placeholder="Ticket name..."
        disabled={saving}
        className="w-full text-sm font-medium text-[var(--foreground)] bg-transparent outline-none placeholder:text-gray-300 disabled:opacity-50 mb-2"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={createTicket}
          disabled={!title.trim() || saving}
          className="px-2.5 py-1 text-xs font-medium text-white bg-[var(--accent)] rounded-md hover:opacity-90 transition disabled:opacity-30"
        >
          {saving ? "..." : "Add"}
        </button>
        <button
          onClick={() => { setTitle(""); setActive(false); }}
          className="px-2.5 py-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function KanbanCard({
  ticket,
  groupKey,
  groupBy,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onClick,
  isDragging,
  isDragOver,
}: {
  ticket: Ticket;
  groupKey: string;
  groupBy: GroupBy;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onClick: () => void;
  isDragging: boolean;
  isDragOver: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`rounded-lg border p-3 cursor-pointer transition-all select-none ${
        ticket.isMeeting
          ? "bg-violet-50 border-violet-200 hover:border-violet-300"
          : "bg-white border-[var(--border)] hover:border-gray-300 hover:shadow-sm"
      } ${isDragging ? "opacity-40 scale-95" : ""} ${
        isDragOver ? "border-t-2 border-t-blue-400 mt-[-1px]" : ""
      }`}
    >
      {/* Top: ticket number + priority */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium text-[var(--muted)] tracking-wide">
          {ticket.ticketNumber || `#${ticket.id}`}
        </span>
        <TicketPriorityBadge priority={ticket.priority} />
      </div>

      {/* Title */}
      <div className="flex items-start gap-1.5 mb-2">
        {ticket.isMeeting && (
          <svg className="w-3.5 h-3.5 text-violet-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
        )}
        <p className={`text-sm font-medium line-clamp-2 leading-snug ${
          ticket.isMeeting ? "text-violet-900" : "text-[var(--foreground)]"
        }`}>
          {ticket.title}
        </p>
      </div>

      {/* Bottom row: status (if not grouped by status) + due date + subtasks + comments + assignees */}
      <div className="flex items-center gap-2 flex-wrap">
        {groupBy !== "status" && (
          <StatusDot status={ticket.status} size={8} />
        )}

        {ticket.dueDate && (
          <span className={`text-[11px] font-medium ${
            isOverdue(ticket.dueDate) && isOverdueEligible(ticket.status)
              ? "text-red-500"
              : "text-[var(--muted)]"
          }`}>
            {formatDate(ticket.dueDate)}
          </span>
        )}

        {(ticket.subTicketCount ?? 0) > 0 && (
          <span className="flex items-center gap-0.5 text-[var(--muted)]">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
            </svg>
            <span className="text-[10px]">{ticket.subTicketCount}</span>
          </span>
        )}

        {(ticket.commentCount ?? 0) > 0 && (
          <span className="flex items-center gap-0.5 text-[var(--muted)]">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 256 256">
              <path d="M216,48H40A16,16,0,0,0,24,64V224a15.84,15.84,0,0,0,9.25,14.5A16.05,16.05,0,0,0,40,240a15.89,15.89,0,0,0,10.25-3.78l.09-.07L83,208H216a16,16,0,0,0,16-16V64A16,16,0,0,0,216,48ZM40,224h0ZM216,192H80a8,8,0,0,0-5.23,1.95L40,224V64H216Z" />
            </svg>
            <span className="text-[10px]">{ticket.commentCount}</span>
          </span>
        )}

        <div className="ml-auto">
          <TicketAssigneeAvatars
            assignees={ticket.assignees || []}
            max={3}
            size="sm"
          />
        </div>
      </div>
    </div>
  );
}

function renderColumnBadge(
  group: GroupedTickets,
  groupBy: GroupBy,
  teamMembers: TeamMember[],
  projectGroups: ProjectGroup[]
) {
  if (groupBy === "status") {
    return <TicketStatusBadge status={group.key as TicketStatus} size="sm" />;
  }
  if (groupBy === "priority") {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
        group.key === "urgent" ? "bg-red-100 text-red-700" :
        group.key === "high" ? "bg-orange-100 text-orange-700" :
        group.key === "normal" ? "bg-blue-100 text-blue-700" :
        "bg-gray-100 text-gray-600"
      }`}>
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 256 256">
          <path d="M239.22,59.44l-45.63,95.82a3.54,3.54,0,0,1-.16.34l-34.21,71.84a8,8,0,1,1-14.44-6.88L173.62,160H40a8,8,0,0,1-5.66-13.66L76.69,104,34.34,61.66A8,8,0,0,1,40,48H232a8,8,0,0,1,7.22,11.44Z" />
        </svg>
        {getPriorityLabel(group.key as TicketPriority)}
      </span>
    );
  }
  if (groupBy === "assignee") {
    const member = teamMembers.find((m) => m.name === group.key);
    return (
      <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-[var(--foreground)]">
        {member ? (
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 overflow-hidden"
            style={{
              backgroundColor: member.color || "#e5e7eb",
              color: member.color ? "#fff" : "#6b7280",
            }}
          >
            {member.profilePicUrl ? (
              <img src={member.profilePicUrl} alt={member.name} className="w-full h-full object-cover" />
            ) : (
              member.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
            )}
          </div>
        ) : (
          <div className="w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center text-[9px] font-bold text-white shrink-0">?</div>
        )}
        {group.label}
      </span>
    );
  }
  if (groupBy === "group") {
    const pg = projectGroups.find((g) => String(g.id) === group.key);
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${group.colorClass}`}>
        {pg?.color && (
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: pg.color }} />
        )}
        {group.label}
      </span>
    );
  }
  // client
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-[var(--foreground)]">
      {group.label}
    </span>
  );
}

export default function KanbanBoard({
  groups,
  groupBy,
  projectId,
  teamMembers,
  projectGroups,
  onDragStart,
  onDragOver,
  onGroupDragOver,
  onDrop,
  onDragEnd,
  dragId,
  dragOverId,
  onTicketClick,
  onTicketCreated,
  isPersonal,
}: KanbanBoardProps) {
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const dragSourceColumn = useRef<string | null>(null);

  function handleCardDragStart(ticketId: string, groupKey: string) {
    dragSourceColumn.current = groupKey;
    onDragStart(ticketId, groupKey);
  }

  function handleColumnDragOver(e: React.DragEvent, groupKey: string) {
    e.preventDefault();
    setDragOverColumn(groupKey);
    onGroupDragOver(e, groupKey);
  }

  function handleColumnDrop(groupKey: string) {
    setDragOverColumn(null);
    onDrop(null, groupKey);
  }

  function handleColumnDragLeave() {
    setDragOverColumn(null);
  }

  function handleCardDragEnd() {
    setDragOverColumn(null);
    dragSourceColumn.current = null;
    onDragEnd();
  }

  return (
    <div
      className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1"
    >
      {groups.map((group) => {
        const isDropTarget = dragOverColumn === group.key && dragSourceColumn.current !== group.key;

        return (
          <div
            key={group.key}
            className={`w-72 shrink-0 flex flex-col rounded-xl border transition-colors ${
              isDropTarget
                ? "border-blue-300 bg-blue-50/40 ring-1 ring-blue-200"
                : "border-[var(--border)] bg-gray-50/60"
            }`}
            onDragOver={(e) => handleColumnDragOver(e, group.key)}
            onDrop={() => handleColumnDrop(group.key)}
            onDragLeave={handleColumnDragLeave}
          >
            {/* Column header */}
            <div className="px-3 py-3 flex items-center gap-2 border-b border-[var(--border)]/50">
              {renderColumnBadge(group, groupBy, teamMembers, projectGroups)}
              <span className="text-xs text-[var(--muted)] font-medium ml-auto tabular-nums">
                {group.tickets.length}
              </span>
            </div>

            {/* Cards area */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[80px]">
              {group.tickets.length === 0 ? (
                <div className="flex items-center justify-center h-20 text-xs text-gray-300 select-none">
                  {dragId ? "Drop here" : "No tickets"}
                </div>
              ) : (
                group.tickets.map((ticket) => (
                  <KanbanCard
                    key={ticket.id}
                    ticket={ticket}
                    groupKey={group.key}
                    groupBy={groupBy}
                    onDragStart={() => handleCardDragStart(ticket.id, group.key)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onDragOver(e, ticket.id, group.key);
                    }}
                    onDrop={() => {
                      setDragOverColumn(null);
                      onDrop(ticket.id, group.key);
                    }}
                    onDragEnd={handleCardDragEnd}
                    onClick={() => onTicketClick(ticket.id)}
                    isDragging={dragId === ticket.id}
                    isDragOver={dragOverId === ticket.id && dragId !== ticket.id}
                  />
                ))
              )}
            </div>

            {/* Quick-add at bottom (status grouping only) */}
            {groupBy === "status" && (
              <div className="px-2 pb-2">
                <KanbanQuickAdd
                  status={group.key as TicketStatus}
                  onCreated={onTicketCreated}
                  projectId={projectId}
                  isPersonal={isPersonal}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
