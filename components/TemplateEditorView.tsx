"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ProjectGroup, ProjectTemplateRole, Ticket, TeamMember, TicketDependency } from "@/types";
import TicketDetailModal from "./TicketDetailModal";
import DatePicker from "./DatePicker";
import FilterDropdown from "./FilterDropdown";
import { useTeamMembers } from "@/hooks/useTeamMembers";

interface TemplateEditorViewProps {
  projectId: string | number;
}

export default function TemplateEditorView({ projectId }: TemplateEditorViewProps) {
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [roles, setRoles] = useState<ProjectTemplateRole[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const { teamMembers } = useTeamMembers();
  const [dependencies, setDependencies] = useState<Map<string, string | null>>(new Map()); // ticketId → dependsOnTicketId

  // Convex mutations
  const createTicket = useMutation(api.tickets.create);
  const reorderTickets = useMutation(api.tickets.reorder);
  const [loading, setLoading] = useState(true);

  // Group management
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState("");

  // Role management
  const [addingRole, setAddingRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editRoleName, setEditRoleName] = useState("");

  // Quick-add ticket
  const [quickAddGroupId, setQuickAddGroupId] = useState<string | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [quickAddRoleId, setQuickAddRoleId] = useState<string | null>(null);
  const [quickAddOffsetStart, setQuickAddOffsetStart] = useState("");
  const [quickAddOffsetDue, setQuickAddOffsetDue] = useState("");

  // Collapsed groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Role assignments (multi-role per ticket): ticketId → Set of roleIds
  const [ticketRoleAssignments, setTicketRoleAssignments] = useState<Map<string, Set<string>>>(new Map());

  // Detail modal
  const [detailTicketId, setDetailTicketId] = useState<string | null>(null);

  // Drag reorder tickets
  const [dragTicketId, setDragTicketId] = useState<string | null>(null);
  const [dragOverTicketId, setDragOverTicketId] = useState<string | null>(null);

  // Reference start date for displaying readable dates instead of "Day X"
  // Default to next Monday
  const [refDate, setRefDate] = useState<string>(() => {
    const d = new Date();
    const day = d.getDay();
    const daysUntilMonday = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
    d.setDate(d.getDate() + daysUntilMonday);
    return d.toISOString().split("T")[0];
  });

  function offsetToDate(offset: number | null): string {
    if (offset === null) return "";
    const d = new Date(refDate + "T12:00:00");
    d.setDate(d.getDate() + offset);
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
  }

  function dateToOffset(dateStr: string): number | null {
    if (!dateStr) return null;
    const ref = new Date(refDate + "T12:00:00");
    const target = new Date(dateStr + "T12:00:00");
    return Math.round((target.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));
  }

  const GROUP_COLORS = [
    { value: "#EF4444", label: "Red" },
    { value: "#F59E0B", label: "Amber" },
    { value: "#10B981", label: "Green" },
    { value: "#3B82F6", label: "Blue" },
    { value: "#8B5CF6", label: "Purple" },
    { value: "#EC4899", label: "Pink" },
    { value: "#6B7280", label: "Gray" },
  ];

  const fetchData = useCallback(async () => {
    try {
      const [groupsRes, rolesRes, ticketsRes, raRes] = await Promise.all([
        fetch(`/api/admin/projects/${projectId}/groups`),
        fetch(`/api/admin/projects/${projectId}/roles`),
        fetch(`/api/admin/tickets?projectId=${projectId}&archived=false`),
        fetch(`/api/admin/projects/${projectId}/role-assignments`),
      ]);

      if (groupsRes.ok) setGroups(await groupsRes.json());
      if (rolesRes.ok) setRoles(await rolesRes.json());
      let parsedTickets: Ticket[] = [];
      if (ticketsRes.ok) {
        const data = await ticketsRes.json();
        parsedTickets = Array.isArray(data) ? data : data.tickets || [];
        setTickets(parsedTickets);
      }
      if (raRes.ok) {
        const raData: { ticketId: string; templateRoleId: string }[] = await raRes.json();
        const raMap = new Map<string, Set<string>>();
        for (const ra of raData) {
          if (!raMap.has(ra.ticketId)) raMap.set(ra.ticketId, new Set());
          raMap.get(ra.ticketId)!.add(ra.templateRoleId);
        }
        setTicketRoleAssignments(raMap);
      }

      // Fetch dependencies for all tickets
      if (parsedTickets.length > 0) {
        const depMap = new Map<string, string | null>();
        await Promise.all(
          parsedTickets.map(async (t: Ticket) => {
            try {
              const dRes = await fetch(`/api/admin/tickets/${t.id}/dependencies`);
              if (dRes.ok) {
                const deps: TicketDependency[] = await dRes.json();
                if (deps.length > 0) {
                  depMap.set(t.id, deps[0].dependsOnTicketId);
                }
              }
            } catch {}
          })
        );
        setDependencies(depMap);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // === Group CRUD ===
  async function handleAddGroup(): Promise<void> {
    if (!newGroupName.trim()) return;
    try {
      await fetch(`/api/admin/projects/${projectId}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newGroupName.trim(),
          color: newGroupColor || null,
          sortOrder: groups.length,
        }),
      });
      setNewGroupName("");
      setNewGroupColor("");
      setAddingGroup(false);
      fetchData();
    } catch {}
  }

  async function handleUpdateGroup(groupId: string) {
    if (!editGroupName.trim()) return;
    try {
      await fetch(`/api/admin/projects/${projectId}/groups/${groupId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editGroupName.trim() }),
      });
      setEditingGroupId(null);
      fetchData();
    } catch {}
  }

  async function handleDeleteGroup(groupId: string) {
    if (!confirm("Delete this group? Tickets in this group will become ungrouped.")) return;
    try {
      await fetch(`/api/admin/projects/${projectId}/groups/${groupId}`, {
        method: "DELETE",
      });
      fetchData();
    } catch {}
  }

  // === Role CRUD ===
  async function handleAddRole(): Promise<void> {
    if (!newRoleName.trim()) return;
    try {
      await fetch(`/api/admin/projects/${projectId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newRoleName.trim(),
          sortOrder: roles.length,
        }),
      });
      setNewRoleName("");
      setAddingRole(false);
      fetchData();
    } catch {}
  }

  async function handleUpdateRole(roleId: string) {
    if (!editRoleName.trim()) return;
    try {
      await fetch(`/api/admin/projects/${projectId}/roles/${roleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editRoleName.trim() }),
      });
      setEditingRoleId(null);
      fetchData();
    } catch {}
  }

  async function handleDeleteRole(roleId: string) {
    if (!confirm("Delete this role? Tickets with this role will become unassigned.")) return;
    try {
      await fetch(`/api/admin/projects/${projectId}/roles/${roleId}`, {
        method: "DELETE",
      });
      fetchData();
    } catch {}
  }

  // === Ticket Role Update ===
  async function handleTicketRoleToggle(ticketId: string, roleId: string, action: "add" | "remove") {
    try {
      await fetch(`/api/admin/tickets/${ticketId}/role-assignments`, {
        method: action === "add" ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateRoleId: roleId }),
      });
      // Optimistic update
      setTicketRoleAssignments((prev) => {
        const next = new Map(prev);
        const current = new Set(next.get(ticketId) || []);
        if (action === "add") current.add(roleId);
        else current.delete(roleId);
        if (current.size === 0) next.delete(ticketId);
        else next.set(ticketId, current);
        return next;
      });
    } catch {}
  }

  async function handleToggleAllTeam(ticketId: string, isAllTeam: boolean) {
    try {
      await fetch(`/api/admin/tickets/${ticketId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignAllRoles: isAllTeam }),
      });
      setTickets((prev) => prev.map((t) => t.id === ticketId ? { ...t, assignAllRoles: isAllTeam } : t));
    } catch {}
  }

  // === Ticket Group Update ===
  async function handleTicketGroupChange(ticketId: string, groupId: string | null) {
    try {
      await fetch(`/api/admin/tickets/${ticketId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId }),
      });
      fetchData();
    } catch {}
  }

  // === Ticket Day Offset Update (with dependency cascade) ===
  async function handleOffsetChange(ticketId: string, field: "dayOffsetStart" | "dayOffsetDue", value: string) {
    const numVal = value === "" ? null : Number(value);
    const ticket = tickets.find((t) => t.id === ticketId);
    const oldVal = ticket ? (field === "dayOffsetStart" ? ticket.dayOffsetStart : ticket.dayOffsetDue) : null;

    try {
      await fetch(`/api/admin/tickets/${ticketId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: numVal }),
      });

      // Auto-cascade: if due offset changed, shift all tickets that depend on this one
      if (field === "dayOffsetDue" && numVal !== null && oldVal !== null) {
        const delta = numVal - oldVal;
        if (delta !== 0) {
          await cascadeDependentOffsets(ticketId, delta);
        }
      }

      fetchData();
    } catch {}
  }

  // Recursively cascade offset changes to dependent tickets
  async function cascadeDependentOffsets(parentTicketId: string, delta: number) {
    // Find all tickets that depend on parentTicketId
    const dependents = tickets.filter((t) => dependencies.get(t.id) === parentTicketId);
    for (const dep of dependents) {
      const newStart = dep.dayOffsetStart != null ? dep.dayOffsetStart + delta : null;
      const newDue = dep.dayOffsetDue != null ? dep.dayOffsetDue + delta : null;
      const updates: Record<string, number | null> = {};
      if (newStart !== null) updates.dayOffsetStart = newStart;
      if (newDue !== null) updates.dayOffsetDue = newDue;
      if (Object.keys(updates).length > 0) {
        await fetch(`/api/admin/tickets/${dep.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        // Recurse: cascade to tickets that depend on this dependent
        await cascadeDependentOffsets(dep.id, delta);
      }
    }
  }

  // === Dependency Change ===
  async function handleDependencyChange(ticketId: string, dependsOnId: string | null) {
    const currentDep = dependencies.get(ticketId);

    // Remove old dependency if exists
    if (currentDep) {
      try {
        await fetch(`/api/admin/tickets/${ticketId}/dependencies`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dependsOnTicketId: currentDep }),
        });
      } catch {}
    }

    // Add new dependency
    if (dependsOnId) {
      try {
        await fetch(`/api/admin/tickets/${ticketId}/dependencies`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dependsOnTicketId: dependsOnId }),
        });
      } catch {}

      // Auto-set this ticket's start offset = parent's due offset + 1
      const parent = tickets.find((t) => t.id === dependsOnId);
      if (parent && parent.dayOffsetDue != null) {
        const ticket = tickets.find((t) => t.id === ticketId);
        const duration = (ticket?.dayOffsetDue != null && ticket?.dayOffsetStart != null)
          ? ticket.dayOffsetDue - ticket.dayOffsetStart
          : 0;
        const newStart = parent.dayOffsetDue + 1;
        const newDue = newStart + duration;
        await fetch(`/api/admin/tickets/${ticketId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dayOffsetStart: newStart, dayOffsetDue: newDue }),
        });
      }
    }

    // Update local state
    setDependencies((prev) => {
      const next = new Map(prev);
      if (dependsOnId) {
        next.set(ticketId, dependsOnId);
      } else {
        next.delete(ticketId);
      }
      return next;
    });

    fetchData();
  }

  // === Quick Add Ticket ===
  async function handleQuickAdd(groupId: string | null) {
    if (!quickAddTitle.trim()) return;
    try {
      await createTicket({
        title: quickAddTitle.trim(),
        projectId: projectId as Id<"projects">,
        groupId: groupId ? (groupId as Id<"projectGroups">) : undefined,
        templateRoleId: quickAddRoleId ? (quickAddRoleId as Id<"projectTemplateRoles">) : undefined,
        dayOffsetStart: quickAddOffsetStart ? Number(quickAddOffsetStart) : undefined,
        dayOffsetDue: quickAddOffsetDue ? Number(quickAddOffsetDue) : undefined,
      });
      setQuickAddTitle("");
      setQuickAddRoleId(null);
      setQuickAddOffsetStart("");
      setQuickAddOffsetDue("");
      setQuickAddGroupId(null);
      fetchData();
    } catch {}
  }

  // === Ticket Title Rename ===
  async function handleRenameTicket(ticketId: string, newTitle: string) {
    if (!newTitle.trim()) return;
    try {
      await fetch(`/api/admin/tickets/${ticketId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      fetchData();
    } catch {}
  }

  // === Toggle Meeting ===
  async function handleToggleMeeting(ticketId: string, isMeeting: boolean) {
    try {
      await fetch(`/api/admin/tickets/${ticketId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isMeeting }),
      });
      fetchData();
    } catch {}
  }

  // === Ticket Reorder ===
  async function handleTicketDrop(droppedOnId: string, groupId: string | null) {
    if (dragTicketId === null || dragTicketId === droppedOnId) {
      setDragTicketId(null);
      setDragOverTicketId(null);
      return;
    }
    const groupTickets = tickets
      .filter((t) => (t.groupId ?? null) === groupId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const oldIdx = groupTickets.findIndex((t) => t.id === dragTicketId);
    const newIdx = groupTickets.findIndex((t) => t.id === droppedOnId);
    if (oldIdx === -1 || newIdx === -1) return;

    const reordered = [...groupTickets];
    const [moved] = reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, moved);

    setDragTicketId(null);
    setDragOverTicketId(null);

    try {
      await reorderTickets({
        items: reordered.map((t, i) => ({
          id: t.id as Id<"tickets">,
          sortOrder: i,
        })),
      });
      fetchData();
    } catch {}
  }

  function toggleGroup(groupId: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  // Build subtask map: parentId → children
  const subTicketMap = new Map<string, Ticket[]>();
  for (const t of tickets) {
    if (t.parentTicketId) {
      if (!subTicketMap.has(t.parentTicketId)) subTicketMap.set(t.parentTicketId, []);
      subTicketMap.get(t.parentTicketId)!.push(t);
    }
  }
  for (const arr of subTicketMap.values()) {
    arr.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // Group top-level tickets only
  const ticketsByGroup = new Map<string | null, Ticket[]>();
  for (const t of tickets) {
    if (t.parentTicketId) continue; // skip subtasks
    const gId = t.groupId ?? null;
    if (!ticketsByGroup.has(gId)) ticketsByGroup.set(gId, []);
    ticketsByGroup.get(gId)!.push(t);
  }

  // Sort tickets within each group by sortOrder
  for (const arr of ticketsByGroup.values()) {
    arr.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const ungroupedTickets = ticketsByGroup.get(null) || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Reference date + Roles bar */}
      <div className="flex items-start gap-4">
        {/* Reference start date */}
        <div className="bg-white border border-[var(--border)] rounded-xl p-4 w-[220px] shrink-0">
          <h3 className="text-sm font-semibold mb-2">Preview from</h3>
          <p className="text-[10px] text-[var(--muted)] mb-2">Pick a start date to see schedule as real dates</p>
          <input
            type="date"
            value={refDate}
            onChange={(e) => setRefDate(e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm border border-[var(--border)] rounded-lg"
          />
        </div>

        {/* Roles */}
        <div className="flex-1 bg-white border border-[var(--border)] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Template Roles</h3>
            <button
              onClick={() => setAddingRole(true)}
              className="text-xs text-[var(--accent)] hover:underline"
            >
              + Add Role
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {roles.map((role) => (
              <div key={role.id} className="group flex items-center gap-1 px-2.5 py-1 bg-gray-100 rounded-lg text-xs">
                {editingRoleId === role.id ? (
                  <input
                    value={editRoleName}
                    onChange={(e) => setEditRoleName(e.target.value)}
                    onBlur={() => handleUpdateRole(role.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleUpdateRole(role.id);
                      if (e.key === "Escape") setEditingRoleId(null);
                    }}
                    className="w-24 px-1 py-0 text-xs bg-white border border-[var(--border)] rounded"
                    autoFocus
                  />
                ) : (
                  <>
                    <span
                      className="cursor-pointer"
                      onClick={() => { setEditingRoleId(role.id); setEditRoleName(role.name); }}
                    >
                      {role.name}
                    </span>
                    <button
                      onClick={() => handleDeleteRole(role.id)}
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition ml-0.5"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            ))}
            {addingRole && (
              <input
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                onBlur={() => { if (newRoleName.trim()) handleAddRole(); else setAddingRole(false); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddRole();
                  if (e.key === "Escape") { setAddingRole(false); setNewRoleName(""); }
                }}
                placeholder="Role name..."
                className="w-28 px-2 py-1 text-xs border border-[var(--border)] rounded-lg"
                autoFocus
              />
            )}
            {roles.length === 0 && !addingRole && (
              <p className="text-xs text-[var(--muted)]">No roles defined. Add roles like Designer, Developer, etc.</p>
            )}
          </div>
        </div>
      </div>

      {/* Grouped Ticket List */}
      <div className="space-y-4">
        {/* Render each group */}
        {groups.map((group) => {
          const groupTickets = ticketsByGroup.get(group.id) || [];
          const isCollapsed = collapsedGroups.has(group.id);

          return (
            <div key={group.id} className="bg-white border border-[var(--border)] rounded-xl overflow-hidden">
              {/* Group Header */}
              <div className="group flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                  {group.color && (
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: group.color }}
                    />
                  )}
                  {editingGroupId === group.id ? (
                    <input
                      value={editGroupName}
                      onChange={(e) => setEditGroupName(e.target.value)}
                      onBlur={() => handleUpdateGroup(group.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleUpdateGroup(group.id);
                        if (e.key === "Escape") setEditingGroupId(null);
                      }}
                      className="px-2 py-0.5 text-sm font-semibold border border-[var(--accent)] rounded bg-white"
                      autoFocus
                    />
                  ) : (
                    <span
                      className="text-sm font-semibold cursor-text hover:text-[var(--accent)] transition"
                      onClick={() => { setEditingGroupId(group.id); setEditGroupName(group.name); }}
                    >
                      {group.name}
                    </span>
                  )}
                  <span className="text-xs text-[var(--muted)]">{groupTickets.length}</span>
                </div>
                <button
                  onClick={() => handleDeleteGroup(group.id)}
                  className="p-1 text-[var(--muted)] hover:text-red-500 rounded transition opacity-0 group-hover:opacity-100"
                  title="Delete group"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </button>
              </div>

              {/* Ticket Table */}
              <div>
                <div>
                  {/* Table header */}
                  <div className="grid grid-cols-[24px_minmax(80px,2fr)_80px_minmax(95px,0.8fr)_90px_90px] gap-x-2 px-2 py-1.5 text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider border-b border-gray-100">
                    <span />
                    <span>Title</span>
                    <span>Role</span>
                    <span>Depends on</span>
                    <span>Start</span>
                    <span>Due</span>
                  </div>

                  {/* Ticket rows */}
                  {groupTickets.map((ticket) => (
                    <div key={ticket.id}>
                      <TemplateTicketRow
                        ticket={ticket}
                        roles={roles}
                        allTickets={tickets}
                        dependsOnId={dependencies.get(ticket.id) ?? null}
                        onRoleToggle={handleTicketRoleToggle}
                        onToggleAllTeam={handleToggleAllTeam}
                        assignedRoleIds={ticketRoleAssignments.get(ticket.id) || new Set()}
                        onOffsetChange={handleOffsetChange}
                        onDependencyChange={handleDependencyChange}
                        onRename={handleRenameTicket}
                        onToggleMeeting={handleToggleMeeting}
                        onOpenDetail={setDetailTicketId}
                        offsetToDate={offsetToDate}
                        dateToOffset={dateToOffset}
                        refDate={refDate}
                        isDragging={dragTicketId === ticket.id}
                        isDragOver={dragOverTicketId === ticket.id && dragTicketId !== ticket.id}
                        onDragStart={() => setDragTicketId(ticket.id)}
                        onDragOver={() => setDragOverTicketId(ticket.id)}
                        onDrop={() => handleTicketDrop(ticket.id, ticket.groupId)}
                        onDragEnd={() => { setDragTicketId(null); setDragOverTicketId(null); }}
                      />
                      {/* Subtasks */}
                      {subTicketMap.has(ticket.id) && subTicketMap.get(ticket.id)!.map((sub) => (
                        <TemplateTicketRow
                          key={sub.id}
                          ticket={sub}
                          roles={roles}
                          allTickets={tickets}
                          dependsOnId={dependencies.get(sub.id) ?? null}
                          onRoleToggle={handleTicketRoleToggle}
                          onToggleAllTeam={handleToggleAllTeam}
                          assignedRoleIds={ticketRoleAssignments.get(sub.id) || new Set()}
                          onOffsetChange={handleOffsetChange}
                          onDependencyChange={handleDependencyChange}
                          onRename={handleRenameTicket}
                          onToggleMeeting={handleToggleMeeting}
                          onOpenDetail={setDetailTicketId}
                          offsetToDate={offsetToDate}
                          dateToOffset={dateToOffset}
                          refDate={refDate}
                          isDragging={false}
                          isDragOver={false}
                          onDragStart={() => {}}
                          onDragOver={() => {}}
                          onDrop={() => {}}
                          onDragEnd={() => {}}
                          isSubTicket
                        />
                      ))}
                    </div>
                  ))}

                  {/* Quick-add row */}
                  {quickAddGroupId === group.id ? (
                    <div className="grid grid-cols-[24px_minmax(80px,2fr)_80px_minmax(95px,0.8fr)_90px_90px] gap-x-2 px-2 py-2 border-t border-gray-100">
                      <input
                        value={quickAddTitle}
                        onChange={(e) => setQuickAddTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleQuickAdd(group.id);
                          if (e.key === "Escape") { setQuickAddGroupId(null); setQuickAddTitle(""); }
                        }}
                        placeholder="Ticket title..."
                        className="px-2 py-1 text-sm border border-[var(--border)] rounded"
                        autoFocus
                      />
                      <FilterDropdown
                        label=""
                        value={quickAddRoleId ?? ""}
                        onChange={(v) => setQuickAddRoleId(v || null)}
                        options={[
                          { value: "", label: "No role" },
                          ...roles.map((r) => ({ value: String(r.id), label: r.name })),
                        ]}
                        fullWidth
                      />
                      <span />
                      <input
                        value={quickAddOffsetStart}
                        onChange={(e) => setQuickAddOffsetStart(e.target.value)}
                        placeholder="0"
                        className="px-2 py-1 text-xs border border-[var(--border)] rounded text-center"
                        type="number"
                      />
                      <input
                        value={quickAddOffsetDue}
                        onChange={(e) => setQuickAddOffsetDue(e.target.value)}
                        placeholder="0"
                        className="px-2 py-1 text-xs border border-[var(--border)] rounded text-center"
                        type="number"
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setQuickAddGroupId(group.id)}
                      className="w-full px-4 py-2 text-xs text-[var(--muted)] hover:text-[var(--accent)] hover:bg-blue-50/30 text-left transition"
                    >
                      + Add ticket
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Ungrouped tickets */}
        {ungroupedTickets.length > 0 && (
          <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--border)]">
              <span className="text-sm font-semibold text-[var(--muted)]">Ungrouped</span>
              <span className="text-xs text-[var(--muted)] ml-2">{ungroupedTickets.length}</span>
            </div>
            <div className="grid grid-cols-[minmax(80px,2fr)_80px_minmax(95px,0.8fr)_90px_90px] gap-x-2 px-4 py-1.5 text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider border-b border-gray-100">
              <span>Title</span>
              <span>Role</span>
              <span>Depends on</span>
              <span>Start</span>
              <span>Due</span>
            </div>
            {ungroupedTickets.map((ticket) => (
              <div key={ticket.id}>
                <TemplateTicketRow
                  ticket={ticket}
                  roles={roles}
                  allTickets={tickets}
                  dependsOnId={dependencies.get(ticket.id) ?? null}
                  onRoleToggle={handleTicketRoleToggle}
                        onToggleAllTeam={handleToggleAllTeam}
                        assignedRoleIds={ticketRoleAssignments.get(ticket.id) || new Set()}
                  onOffsetChange={handleOffsetChange}
                  onDependencyChange={handleDependencyChange}
                  onRename={handleRenameTicket}
                  onToggleMeeting={handleToggleMeeting}
                  onOpenDetail={setDetailTicketId}
                  offsetToDate={offsetToDate}
                  dateToOffset={dateToOffset}
                  refDate={refDate}
                  isDragging={dragTicketId === ticket.id}
                  isDragOver={dragOverTicketId === ticket.id && dragTicketId !== ticket.id}
                  onDragStart={() => setDragTicketId(ticket.id)}
                  onDragOver={() => setDragOverTicketId(ticket.id)}
                  onDrop={() => handleTicketDrop(ticket.id, ticket.groupId)}
                  onDragEnd={() => { setDragTicketId(null); setDragOverTicketId(null); }}
                />
                {subTicketMap.has(ticket.id) && subTicketMap.get(ticket.id)!.map((sub) => (
                  <TemplateTicketRow
                    key={sub.id}
                    ticket={sub}
                    roles={roles}
                    allTickets={tickets}
                    dependsOnId={dependencies.get(sub.id) ?? null}
                    onRoleToggle={handleTicketRoleToggle}
                    onToggleAllTeam={handleToggleAllTeam}
                    assignedRoleIds={ticketRoleAssignments.get(sub.id) || new Set()}
                    onOffsetChange={handleOffsetChange}
                    onDependencyChange={handleDependencyChange}
                    onRename={handleRenameTicket}
                    onToggleMeeting={handleToggleMeeting}
                    onOpenDetail={setDetailTicketId}
                    offsetToDate={offsetToDate}
                    dateToOffset={dateToOffset}
                    refDate={refDate}
                    isDragging={false}
                    isDragOver={false}
                    onDragStart={() => {}}
                    onDragOver={() => {}}
                    onDrop={() => {}}
                    onDragEnd={() => {}}
                    isSubTicket
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Add group button */}
        {addingGroup ? (
          <div className="bg-white border border-[var(--border)] rounded-xl p-4 space-y-2">
            <input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddGroup();
                if (e.key === "Escape") { setAddingGroup(false); setNewGroupName(""); }
              }}
              placeholder="Group name (e.g., Kick Off, Wireframe...)"
              className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--muted)]">Color:</span>
              {GROUP_COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setNewGroupColor(c.value)}
                  className={`w-5 h-5 rounded-full border-2 transition ${
                    newGroupColor === c.value ? "border-gray-800 scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c.value }}
                  title={c.label}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddGroup}
                disabled={!newGroupName.trim()}
                className="px-3 py-1 text-xs bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition disabled:opacity-50"
              >
                Add Group
              </button>
              <button
                onClick={() => { setAddingGroup(false); setNewGroupName(""); }}
                className="px-3 py-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingGroup(true)}
            className="w-full py-3 border-2 border-dashed border-[var(--border)] rounded-xl text-sm text-[var(--muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition"
          >
            + Add Group / Phase
          </button>
        )}
      </div>

      {/* Detail Modal */}
      {detailTicketId !== null && (
        <TicketDetailModal
          ticketId={detailTicketId}
          teamMembers={teamMembers}
          onClose={() => setDetailTicketId(null)}
          onTicketUpdated={() => fetchData()}
        />
      )}
    </div>
  );
}

