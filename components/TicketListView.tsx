"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Ticket, TicketFilters as Filters, TicketStatus, TicketPriority, SavedView, TeamMember, ProjectGroup, isOverdueEligible } from "@/types";
import { useKeyboardShortcuts } from "./KeyboardShortcutProvider";
import { useTickets } from "@/hooks/useTickets";
import { useSubTickets } from "@/hooks/useSubTickets";
import TicketStatusBadge, { STATUS_ORDER, getStatusLabel, getStatusColor, StatusDot, getStatusDotColor } from "./TicketStatusBadge";
import TicketPriorityBadge, { getPriorityLabel, PriorityDropdown } from "./TicketPriorityBadge";
import TicketAssigneeAvatars from "./TicketAssigneeAvatars";
import TicketFilters from "./TicketFilters";
import TicketBulkActions from "./TicketBulkActions";
import SavedViewsTabs from "./SavedViewsTabs";
import DatePicker from "./DatePicker";
import TimePicker from "./TimePicker";
import StatusDropdown from "./StatusDropdown";
import AssigneeDropdown from "./AssigneeDropdown";
import TicketDetailModal from "./TicketDetailModal";
import TicketCreateModal from "./TicketCreateModal";
import DateCascadeConfirm from "./DateCascadeConfirm";
import TicketQuickAdd, { TicketQuickAddMobile } from "./TicketQuickAdd";
import TimeTracker from "./TimeTracker";
import KanbanBoard from "./KanbanBoard";

type GroupBy = "status" | "priority" | "assignee" | "client" | "group";

function formatMeetingDate(dateStr: string, timeStr?: string | null): string {
  const d = new Date(dateStr + "T12:00:00");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = d.getDate();
  const suffix = day === 1 || day === 21 || day === 31 ? "st"
    : day === 2 || day === 22 ? "nd"
    : day === 3 || day === 23 ? "rd" : "th";
  let result = `${months[d.getMonth()]} ${day}${suffix}`;
  if (timeStr) {
    // timeStr could be "10:00", "14:30", "5pm", etc.
    const match = timeStr.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/i);
    if (match) {
      let hour = parseInt(match[1]);
      const min = match[2] ? parseInt(match[2]) : 0;
      let ampm = match[3]?.toLowerCase();
      if (!ampm) {
        ampm = hour >= 12 ? "pm" : "am";
        if (hour > 12) hour -= 12;
        if (hour === 0) hour = 12;
      }
      result += min > 0 ? ` ${hour}:${String(min).padStart(2, "0")}${ampm}` : ` ${hour}${ampm}`;
    } else {
      result += ` ${timeStr}`;
    }
  }
  return result;
}

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

function groupTickets(tickets: Ticket[], groupBy: GroupBy, projectGroups?: ProjectGroup[]): GroupedTickets[] {
  const groups = new Map<string, Ticket[]>();

  if (groupBy === "group" && projectGroups && projectGroups.length > 0) {
    // Initialize groups in sort order
    for (const g of projectGroups) {
      groups.set(String(g.id), []);
    }
    groups.set("ungrouped", []);

    for (const t of tickets) {
      const key = t.groupId ? String(t.groupId) : "ungrouped";
      const list = groups.get(key) || [];
      list.push(t);
      groups.set(key, list);
    }

    const result: GroupedTickets[] = [];
    for (const g of projectGroups) {
      result.push({
        key: String(g.id),
        label: g.name,
        colorClass: g.color ? (GROUP_COLORS[g.color] || "bg-gray-100 text-gray-700") : "bg-gray-100 text-gray-700",
        tickets: groups.get(String(g.id)) || [],
      });
    }
    const ungrouped = groups.get("ungrouped") || [];
    if (ungrouped.length > 0) {
      result.push({
        key: "ungrouped",
        label: "Ungrouped",
        colorClass: "bg-gray-100 text-gray-700",
        tickets: ungrouped,
      });
    }
    return result;
  }

  if (groupBy === "status") {
    for (const s of STATUS_ORDER) groups.set(s, []);
    for (const t of tickets) {
      const list = groups.get(t.status) || [];
      list.push(t);
      groups.set(t.status, list);
    }
    return Array.from(groups.entries()).map(([key, tix]) => ({
      key,
      label: getStatusLabel(key as TicketStatus),
      colorClass: getStatusColor(key as TicketStatus),
      tickets: tix,
    }));
  }

  if (groupBy === "priority") {
    const order: TicketPriority[] = ["urgent", "high", "normal", "low"];
    for (const p of order) groups.set(p, []);
    for (const t of tickets) {
      const list = groups.get(t.priority) || [];
      list.push(t);
      groups.set(t.priority, list);
    }
    return Array.from(groups.entries()).map(([key, tix]) => ({
      key,
      label: getPriorityLabel(key as TicketPriority),
      colorClass: "bg-gray-100 text-gray-700",
      tickets: tix,
    }));
  }

  if (groupBy === "client") {
    for (const t of tickets) {
      const k = t.clientName || "No Client";
      const list = groups.get(k) || [];
      list.push(t);
      groups.set(k, list);
    }
    return Array.from(groups.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, tix]) => ({
        key,
        label: key,
        colorClass: "bg-gray-100 text-gray-700",
        tickets: tix,
      }));
  }

  // assignee
  for (const t of tickets) {
    if (t.assignees && t.assignees.length > 0) {
      for (const a of t.assignees) {
        const k = a.memberName || "Unknown";
        const list = groups.get(k) || [];
        list.push(t);
        groups.set(k, list);
      }
    } else {
      const list = groups.get("Unassigned") || [];
      list.push(t);
      groups.set("Unassigned", list);
    }
  }
  return Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, tix]) => ({
      key,
      label: key,
      colorClass: "bg-gray-100 text-gray-700",
      tickets: tix,
    }));
}

