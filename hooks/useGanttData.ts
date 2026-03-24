"use client";

import { useState, useEffect, useCallback } from "react";
import { Ticket, ProjectGroup, TicketDependency } from "@/types";

export type GanttRow =
  | { type: "group"; group: ProjectGroup; rowIndex: number }
  | { type: "ticket"; ticket: Ticket; depth: number; rowIndex: number; groupColor: string };

export interface GanttData {
  flatRows: GanttRow[];
  dependencyMap: Map<number, number[]>; // ticketId → [dependsOnTicketId, ...]
  reverseDependencyMap: Map<number, number[]>; // dependsOnTicketId → [ticketId, ...] (downstream)
  timelineBounds: { start: Date; end: Date };
  ticketRowMap: Map<number, number>; // ticketId → rowIndex
  loading: boolean;
  refetch: () => void;
  applyDateShift: (ticketIds: Set<number>, dayDelta: number) => void;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export default function useGanttData(projectId: number): GanttData {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [deps, setDeps] = useState<TicketDependency[]>([]);
  const [projectStartDate, setProjectStartDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [ticketsRes, groupsRes, depsRes, projectRes] = await Promise.all([
        fetch(`/api/admin/tickets?projectId=${projectId}&archived=false`),
        fetch(`/api/admin/projects/${projectId}/groups`),
        fetch(`/api/admin/projects/${projectId}/dependencies`),
        fetch(`/api/admin/projects/${projectId}`),
      ]);

      if (ticketsRes.ok) {
        const data = await ticketsRes.json();
        setTickets(Array.isArray(data) ? data : data.tickets || []);
      }
      if (groupsRes.ok) setGroups(await groupsRes.json());
      if (depsRes.ok) setDeps(await depsRes.json());
      if (projectRes.ok) {
        const proj = await projectRes.json();
        setProjectStartDate(proj.startDate || null);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Compute effective dates from day offsets for tickets that lack real dates
  // Use the project's startDate, or default to next Monday
  const refDate = (() => {
    if (projectStartDate) return projectStartDate;
    const d = new Date();
    const day = d.getDay();
    const daysUntilMonday = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
    d.setDate(d.getDate() + daysUntilMonday);
    return d.toISOString().split("T")[0];
  })();

  // Patch tickets: fill in startDate/dueDate from dayOffset if missing
  const effectiveTickets: Ticket[] = tickets.map((t) => {
    let startDate = t.startDate;
    let dueDate = t.dueDate;
    if (!startDate && t.dayOffsetStart != null) {
      startDate = offsetToIso(refDate, t.dayOffsetStart);
    }
    if (!dueDate && t.dayOffsetDue != null) {
      dueDate = offsetToIso(refDate, t.dayOffsetDue);
    }
    if (startDate !== t.startDate || dueDate !== t.dueDate) {
      return { ...t, startDate, dueDate };
    }
    return t;
  });

  // Build dependency maps
  const dependencyMap = new Map<number, number[]>();
  const reverseDependencyMap = new Map<number, number[]>();
  for (const d of deps) {
    if (!dependencyMap.has(d.ticketId)) dependencyMap.set(d.ticketId, []);
    dependencyMap.get(d.ticketId)!.push(d.dependsOnTicketId);
    if (!reverseDependencyMap.has(d.dependsOnTicketId)) reverseDependencyMap.set(d.dependsOnTicketId, []);
    reverseDependencyMap.get(d.dependsOnTicketId)!.push(d.ticketId);
  }

  // Build subtask map
  const subTicketMap = new Map<number, Ticket[]>();
  for (const t of effectiveTickets) {
    if (t.parentTicketId) {
      if (!subTicketMap.has(t.parentTicketId)) subTicketMap.set(t.parentTicketId, []);
      subTicketMap.get(t.parentTicketId)!.push(t);
    }
  }
  for (const arr of subTicketMap.values()) {
    arr.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // Group top-level tickets
  const sortedGroups = [...groups].sort((a, b) => a.sortOrder - b.sortOrder);
  const ticketsByGroup = new Map<number | null, Ticket[]>();
  for (const t of effectiveTickets) {
    if (t.parentTicketId) continue;
    const gId = t.groupId ?? null;
    if (!ticketsByGroup.has(gId)) ticketsByGroup.set(gId, []);
    ticketsByGroup.get(gId)!.push(t);
  }
  for (const arr of ticketsByGroup.values()) {
    arr.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // Build flat rows
  const flatRows: GanttRow[] = [];
  const ticketRowMap = new Map<number, number>();
  let rowIdx = 0;

  function addTicketRows(ticket: Ticket, depth: number, groupColor: string) {
    ticketRowMap.set(ticket.id, rowIdx);
    flatRows.push({ type: "ticket", ticket, depth, rowIndex: rowIdx, groupColor });
    rowIdx++;
    const subs = subTicketMap.get(ticket.id);
    if (subs) {
      for (const sub of subs) {
        addTicketRows(sub, depth + 1, groupColor);
      }
    }
  }

  for (const group of sortedGroups) {
    flatRows.push({ type: "group", group, rowIndex: rowIdx });
    rowIdx++;
    const groupTickets = ticketsByGroup.get(group.id) || [];
    for (const ticket of groupTickets) {
      addTicketRows(ticket, 0, group.color || "#3B82F6");
    }
  }

  // Ungrouped tickets
  const ungrouped = ticketsByGroup.get(null) || [];
  if (ungrouped.length > 0) {
    for (const ticket of ungrouped) {
      addTicketRows(ticket, 0, "#6B7280");
    }
  }

  // Compute timeline bounds
  let earliest = new Date();
  let latest = new Date();
  let hasAnyDate = false;

  for (const t of effectiveTickets) {
    if (t.startDate) {
      const d = new Date(t.startDate + "T12:00:00");
      if (!hasAnyDate || d < earliest) earliest = d;
      if (!hasAnyDate || d > latest) latest = d;
      hasAnyDate = true;
    }
    if (t.dueDate) {
      const d = new Date(t.dueDate + "T12:00:00");
      if (!hasAnyDate || d < earliest) earliest = d;
      if (!hasAnyDate || d > latest) latest = d;
      hasAnyDate = true;
    }
  }

  if (!hasAnyDate) {
    earliest = new Date();
    latest = new Date();
    latest.setDate(latest.getDate() + 30);
  }

  // Add padding: 7 days before, 14 days after
  const start = new Date(earliest);
  start.setDate(start.getDate() - 7);
  const end = new Date(latest);
  end.setDate(end.getDate() + 14);

  return {
    flatRows,
    dependencyMap,
    reverseDependencyMap,
    timelineBounds: { start, end },
    ticketRowMap,
    loading,
    refetch: fetchData,
    applyDateShift: (ticketIds: Set<number>, dayDelta: number) => {
      setTickets((prev) =>
        prev.map((t) => {
          if (!ticketIds.has(t.id)) return t;
          return {
            ...t,
            startDate: t.startDate ? shiftDateStr(t.startDate, dayDelta) : null,
            dueDate: t.dueDate ? shiftDateStr(t.dueDate, dayDelta) : null,
            dayOffsetStart: t.dayOffsetStart != null ? t.dayOffsetStart + dayDelta : null,
            dayOffsetDue: t.dayOffsetDue != null ? t.dayOffsetDue + dayDelta : null,
          };
        })
      );
    },
  };
}

export { daysBetween };

function shiftDateStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function offsetToIso(refDate: string, offset: number): string {
  const d = new Date(refDate + "T12:00:00");
  d.setDate(d.getDate() + offset);
  return d.toISOString().split("T")[0];
}