// === Template Ticket Row ===

function TemplateTicketRow({
  ticket,
  roles,
  allTickets,
  dependsOnId,
  onRoleToggle,
  onToggleAllTeam,
  assignedRoleIds,
  onOffsetChange,
  onDependencyChange,
  onRename,
  onToggleMeeting,
  onOpenDetail,
  offsetToDate,
  dateToOffset,
  refDate,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isSubTicket = false,
}: {
  ticket: Ticket;
  roles: ProjectTemplateRole[];
  allTickets: Ticket[];
  dependsOnId: string | null;
  onRoleToggle: (ticketId: string, roleId: string, action: "add" | "remove") => void;
  onToggleAllTeam: (ticketId: string, isAllTeam: boolean) => void;
  assignedRoleIds: Set<string>;
  onOffsetChange: (ticketId: string, field: "dayOffsetStart" | "dayOffsetDue", value: string) => void;
  onDependencyChange: (ticketId: string, dependsOnId: string | null) => void;
  onRename: (ticketId: string, newTitle: string) => void;
  onToggleMeeting: (ticketId: string, isMeeting: boolean) => void;
  onOpenDetail: (ticketId: string) => void;
  offsetToDate: (offset: number | null) => string;
  dateToOffset: (dateStr: string) => number | null;
  refDate: string;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  isSubTicket?: boolean;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [localTitle, setLocalTitle] = useState(ticket.title);

  function offsetToIso(offset: number | null): string {
    if (offset === null) return "";
    const d = new Date(refDate + "T12:00:00");
    d.setDate(d.getDate() + offset);
    return d.toISOString().split("T")[0];
  }

  return (
    <div
      draggable={!isSubTicket}
      onDragStart={isSubTicket ? undefined : onDragStart}
      onDragOver={isSubTicket ? undefined : (e) => { e.preventDefault(); onDragOver(); }}
      onDrop={isSubTicket ? undefined : onDrop}
      onDragEnd={isSubTicket ? undefined : onDragEnd}
      className={`relative grid grid-cols-[24px_minmax(80px,2fr)_80px_minmax(95px,0.8fr)_90px_90px] gap-x-2 px-2 py-2 border-b border-gray-50 transition items-center focus-within:bg-orange-50/60 focus-within:shadow-[inset_0_0_0_1px_var(--accent)] focus-within:rounded-lg ${
        isSubTicket ? "bg-gray-50/40" : ""
      } ${isDragging ? "opacity-30" : "hover:bg-gray-50/50"}`}
      tabIndex={-1}
    >
      {/* Drop indicator line */}
      {isDragOver && (
        <div className="absolute -top-[1px] left-2 right-2 h-0.5 bg-blue-500 rounded-full z-10">
          <div className="absolute -left-1 -top-[3px] w-2 h-2 bg-blue-500 rounded-full" />
        </div>
      )}

      {/* Drag handle or subtask indent indicator */}
      {isSubTicket ? (
        <div className="flex justify-center">
          <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 4.5v6h6" />
          </svg>
        </div>
      ) : (
        <div className="cursor-grab active:cursor-grabbing flex justify-center">
          <svg className="w-4 h-4 text-gray-300 hover:text-gray-500 transition" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
          </svg>
        </div>
      )}

      {/* Title — click to open detail, double-click to rename inline */}
      <div className={`flex items-center gap-1.5 min-w-0 ${isSubTicket ? "pl-4" : ""}`}>
        {/* Meeting toggle */}
        <button
          onClick={() => onToggleMeeting(ticket.id, !ticket.isMeeting)}
          className={`shrink-0 p-0.5 rounded transition ${
            ticket.isMeeting
              ? "text-violet-500 bg-violet-100"
              : "text-gray-300 hover:text-violet-400"
          }`}
          title={ticket.isMeeting ? "Meeting — click to make task" : "Task — click to make meeting"}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
        </button>

        {editingTitle ? (
          <input
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onBlur={() => {
              if (localTitle.trim() && localTitle.trim() !== ticket.title) {
                onRename(ticket.id, localTitle);
              }
              setEditingTitle(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (localTitle.trim() && localTitle.trim() !== ticket.title) {
                  onRename(ticket.id, localTitle);
                }
                setEditingTitle(false);
              }
              if (e.key === "Escape") { setLocalTitle(ticket.title); setEditingTitle(false); }
            }}
            className="flex-1 text-sm px-1.5 py-0.5 border border-[var(--accent)] rounded bg-white min-w-0"
            autoFocus
          />
        ) : (
          <span
            className={`text-sm truncate cursor-pointer hover:text-[var(--accent)] transition ${
              ticket.isMeeting ? "text-violet-900" : "text-[var(--foreground)]"
            }`}
            onClick={() => onOpenDetail(ticket.id)}
            onDoubleClick={(e) => { e.stopPropagation(); setLocalTitle(ticket.title); setEditingTitle(true); }}
            title="Click to open, double-click to rename"
          >
            {ticket.title}
          </span>
        )}
      </div>

      {/* Role picker */}
      <TemplateRolePicker
        ticketId={ticket.id}
        roles={roles}
        assignedRoleIds={assignedRoleIds}
        isAllTeam={ticket.assignAllRoles}
        onToggle={onRoleToggle}
        onToggleAllTeam={onToggleAllTeam}
      />

      {/* Depends on */}
      <div style={{ marginRight: 10, maxWidth: "calc(100% - 25px)" }}>
        <DependencyPicker
          ticketId={ticket.id}
          dependsOnId={dependsOnId}
          allTickets={allTickets}
          onChange={onDependencyChange}
        />
      </div>

      {/* Start date */}
      <DatePicker
        value={offsetToIso(ticket.dayOffsetStart) || null}
        onChange={(date) => {
          const newOffset = dateToOffset(date || "");
          onOffsetChange(ticket.id, "dayOffsetStart", newOffset != null ? String(newOffset) : "");
        }}
        placeholder="Start"
        className="text-xs"
        clearable
      />

      {/* Due date */}
      <DatePicker
        value={offsetToIso(ticket.dayOffsetDue) || null}
        onChange={(date) => {
          const newOffset = dateToOffset(date || "");
          onOffsetChange(ticket.id, "dayOffsetDue", newOffset != null ? String(newOffset) : "");
        }}
        placeholder="Due"
        className="text-xs"
        clearable
      />
    </div>
  );
}

// === Template Role Picker — multi-select with abbreviation circles ===

function getRoleAbbrev(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("project") && lower.includes("manag")) return "PM";
  if (lower.includes("design")) return "D";
  if (lower.includes("develop")) return "Dev";
  if (lower.includes("seo") || lower.includes("strategist")) return "SEO";
  if (lower.includes("copy") || lower.includes("writer")) return "CW";
  if (lower.includes("market")) return "Mkt";
  // Fallback: first 2 letters capitalized
  return name.slice(0, 2).toUpperCase();
}