function SubTicketRows({
  parentTicketId,
  selectedIds,
  teamMembers,
  projectId,
  onToggleSelect,
  onOpenDetail,
  onStatusChange,
  onAssigneeToggle,
  onDueDateChange,
  onPriorityChange,
}: {
  parentTicketId: string;
  selectedIds: Set<string>;
  teamMembers: TeamMember[];
  projectId?: string;
  onToggleSelect: (id: string) => void;
  onOpenDetail: (id: string) => void;
  onStatusChange: (id: string, status: TicketStatus) => void;
  onAssigneeToggle: (ticketId: string, memberId: string, action: "add" | "remove") => void;
  onDueDateChange: (id: string, date: string | null) => void;
  onPriorityChange: (id: string, priority: TicketPriority) => void;
}) {
  const { subTickets, isLoading } = useSubTickets(parentTicketId);

  if (isLoading) {
    return (
      <tr>
        <td colSpan={999} className="px-6 py-2 text-xs text-[var(--muted)]">Loading subtasks...</td>
      </tr>
    );
  }

  return (
    <>
      {subTickets.map((sub) => (
        <tr
          key={sub.id}
          onClick={() => onOpenDetail(sub.id)}
          className="border-b border-[var(--border)] last:border-b-0 hover:bg-gray-50/50 cursor-pointer transition bg-gray-50/30"
        >
          <td className="px-2 py-3">
            <div className="flex items-center gap-1">
              <span className="w-4" />
              <input
                type="checkbox"
                checked={selectedIds.has(sub.id)}
                onChange={(e) => { e.stopPropagation(); onToggleSelect(sub.id); }}
                onClick={(e) => e.stopPropagation()}
                className="rounded"
              />
            </div>
          </td>
          <td className="px-1 py-3" />
          <td className="px-3 py-3">
            <div className="flex items-center gap-2.5 pl-6">
              <StatusDot status={sub.status} size={10} />
              <span className="font-medium text-[var(--foreground)]">
                {sub.title}
              </span>
            </div>
          </td>
          <td className="px-3 py-3" />
          {!projectId && <td className="px-3 py-3 text-xs text-[var(--muted)]">{sub.clientName || "\u2014"}</td>}
          <td className="px-3 py-3">
            <StatusDropdown status={sub.status} onChange={(s) => onStatusChange(sub.id, s)} />
          </td>
          <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
            <TimeTracker ticketId={sub.id} onTimerChange={() => window.dispatchEvent(new CustomEvent("timerChange"))} />
          </td>
          <td className="px-3 py-3">
            <AssigneeDropdown ticketId={sub.id} assignees={sub.assignees || []} teamMembers={teamMembers} onToggle={onAssigneeToggle} />
          </td>
          <td className="px-0 py-0">
            <DatePicker value={sub.dueDate} onChange={(d) => onDueDateChange(sub.id, d)} placeholder="\u2014" displayFormat="short" className="w-full h-full px-3 py-3 block" />
          </td>
          <td className="px-3 py-3">
            <PriorityDropdown priority={sub.priority} onChange={(p) => onPriorityChange(sub.id, p)} />
          </td>
          {!projectId && <td className="px-3 py-3" />}
        </tr>
      ))}
    </>
  );
}

interface TicketListViewProps {
  projectId?: string;
  clientId?: string;
  isPersonal?: boolean;
  ownerId?: string;
  assigneeId?: string;
}

export default function TicketListView({ projectId, clientId, isPersonal, ownerId, assigneeId }: TicketListViewProps = {}) {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [projectGroups, setProjectGroups] = useState<ProjectGroup[]>([]);
  const [filters, setFilters] = useState<Filters>({ archived: false });
  const [groupBy, setGroupBy] = useState<GroupBy>("status");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    // "closed" group defaults to collapsed; restore any persisted state
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("ticket-collapsed-groups");
        if (stored) {
          const parsed = JSON.parse(stored) as string[];
          // Always ensure "closed" is in the set unless explicitly removed
          if (!parsed.includes("closed")) parsed.push("closed");
          return new Set(parsed);
        }
      } catch {}
    }
    return new Set(["closed"]);
  });
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [detailTicketId, setDetailTicketId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createAsMeeting, setCreateAsMeeting] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const createMenuRef = useRef<HTMLDivElement>(null);
  const [cascadeInfo, setCascadeInfo] = useState<{
    ticketId: string;
    ticketTitle: string;
    field: "startDate" | "dueDate";
    oldDate: string;
    newDate: string;
  } | null>(null);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // View mode: list or kanban
  const [viewMode, setViewMode] = useState<"list" | "kanban">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("ticket-view-mode") as "list" | "kanban") || "list";
    }
    return "list";
  });

  useEffect(() => {
    localStorage.setItem("ticket-view-mode", viewMode);
  }, [viewMode]);

  // Keyboard navigation state
  const [focusedTicketId, setFocusedTicketId] = useState<string | null>(null);

  // Subtask expand state
  const [expandedTickets, setExpandedTickets] = useState<Set<string>>(new Set());
  // Track a single expanded parent for the useSubTickets subscription
  const [activeExpandedParent, setActiveExpandedParent] = useState<string | null>(null);

  // Drag state
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragGroupRef = useRef<string | null>(null);
  const dragOverGroupRef = useRef<string | null>(null);

  const savedViewFiltersRef = useRef<string | null>(null);

  // === Real-time ticket subscription ===
  const { tickets, isLoading } = useTickets({
    filters,
    projectId,
    clientId,
    isPersonal,
    ownerId,
    assigneeId,
  });

  // URL sync: open detail modal if ?ticket= param is present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ticketParam = params.get("ticket");
    if (ticketParam) {
      setDetailTicketId(ticketParam);
    }
  }, []);

  function openDetailModal(ticketId: string) {
    setDetailTicketId(ticketId);
    const url = new URL(window.location.href);
    url.searchParams.set("ticket", ticketId);
    window.history.pushState({}, "", url.toString());
  }

  function closeDetailModal() {
    setDetailTicketId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("ticket");
    window.history.pushState({}, "", url.toString());
  }

  function toggleSubTickets(ticketId: string) {
    const next = new Set(expandedTickets);
    if (next.has(ticketId)) {
      next.delete(ticketId);
      if (activeExpandedParent === ticketId) {
        // Switch to another expanded parent or null
        const remaining = Array.from(next);
        setActiveExpandedParent(remaining.length > 0 ? remaining[0] : null);
      }
    } else {
      next.add(ticketId);
      setActiveExpandedParent(ticketId);
    }
    setExpandedTickets(next);
  }

  useEffect(() => {
    fetch("/api/admin/team")
      .then((r) => (r.ok ? r.json() : []))
      .then(setTeamMembers)
      .catch(() => {});

    // Fetch project groups if viewing a project — default to group-by-phase
    if (projectId) {
      fetch(`/api/admin/projects/${projectId}/groups`)
        .then((r) => (r.ok ? r.json() : []))
        .then((groups: ProjectGroup[]) => {
          setProjectGroups(groups);
          if (groups.length > 0) {
            setGroupBy("group");
          }
        })
        .catch(() => {});
    }
  }, [projectId]);

  async function handleAssigneeToggle(ticketId: string, memberId: string, action: "add" | "remove") {
    try {
      if (action === "add") {
        await fetch(`/api/admin/tickets/${ticketId}/assignees`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamMemberId: memberId }),
        });
      } else {
        await fetch(`/api/admin/tickets/${ticketId}/assignees`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamMemberId: memberId }),
        });
      }
    } catch {
      // Convex subscription will reconcile automatically
    }
  }

  function handleFiltersChange(newFilters: Filters) {
    setFilters(newFilters);
    if (savedViewFiltersRef.current) {
      setHasUnsavedChanges(JSON.stringify({ ...newFilters, groupBy }) !== savedViewFiltersRef.current);
    }
  }

  function handleGroupByChange(newGroupBy: GroupBy) {
    setGroupBy(newGroupBy);
    if (savedViewFiltersRef.current) {
      setHasUnsavedChanges(JSON.stringify({ ...filters, groupBy: newGroupBy }) !== savedViewFiltersRef.current);
    }
  }

  function handleSort(field: string) {
    if (sortField === field) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortField(null); setSortDir("asc"); } // third click clears
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function sortTickets(tix: Ticket[]): Ticket[] {
    if (!sortField) return tix;
    const sorted = [...tix].sort((a, b) => {
      let aVal: string | number | null = null;
      let bVal: string | number | null = null;
      switch (sortField) {
        case "title": aVal = a.title.toLowerCase(); bVal = b.title.toLowerCase(); break;
        case "client": aVal = (a.clientName || "").toLowerCase(); bVal = (b.clientName || "").toLowerCase(); break;
        case "status": {
          const order = ["needs_attention", "stuck", "in_progress", "qa_ready", "client_review", "approved_go_live", "closed"];
          aVal = order.indexOf(a.status); bVal = order.indexOf(b.status); break;
        }
        case "priority": {
          const order = ["urgent", "high", "normal", "low"];
          aVal = order.indexOf(a.priority); bVal = order.indexOf(b.priority); break;
        }
        case "dueDate": aVal = a.dueDate || "9999"; bVal = b.dueDate || "9999"; break;
        case "createdAt": aVal = a.createdAt; bVal = b.createdAt; break;
        default: return 0;
      }
      if (aVal === null || bVal === null) return 0;
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }

  function handleViewSelect(view: SavedView | null) {
    if (view) {
      setActiveViewId(view.id);
      const viewFilters = { ...view.filters };
      const savedGroupBy = viewFilters.groupBy || "status";
      setGroupBy(savedGroupBy);
      setFilters(viewFilters);
      savedViewFiltersRef.current = JSON.stringify(viewFilters);
      setHasUnsavedChanges(false);
    } else {
      setActiveViewId(null);
      setFilters({ archived: false });
      setGroupBy("status");
      savedViewFiltersRef.current = null;
      setHasUnsavedChanges(false);
    }
  }

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try { localStorage.setItem("ticket-collapsed-groups", JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(groupTickets: Ticket[]) {
    const ids = groupTickets.map((t) => t.id);
    const allSelected = ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  async function handleBulkAction(action: string, value: string | number) {
    const ticketIds = Array.from(selectedIds);
    try {
      await fetch("/api/admin/tickets/bulk", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketIds, action, value }),
      });
    } catch {}
  }

  async function handleStatusChange(ticketId: string, newStatus: TicketStatus) {
    try {
      await fetch(`/api/admin/tickets/${ticketId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {}
  }

  async function handlePriorityChange(ticketId: string, newPriority: TicketPriority) {
    try {
      await fetch(`/api/admin/tickets/${ticketId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: newPriority }),
      });
    } catch {}
  }

  async function handleDueDateChange(ticketId: string, newDate: string | null) {
    const ticket = tickets.find((t) => t.id === ticketId);
    const oldDate = ticket?.dueDate;

    try {
      await fetch(`/api/admin/tickets/${ticketId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueDate: newDate }),
      });

      // Offer cascade if this is a project ticket with an old date being changed
      if (projectId && oldDate && newDate && oldDate !== newDate && ticket) {
        setCascadeInfo({
          ticketId,
          ticketTitle: ticket.title,
          field: "dueDate",
          oldDate,
          newDate,
        });
      }
    } catch {}
  }

  async function handleDueTimeChange(ticketId: string, newTime: string | null) {
    try {
      await fetch(`/api/admin/tickets/${ticketId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueTime: newTime }),
      });
    } catch {}
  }

  // Drag and drop
  function handleDragStart(ticketId: string, groupKey: string) {
    setDragId(ticketId);
    dragGroupRef.current = groupKey;
  }

  function handleDragOver(e: React.DragEvent, ticketId: string, groupKey: string) {
    e.preventDefault();
    setDragOverId(ticketId);
    dragOverGroupRef.current = groupKey;
  }

  function handleGroupDragOver(e: React.DragEvent, groupKey: string) {
    e.preventDefault();
    dragOverGroupRef.current = groupKey;
    setDragOverId(null);
  }

  async function handleDrop(targetId: string | null, groupKey: string) {
    if (!dragId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }

    const sourceGroupKey = dragGroupRef.current;
    const isCrossGroup = sourceGroupKey !== groupKey;

    if (isCrossGroup) {
      const draggedTicket = tickets.find((t) => t.id === dragId);
      if (!draggedTicket) { setDragId(null); setDragOverId(null); return; }

      const updates: Record<string, unknown> = {};

      if (groupBy === "status") {
        updates.status = groupKey;
      } else if (groupBy === "priority") {
        updates.priority = groupKey;
      } else if (groupBy === "group") {
        updates.groupId = groupKey === "ungrouped" ? null : groupKey;
      }

      setDragId(null);
      setDragOverId(null);

      try {
        await fetch(`/api/admin/tickets/${dragId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
      } catch {}
      return;
    }

    // Same-group drop: reorder
    if (dragId === targetId || !targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }

    const grouped = groupTickets(tickets, groupBy, projectGroups);
    const group = grouped.find((g) => g.key === groupKey);
    if (!group) return;

    const fromIdx = group.tickets.findIndex((t) => t.id === dragId);
    const toIdx = group.tickets.findIndex((t) => t.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const reordered = [...group.tickets];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    const items = reordered.map((t, i) => ({ id: t.id, sortOrder: (i + 1) * 100 }));

    setDragId(null);
    setDragOverId(null);

    try {
      await fetch("/api/admin/tickets/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
    } catch {}
  }

  function isOverdue(dueDate: string | null): boolean {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date(new Date().toISOString().split("T")[0]);
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr + "T00:00:00");
    return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
  }

  const groups = groupTickets(tickets, groupBy, projectGroups);

  // Flat list of visible ticket IDs for J/K navigation
  const flatTicketIds = useMemo(() => {
    return groups.flatMap((g) =>
      collapsedGroups.has(g.key) ? [] : g.tickets.map((t) => t.id)
    );
  }, [groups, collapsedGroups]);

  // Keyboard shortcuts registration
  const { registerShortcut, unregisterShortcut, openCommandPalette } = useKeyboardShortcuts();

  // Store callbacks in refs so shortcut handlers always see latest state
  const flatTicketIdsRef = useRef(flatTicketIds);
  flatTicketIdsRef.current = flatTicketIds;
  const focusedTicketIdRef = useRef(focusedTicketId);
  focusedTicketIdRef.current = focusedTicketId;

  useEffect(() => {
    registerShortcut("j", () => {
      const ids = flatTicketIdsRef.current;
      if (ids.length === 0) return;
      const currentIdx = focusedTicketIdRef.current !== null ? ids.indexOf(focusedTicketIdRef.current) : -1;
      const nextIdx = currentIdx < ids.length - 1 ? currentIdx + 1 : 0;
      setFocusedTicketId(ids[nextIdx]);
    });

    registerShortcut("k", () => {
      const ids = flatTicketIdsRef.current;
      if (ids.length === 0) return;
      const currentIdx = focusedTicketIdRef.current !== null ? ids.indexOf(focusedTicketIdRef.current) : 0;
      const prevIdx = currentIdx > 0 ? currentIdx - 1 : ids.length - 1;
      setFocusedTicketId(ids[prevIdx]);
    });

    registerShortcut("enter", () => {
      if (focusedTicketIdRef.current !== null) {
        openDetailModal(focusedTicketIdRef.current);
      }
    });

    registerShortcut("n", () => {
      setShowCreateModal(true);
    });

    registerShortcut("/", () => {
      openCommandPalette();
    });

    return () => {
      unregisterShortcut("j");
      unregisterShortcut("k");
      unregisterShortcut("enter");
      unregisterShortcut("n");
      unregisterShortcut("/");
    };
  }, [registerShortcut, unregisterShortcut, openCommandPalette]);

  // Scroll focused ticket into view
  useEffect(() => {
    if (focusedTicketId === null) return;
    const el = document.querySelector(`[data-ticket-id="${focusedTicketId}"]`);
    if (el) (el as HTMLElement).scrollIntoView({ block: "nearest" });
  }, [focusedTicketId]);

  // Close create menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (createMenuRef.current && !createMenuRef.current.contains(e.target as Node)) {
        setShowCreateMenu(false);
      }
    }
    if (showCreateMenu) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showCreateMenu]);

  // Listen for command palette "new ticket" action
  useEffect(() => {
    function handleNewTicket() {
      setShowCreateModal(true);
    }
    window.addEventListener("command-palette:new-ticket", handleNewTicket);
    return () => window.removeEventListener("command-palette:new-ticket", handleNewTicket);
  }, []);

  if (isLoading) {
    return (
      <div className="text-center py-12 text-[var(--muted)] text-sm">
        Loading tickets...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* View tabs + Filters + New Ticket button */}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 overflow-hidden flex items-center gap-1">
          <SavedViewsTabs
            activeViewId={activeViewId}
            onViewSelect={handleViewSelect}
            currentFilters={{ ...filters, groupBy }}
            hasUnsavedChanges={hasUnsavedChanges}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onReset={() => {
              if (savedViewFiltersRef.current) {
                const saved = JSON.parse(savedViewFiltersRef.current) as Filters;
                setFilters(saved);
                if (saved.groupBy) setGroupBy(saved.groupBy);
                else setGroupBy("status");
                setHasUnsavedChanges(false);
              }
            }}
            onChangesSaved={() => {
              savedViewFiltersRef.current = JSON.stringify({ ...filters, groupBy });
              setHasUnsavedChanges(false);
            }}
          />
          <div className="relative">
            <TicketFilters
              filters={filters}
              onFiltersChange={handleFiltersChange}
            />
          </div>
        </div>
        <div className="relative shrink-0" ref={createMenuRef}>
          <button
            onClick={() => {
              if (!projectId) {
                // No project context — directly create a task (no meeting option)
                setCreateAsMeeting(false);
                setShowCreateModal(true);
              } else {
                setShowCreateMenu(!showCreateMenu);
              }
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium text-white bg-[var(--accent)] hover:opacity-90 rounded-lg transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New
            {projectId && (
              <svg className="w-3 h-3 ml-0.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            )}
          </button>
          {showCreateMenu && (
            <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-[var(--border)] rounded-lg shadow-lg z-50 py-1">
              <button
                onClick={() => { setCreateAsMeeting(false); setShowCreateMenu(false); setShowCreateModal(true); }}
                className="w-full text-left px-3 py-2 text-sm text-[var(--foreground)] hover:bg-gray-50 transition flex items-center gap-2"
              >
                <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0 1 18 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3 1.5 1.5 3-3.75" />
                </svg>
                Task
              </button>
              {projectId && (
                <button
                  onClick={() => { setCreateAsMeeting(true); setShowCreateMenu(false); setShowCreateModal(true); }}
                  className="w-full text-left px-3 py-2 text-sm text-[var(--foreground)] hover:bg-gray-50 transition flex items-center gap-2"
                >
                  <svg className="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                  Meeting
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Ticket Groups */}
      {tickets.length === 0 ? (
        <div className="text-center py-16">
          <svg
            className="w-12 h-12 mx-auto text-[var(--muted)] mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z"
            />
          </svg>
          <p className="text-[var(--muted)] text-sm">No tickets found</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[var(--accent)] hover:opacity-90 rounded-lg transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create your first ticket
          </button>
        </div>
      ) : viewMode === "kanban" ? (
        <KanbanBoard
          groups={groups}
          groupBy={groupBy}
          projectId={projectId}
          teamMembers={teamMembers}
          projectGroups={projectGroups}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onGroupDragOver={handleGroupDragOver}
          onDrop={handleDrop}
          onDragEnd={() => { setDragId(null); setDragOverId(null); }}
          dragId={dragId}
          dragOverId={dragOverId}
          onTicketClick={openDetailModal}
          onTicketCreated={() => {}}
          isPersonal={isPersonal}
        />
      ) : (
        <div className="space-y-5">
          {groups.map((group) => {
            if (group.tickets.length === 0 && groupBy !== "status" && groupBy !== "group") return null;
            const isEmpty = group.tickets.length === 0;
            const isCollapsed = isEmpty || collapsedGroups.has(group.key);
            const allSelected =
              group.tickets.length > 0 &&
              group.tickets.every((t) => selectedIds.has(t.id));

            return (
              <div key={group.key}>
                {/* Group header */}
                <div
                  onDragOver={(e) => handleGroupDragOver(e, group.key)}
                  onDrop={() => handleDrop(null, group.key)}
                  className={`flex items-center gap-3 py-2 mb-1 text-left w-full group transition ${
                    dragId && dragOverGroupRef.current === group.key && dragGroupRef.current !== group.key
                      ? "bg-blue-50 rounded-lg"
                      : ""
                  }`}
                >
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className="p-0.5 rounded hover:bg-gray-100 transition shrink-0"
                  >
                    <svg
                      className={`w-3.5 h-3.5 text-[var(--muted)] transition-transform ${
                        isCollapsed ? "" : "rotate-90"
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  {/* Dynamic group badge based on groupBy */}
                  {groupBy === "status" ? (
                    <TicketStatusBadge status={group.key as TicketStatus} size="lg" />
                  ) : groupBy === "priority" ? (
                    <span className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-semibold ${
                      group.key === "urgent" ? "bg-red-100 text-red-700" :
                      group.key === "high" ? "bg-orange-100 text-orange-700" :
                      group.key === "normal" ? "bg-blue-100 text-blue-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 256 256">
                        <path d="M239.22,59.44l-45.63,95.82a3.54,3.54,0,0,1-.16.34l-34.21,71.84a8,8,0,1,1-14.44-6.88L173.62,160H40a8,8,0,0,1-5.66-13.66L76.69,104,34.34,61.66A8,8,0,0,1,40,48H232a8,8,0,0,1,7.22,11.44Z" />
                      </svg>
                      {getPriorityLabel(group.key as TicketPriority)}
                    </span>
                  ) : groupBy === "assignee" ? (
                    <span className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full text-sm font-semibold bg-gray-100 text-[var(--foreground)]">
                      {(() => {
                        const member = teamMembers.find((m) => m.name === group.key);
                        if (member) {
                          return (
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 overflow-hidden"
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
                          );
                        }
                        return (
                          <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                            ?
                          </div>
                        );
                      })()}
                      {group.label}
                    </span>
                  ) : groupBy === "group" ? (
                    <span className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-semibold ${group.colorClass}`}>
                      {(() => {
                        const pg = projectGroups.find((g) => String(g.id) === group.key);
                        if (pg?.color) {
                          return (
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: pg.color }}
                            />
                          );
                        }
                        return null;
                      })()}
                      {group.label}
                    </span>
                  ) : (
                    /* client grouping */
                    <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-semibold bg-gray-100 text-[var(--foreground)]">
                      {group.label}
                    </span>
                  )}
                  <span className="text-sm text-[var(--muted)] font-medium">
                    {group.tickets.length}
                  </span>
                </div>

                {/* Ticket rows */}
                {!isCollapsed && (group.tickets.length > 0 || groupBy === "status" || groupBy === "group") && (
                  <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
                    {/* Desktop table */}
                    <div className="overflow-x-auto hidden md:block">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[var(--border)]">
                            <th className="w-8 px-2 py-2.5">
                              <input
                                type="checkbox"
                                checked={allSelected}
                                onChange={() => toggleSelectAll(group.tickets)}
                                className="rounded"
                              />
                            </th>
                            <th className="w-6 px-1 py-2.5" />
                            {[
                              { key: "title", label: "Name", width: "" },
                              { key: null, label: "Comments", width: "w-20" },
                              ...(!projectId ? [{ key: "client", label: "Client", width: "w-28" }] : []),
                              { key: "status", label: "Status", width: "w-32" },
                              { key: null, label: "Time tracked", width: "w-28" },
                              { key: null, label: "Assignee", width: "w-20" },
                              { key: "dueDate", label: "Due date", width: "w-24" },
                              { key: "priority", label: "Priority", width: "w-24" },
                              ...(!projectId ? [{ key: null, label: "Created by", width: "whitespace-nowrap" }] : []),
                            ].map((col) => (
                              <th
                                key={col.label}
                                className={`px-3 py-2.5 text-left font-medium text-[var(--muted)] text-xs ${col.width} ${col.key ? "cursor-pointer select-none group/sort" : ""}`}
                                onClick={col.key ? () => handleSort(col.key!) : undefined}
                              >
                                <span className="inline-flex items-center gap-1">
                                  {col.label}
                                  {col.key && sortField === col.key ? (
                                    <svg className="w-3 h-3 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                                      {sortDir === "asc" ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                                      ) : (
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                      )}
                                    </svg>
                                  ) : col.key ? (
                                    <svg className="w-3 h-3 opacity-0 group-hover/sort:opacity-40 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
                                    </svg>
                                  ) : null}
                                </span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sortTickets(group.tickets).map((ticket) => (
                            <React.Fragment key={ticket.id}>
                            <tr
                              data-ticket-id={ticket.id}
                              draggable
                              onDragStart={() => handleDragStart(ticket.id, group.key)}
                              onDragOver={(e) => handleDragOver(e, ticket.id, group.key)}
                              onDrop={() => handleDrop(ticket.id, group.key)}
                              onDragEnd={() => {
                                setDragId(null);
                                setDragOverId(null);
                              }}
                              onClick={() => openDetailModal(ticket.id)}
                              className={`border-b border-[var(--border)] last:border-b-0 cursor-pointer transition ${
                                ticket.isMeeting
                                  ? "bg-violet-50/60 hover:bg-violet-50"
                                  : "hover:bg-gray-50/50"
                              } ${
                                dragOverId === ticket.id && dragId !== ticket.id
                                  ? "bg-blue-50 border-t-2 border-t-blue-300"
                                  : ""
                              } ${dragId === ticket.id ? "opacity-40" : ""} ${
                                selectedIds.has(ticket.id) ? "bg-blue-50/40" : ""
                              } ${focusedTicketId === ticket.id ? "ring-2 ring-[var(--accent)] ring-inset" : ""}`}
                            >
                              {/* Checkbox + expand arrow */}
                              <td className="px-2 py-3">
                                <div className="flex items-center gap-1">
                                  {(ticket.subTicketCount ?? 0) > 0 ? (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSubTickets(ticket.id);
                                      }}
                                      className="p-0.5 text-[var(--muted)] hover:text-[var(--foreground)] transition"
                                    >
                                      <svg
                                        className={`w-3 h-3 transition-transform ${expandedTickets.has(ticket.id) ? "rotate-90" : ""}`}
                                        fill="currentColor"
                                        viewBox="0 0 20 20"
                                      >
                                        <path d="M6.3 2.84A1.5 1.5 0 0 1 8.21 2.1l7.5 5.25a1.5 1.5 0 0 1 0 2.46l-7.5 5.25A1.5 1.5 0 0 1 6 13.86V3.28a1.5 1.5 0 0 1 .3-.44Z" />
                                      </svg>
                                    </button>
                                  ) : (
                                    <span className="w-4" />
                                  )}
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.has(ticket.id)}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      toggleSelect(ticket.id);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="rounded"
                                  />
                                </div>
                              </td>
                              {/* Drag handle */}
                              <td className="px-1 py-3 cursor-grab active:cursor-grabbing">
                                <svg
                                  className="w-4 h-4 text-gray-300 hover:text-gray-500 transition"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
                                </svg>
                              </td>
                              {/* Name with status dot / meeting icon + subtask indicator */}
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-2.5">
                                  {ticket.isMeeting ? (
                                    <svg className="w-4 h-4 text-violet-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                                    </svg>
                                  ) : (
                                    <StatusDot status={ticket.status} size={10} />
                                  )}
                                  <span className={`font-medium ${ticket.isMeeting ? "text-violet-900" : "text-[var(--foreground)]"}`}>
                                    {ticket.title}
                                  </span>
                                  {ticket.isMeeting && (ticket.dueDate || ticket.dueTime) && (
                                    <span className="text-xs text-violet-400 font-normal shrink-0 ml-1" onClick={(e) => e.stopPropagation()}>
                                      |{" "}
                                      <DatePicker
                                        value={ticket.dueDate}
                                        onChange={(d) => handleDueDateChange(ticket.id, d)}
                                        placeholder="Date"
                                        displayFormat="full"
                                        className="inline text-xs text-violet-500 hover:text-violet-700 transition cursor-pointer"
                                      />
                                      {" "}
                                      <TimePicker
                                        value={ticket.dueTime || null}
                                        onChange={(t) => handleDueTimeChange(ticket.id, t)}
                                        className="text-xs text-violet-500"
                                      />
                                    </span>
                                  )}
                                  {(ticket.subTicketCount ?? 0) > 0 && (
                                    <span className="flex items-center gap-0.5 text-[var(--muted)] text-xs shrink-0 ml-1">
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
                                      </svg>
                                      {ticket.subTicketCount}
                                    </span>
                                  )}
                                </div>
                              </td>
                              {ticket.isMeeting ? (
                                /* Meeting row: single cell spanning all remaining columns */
                                <td className="px-3 py-3" colSpan={999} onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center gap-4">
                                    {/* Done toggle */}
                                    <button
                                      onClick={() => handleStatusChange(ticket.id, ticket.status === "closed" ? "needs_attention" : "closed")}
                                      className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium rounded-full transition ${
                                        ticket.status === "closed"
                                          ? "bg-green-100 text-green-700"
                                          : "bg-gray-100 text-[var(--muted)] hover:bg-violet-50 hover:text-violet-600"
                                      }`}
                                    >
                                      {ticket.status === "closed" ? (
                                        <>
                                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                          </svg>
                                          Done
                                        </>
                                      ) : (
                                        <>
                                          <div className="w-3 h-3 rounded-full border-2 border-current" />
                                          Mark Done
                                        </>
                                      )}
                                    </button>
                                    <span className="text-[10px] font-medium text-violet-400 uppercase tracking-wider shrink-0">Attending</span>
                                    <AssigneeDropdown
                                      ticketId={ticket.id}
                                      assignees={ticket.assignees || []}
                                      teamMembers={teamMembers}
                                      onToggle={handleAssigneeToggle}
                                    />
                                  </div>
                                </td>
                              ) : (
                              <>
                              {/* Comments */}
                              <td className="px-3 py-3">
                                <div className="relative flex items-center gap-1.5 text-[var(--muted)] w-fit">
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 256 256">
                                    <path d="M216,48H40A16,16,0,0,0,24,64V224a15.84,15.84,0,0,0,9.25,14.5A16.05,16.05,0,0,0,40,240a15.89,15.89,0,0,0,10.25-3.78l.09-.07L83,208H216a16,16,0,0,0,16-16V64A16,16,0,0,0,216,48ZM40,224h0ZM216,192H80a8,8,0,0,0-5.23,1.95L40,224V64H216Z" />
                                  </svg>
                                  {(ticket.commentCount ?? 0) > 0 && (
                                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 flex items-center justify-center px-1 text-[9px] font-bold text-white bg-[var(--foreground)] rounded-full">
                                      {ticket.commentCount}
                                    </span>
                                  )}
                                </div>
                              </td>
                              {/* Client */}
                              {!projectId && (
                              <td className="px-3 py-3 text-xs text-[var(--muted)]">
                                {ticket.clientName || "—"}
                              </td>
                              )}
                              {/* Status dropdown */}
                              <td className="px-3 py-3">
                                <StatusDropdown
                                  status={ticket.status}
                                  onChange={(s) => handleStatusChange(ticket.id, s)}
                                />
                              </td>
                              {/* Time tracked */}
                              <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                                <TimeTracker
                                  ticketId={ticket.id}
                                  onTimerChange={() => {
                                    window.dispatchEvent(new CustomEvent("timerChange"));
                                  }}
                                />
                              </td>
                              {/* Assignees */}
                              <td className="px-3 py-3">
                                <AssigneeDropdown
                                  ticketId={ticket.id}
                                  assignees={ticket.assignees || []}
                                  teamMembers={teamMembers}
                                  onToggle={handleAssigneeToggle}
                                />
                              </td>
                              {/* Due Date */}
                              <td className="px-0 py-0">
                                <DatePicker
                                  value={ticket.dueDate}
                                  onChange={(d) => handleDueDateChange(ticket.id, d)}
                                  placeholder="—"
                                  displayFormat="short"
                                  className="w-full h-full px-3 py-3 block"
                                />
                              </td>
                              {/* Priority */}
                              <td className="px-3 py-3">
                                <PriorityDropdown
                                  priority={ticket.priority}
                                  onChange={(p) => handlePriorityChange(ticket.id, p)}
                                />
                              </td>
                              {/* Created by */}
                              {!projectId && (
                              <td className="px-3 py-3">
                                {(() => {
                                  const creator = ticket.createdById ? teamMembers.find((m) => m.id === ticket.createdById) : null;
                                  if (!creator && !ticket.createdByName) return <span className="text-xs text-[var(--muted)]">—</span>;
                                  const name = creator?.name || ticket.createdByName || "";
                                  const pic = creator?.profilePicUrl;
                                  const color = creator?.color || "#6b7280";
                                  return pic ? (
                                    <img
                                      src={pic}
                                      alt={name}
                                      title={name}
                                      className="w-6 h-6 rounded-full object-cover shrink-0"
                                    />
                                  ) : (
                                    <div
                                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                                      style={{ backgroundColor: color }}
                                      title={name}
                                    >
                                      {name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                                    </div>
                                  );
                                })()}
                              </td>
                              )}
                              </>
                              )}
                            </tr>
                            {/* Subtask rows (real-time via Convex subscription) */}
                            {expandedTickets.has(ticket.id) && (
                              <SubTicketRows
                                parentTicketId={ticket.id}
                                selectedIds={selectedIds}
                                teamMembers={teamMembers}
                                projectId={projectId}
                                onToggleSelect={toggleSelect}
                                onOpenDetail={openDetailModal}
                                onStatusChange={handleStatusChange}
                                onAssigneeToggle={handleAssigneeToggle}
                                onDueDateChange={handleDueDateChange}
                                onPriorityChange={handlePriorityChange}
                              />
                            )}
                            </React.Fragment>
                          ))}
                          {/* Quick-add row inside table (status grouping only) */}
                          {groupBy === "status" && (
                            <TicketQuickAdd
                              status={group.key as TicketStatus}
                              onCreated={() => {}}
                              projectId={projectId}
                              isPersonal={isPersonal}
                            />
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="md:hidden divide-y divide-[var(--border)]">
                      {sortTickets(group.tickets).map((ticket) => (
                        <div
                          key={ticket.id}
                          onClick={() => openDetailModal(ticket.id)}
                          className={`p-4 cursor-pointer ${
                            selectedIds.has(ticket.id) ? "bg-blue-50/40" : ""
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(ticket.id)}
                              onChange={(e) => {
                                e.stopPropagation();
                                toggleSelect(ticket.id);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded mt-1"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1.5">
                                <StatusDot status={ticket.status} />
                                <TicketPriorityBadge priority={ticket.priority} />
                              </div>
                              <p className="font-medium text-sm text-[var(--foreground)] mb-2">
                                {ticket.title}
                              </p>
                              <div className="flex flex-wrap items-center gap-3 text-xs">
                                <StatusDropdown
                                  status={ticket.status}
                                  onChange={(s) => handleStatusChange(ticket.id, s)}
                                />
                                {ticket.clientName && (
                                  <span className="text-[var(--muted)]">
                                    {ticket.clientName}
                                  </span>
                                )}
                                {ticket.dueDate && (
                                  <span
                                    className={
                                      isOverdue(ticket.dueDate) && isOverdueEligible(ticket.status)
                                        ? "text-red-600 font-semibold"
                                        : "text-[var(--muted)]"
                                    }
                                  >
                                    {formatDate(ticket.dueDate)}
                                  </span>
                                )}
                                <TicketAssigneeAvatars
                                  assignees={ticket.assignees || []}
                                  max={4}
                                  size="sm"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {/* Mobile quick-add */}
                      {groupBy === "status" && (
                        <TicketQuickAddMobile
                          status={group.key as TicketStatus}
                          onCreated={() => {}}
                          projectId={projectId}
                          isPersonal={isPersonal}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Bulk Actions */}
      <TicketBulkActions
        selectedCount={selectedIds.size}
        onBulkAction={handleBulkAction}
        onClear={() => setSelectedIds(new Set())}
        onDelete={async () => {
          const ids = Array.from(selectedIds);
          try {
            await Promise.all(
              ids.map((id) =>
                fetch(`/api/admin/tickets/${id}`, { method: "DELETE" })
              )
            );
            setSelectedIds(new Set());
          } catch {}
        }}
      />

      {/* Detail Modal */}
      {detailTicketId !== null && (
        <TicketDetailModal
          ticketId={detailTicketId}
          teamMembers={teamMembers}
          onClose={closeDetailModal}
          onTicketUpdated={() => {
            // Convex subscription handles real-time updates automatically
          }}
        />
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <TicketCreateModal
          teamMembers={teamMembers}
          defaultProjectId={projectId}
          defaultIsPersonal={isPersonal}
          defaultIsMeeting={createAsMeeting}
          onClose={() => { setShowCreateModal(false); setCreateAsMeeting(false); }}
          onCreated={() => {
            setShowCreateModal(false);
            setCreateAsMeeting(false);
          }}
        />
      )}

      {/* Date cascade confirmation */}
      {cascadeInfo && projectId && (
        <DateCascadeConfirm
          projectId={projectId}
          ticketId={cascadeInfo.ticketId}
          ticketTitle={cascadeInfo.ticketTitle}
          field={cascadeInfo.field}
          oldDate={cascadeInfo.oldDate}
          newDate={cascadeInfo.newDate}
          onClose={() => setCascadeInfo(null)}
          onApplied={() => {
            setCascadeInfo(null);
          }}
        />
      )}
    </div>
  );
}