const ROLE_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
  "bg-pink-100 text-pink-700",
];

function TemplateRolePicker({
  ticketId,
  roles,
  assignedRoleIds,
  isAllTeam,
  onToggle,
  onToggleAllTeam,
}: {
  ticketId: string;
  roles: ProjectTemplateRole[];
  assignedRoleIds: Set<string>;
  isAllTeam: boolean;
  onToggle: (ticketId: string, roleId: string, action: "add" | "remove") => void;
  onToggleAllTeam: (ticketId: string, isAllTeam: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, maxHeight: 400 });

  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      if (spaceBelow >= 200) {
        setDropdownPos({ top: rect.bottom + 4, left: rect.left, maxHeight: spaceBelow });
      } else {
        setDropdownPos({ top: Math.max(8, rect.top - Math.min(spaceAbove, 400) - 4), left: rect.left, maxHeight: Math.min(spaceAbove, 400) });
      }
    }
  }, [open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const hasAssignments = isAllTeam || assignedRoleIds.size > 0;

  return (
    <div className="relative" ref={ref}>
      <div
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-0.5 cursor-pointer min-h-[24px] px-1 py-0.5 rounded transition ${
          hasAssignments ? "" : "hover:bg-gray-100"
        }`}
      >
        {isAllTeam ? (
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-500 text-white text-[9px] font-bold ring-2 ring-white">
            All
          </span>
        ) : assignedRoleIds.size > 0 ? (
          <div className="flex -space-x-1.5">
            {roles.filter((r) => assignedRoleIds.has(r.id)).map((r, i) => (
              <span
                key={r.id}
                className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[9px] font-bold ring-2 ring-white ${ROLE_COLORS[i % ROLE_COLORS.length]}`}
                title={r.name}
              >
                {getRoleAbbrev(r.name)}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-[var(--muted)]">—</span>
        )}
      </div>

      {open && ReactDOM.createPortal(
        <div ref={dropdownRef} style={{ position: "fixed", top: dropdownPos.top, left: dropdownPos.left, maxHeight: dropdownPos.maxHeight, zIndex: 9999 }} className="w-[200px] bg-white border border-[var(--border)] rounded-xl shadow-xl overflow-y-auto py-1">
          {/* All Team option */}
          <button
            onClick={() => {
              onToggleAllTeam(ticketId, !isAllTeam);
              if (!isAllTeam) setOpen(false);
            }}
            className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition flex items-center gap-2 ${
              isAllTeam ? "bg-blue-50 font-semibold text-blue-700" : "text-[var(--foreground)]"
            }`}
          >
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white text-[8px] font-bold">
              All
            </span>
            <span className="flex-1">All Team</span>
            {isAllTeam && (
              <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
              </svg>
            )}
          </button>

          <div className="border-t border-gray-100 my-1" />

          {/* Individual roles */}
          {roles.map((role, i) => {
            const isAssigned = assignedRoleIds.has(role.id);
            return (
              <button
                key={role.id}
                onClick={() => onToggle(ticketId, role.id, isAssigned ? "remove" : "add")}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition flex items-center gap-2 ${
                  isAssigned ? "font-semibold" : "text-[var(--foreground)]"
                }`}
              >
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[8px] font-bold ${
                  isAssigned ? ROLE_COLORS[i % ROLE_COLORS.length] : "bg-gray-100 text-gray-400"
                }`}>
                  {getRoleAbbrev(role.name)}
                </span>
                <span className="flex-1">{role.name}</span>
                {isAssigned && (
                  <svg className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

// === Dependency Picker — shows nearby tickets first ===

function DependencyPicker({
  ticketId,
  dependsOnId,
  allTickets,
  onChange,
}: {
  ticketId: string;
  dependsOnId: string | null;
  allTickets: Ticket[];
  onChange: (ticketId: string, dependsOnId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const currentIndex = allTickets.findIndex((t) => t.id === ticketId);
  const others = allTickets.filter((t) => t.id !== ticketId);

  // Build sections: Previous ticket, Next ticket, then all others
  const prev = currentIndex > 0 ? allTickets[currentIndex - 1] : null;
  const next = currentIndex < allTickets.length - 1 ? allTickets[currentIndex + 1] : null;
  const nearbyIds = new Set([prev?.id, next?.id].filter(Boolean));
  const rest = others.filter((t) => !nearbyIds.has(t.id));

  // Filter by search
  const filtered = search.trim()
    ? others.filter((t) => t.title.toLowerCase().includes(search.toLowerCase()))
    : null;

  const selectedTicket = dependsOnId ? allTickets.find((t) => t.id === dependsOnId) : null;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, maxHeight: 400 });

  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      if (spaceBelow >= 200) {
        setDropdownPos({ top: rect.bottom + 4, left: rect.left, maxHeight: spaceBelow });
      } else {
        setDropdownPos({ top: Math.max(8, rect.top - Math.min(spaceAbove, 400) - 4), left: rect.left, maxHeight: Math.min(spaceAbove, 400) });
      }
    }
  }, [open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className={`w-full text-left px-2 py-1 text-xs border rounded cursor-pointer truncate ${
          dependsOnId
            ? "border-blue-200 bg-blue-50/50 text-blue-700"
            : "border-transparent hover:border-[var(--border)] bg-transparent text-[var(--muted)]"
        }`}
      >
        {selectedTicket ? selectedTicket.title : "None"}
      </button>

      {open && ReactDOM.createPortal(
        <div ref={dropdownRef} style={{ position: "fixed", top: dropdownPos.top, left: dropdownPos.left, maxHeight: dropdownPos.maxHeight, zIndex: 9999 }} className="w-[320px] bg-white border border-[var(--border)] rounded-xl shadow-xl overflow-y-auto">
          {/* Search */}
          <div className="px-3 pt-3 pb-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tickets..."
              className="w-full px-2.5 py-1.5 text-xs border border-[var(--border)] rounded-lg"
              autoFocus
            />
          </div>

          <div className="max-h-[280px] overflow-y-auto">
            {/* Clear option */}
            <button
              onClick={() => { onChange(ticketId, null); setOpen(false); setSearch(""); }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition ${
                !dependsOnId ? "font-semibold text-[var(--accent)]" : "text-[var(--muted)]"
              }`}
            >
              None (no dependency)
            </button>

            {filtered ? (
              /* Search results */
              filtered.length === 0 ? (
                <p className="px-3 py-3 text-xs text-[var(--muted)] text-center">No matches</p>
              ) : (
                filtered.map((t) => (
                  <DepOption key={t.id} ticket={t} isSelected={dependsOnId === t.id} onSelect={() => { onChange(ticketId, t.id); setOpen(false); setSearch(""); }} />
                ))
              )
            ) : (
              <>
                {/* Nearby section */}
                {(prev || next) && (
                  <>
                    <div className="px-3 pt-2 pb-1">
                      <span className="text-[10px] font-semibold text-[var(--accent)] uppercase tracking-wider">Nearby</span>
                    </div>
                    {prev && (
                      <DepOption ticket={prev} label="Above" isSelected={dependsOnId === prev.id} onSelect={() => { onChange(ticketId, prev.id); setOpen(false); }} />
                    )}
                    {next && (
                      <DepOption ticket={next} label="Below" isSelected={dependsOnId === next.id} onSelect={() => { onChange(ticketId, next.id); setOpen(false); }} />
                    )}
                  </>
                )}

                {/* All others */}
                {rest.length > 0 && (
                  <>
                    <div className="px-3 pt-2 pb-1">
                      <span className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider">All tickets</span>
                    </div>
                    {rest.map((t) => (
                      <DepOption key={t.id} ticket={t} isSelected={dependsOnId === t.id} onSelect={() => { onChange(ticketId, t.id); setOpen(false); }} />
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function DepOption({ ticket, label, isSelected, onSelect }: {
  ticket: Ticket;
  label?: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition flex items-center gap-2 ${
        isSelected ? "bg-blue-50 font-semibold text-blue-700" : "text-[var(--foreground)]"
      }`}
    >
      <span className="truncate flex-1">{ticket.title}</span>
      {label && (
        <span className="text-[10px] text-[var(--muted)] shrink-0 bg-gray-100 px-1.5 py-0.5 rounded">{label}</span>
      )}
      {isSelected && (
        <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
        </svg>
      )}
    </button>
  );
}
