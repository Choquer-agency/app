"use client";

import { useMemo, useCallback, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Ticket, ProjectGroup, TicketDependency } from "@/types";
import { docToTicket } from "@/lib/ticket-mappers";

export type GanttRow =
  | { type: "group"; group: ProjectGroup; rowIndex: number }
  | { type: "ticket"; ticket: Ticket; depth: number; rowIndex: number; groupColor: string };

export interface GanttData {
  flatRows: GanttRow[];
  dependencyMap: Map<string, string[]>; // ticketId → [dependsOnTicketId, ...]
  reverseDependencyMap: Map<string, string[]>; // dependsOnTicketId → [ticketId, ...] (downstream)
  timelineBounds: { start: Date; end: Date };
  ticketRowMap: Map<string, number>; // ticketId → rowIndex
  loading: boolean;
  refetch: () => void;
  applyDateShift: (ticketIds: Set<string>, dayDelta: number) => void;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export default function useGanttData(projectId: string | number): GanttData {
  const convexProjectId = String(projectId) as Id<"projects">;

  // Convex queries — reactive, auto-update
  const ticketDocs = useQuery(api.tickets.list, { projectId: convexProjectId, archived: false });
  const groupDocs = useQuery(api.projectGroups.listByProject, { projectId: convexProjectId });
  const depDocs = useQuery(api.ticketDependencies.listByProject, { projectId: convexProjectId });
  const projectDoc = useQuery(api.projects.getById, { id: convexProjectId });

  // Local override for optimistic date shifts during drag
  const [dateOverrides, setDateOverrides] = useState<Map<string, { startDate?: string | null; dueDate?: string | null; dayOffsetStart?: number | null; dayOffsetDue?: number | null }>>(new Map());

  const loading = ticketDocs === undefined || groupDocs === undefined || depDocs === undefined || projectDoc === undefined;

  // Map docs through docToTicket
  const tickets: Ticket[] = useMemo(() => {
    if (!ticketDocs) return [];
    return ticketDocs.map((doc: any) => {
      const ticket = docToTicket(doc);
      // Apply local overrides if present
      const override = dateOverrides.get(ticket.id);
      if (override) {
        return {
          ...ticket,
          startDate: override.startDate !== undefined ? override.startDate : ticket.startDate,
          dueDate: override.dueDate !== undefined ? override.dueDate : ticket.dueDate,
          dayOffsetStart: override.dayOffsetStart !== undefined ? override.dayOffsetStart : ticket.dayOffsetStart,
          dayOffsetDue: override.dayOffsetDue !== undefined ? override.dayOffsetDue : ticket.dayOffsetDue,
        };
      }
      return ticket;
    });
  }, [ticketDocs, dateOverrides]);

  // Map group docs
  const groups: ProjectGroup[] = useMemo(() => {
    if (!groupDocs) return [];
    return groupDocs.map((doc: any) => ({
      id: doc._id,
      projectId: doc.projectId,
      name: doc.name ?? "",
      color: doc.color ?? null,
      sortOrder: doc.sortOrder ?? 0,
      createdAt: doc._creationTime ? new Date(doc._creationTime).toISOString() : "",
    }));
  }, [groupDocs]);

  // Map dependency docs
  const deps: TicketDependency[] = useMemo(() => {
    if (!depDocs) return [];
    return depDocs.map((doc: any) => ({
      id: doc._id,
      ticketId: doc.ticketId,
      dependsOnTicketId: doc.dependsOnTicketId,
    }));
  }, [depDocs]);

  const projectStartDate = projectDoc?.startDate ?? null;

  // Compute effective dates from day offsets for tickets that lack real dates
  const refDate = useMemo(() => {
    if (projectStartDate) return projectStartDate;
    const d = new Date();
    const day = d.getDay();
    const daysUntilMonday = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
    d.setDate(d.getDate() + daysUntilMonday);
    return d.toISOString().split("T")[0];
  }, [projectStartDate]);

  // Patch tickets: fill in startDate/dueDate from dayOffset if missing
  const effectiveTickets: Ticket[] = useMemo(() => {
    return tickets.map((t) => {
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
  }, [tickets, refDate]);

  // Build dependency maps
  const { dependencyMap, reverseDependencyMap } = useMemo(() => {
    const depMap = new Map<string, string[]>();
    const revMap = new Map<string, string[]>();
    for (const d of deps) {
      if (!depMap.has(d.ticketId)) depMap.set(d.ticketId, []);
      depMap.get(d.ticketId)!.push(d.dependsOnTicketId);
      if (!revMap.has(d.dependsOnTicketId)) revMap.set(d.dependsOnTicketId, []);
      revMap.get(d.dependsOnTicketId)!.push(d.ticketId);
    }
    return { dependencyMap: depMap, reverseDependencyMap: revMap };
  }, [deps]);

  // Build flat rows, subtask map, timeline bounds
  const { flatRows, ticketRowMap, timelineBounds } = useMemo(() => {
    // Build subtask map
    const subTicketMap = new Map<string, Ticket[]>();
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
    const ticketsByGroup = new Map<string | null, Ticket[]>();
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
    const rows: GanttRow[] = [];
    const tRowMap = new Map<string, number>();
    let rowIdx = 0;

    function addTicketRows(ticket: Ticket, depth: number, groupColor: string) {
      tRowMap.set(ticket.id, rowIdx);
      rows.push({ type: "ticket", ticket, depth, rowIndex: rowIdx, groupColor });
      rowIdx++;
      const subs = subTicketMap.get(ticket.id);
      if (subs) {
        for (const sub of subs) {
          addTicketRows(sub, depth + 1, groupColor);
        }
      }
    }

    for (const group of sortedGroups) {
      rows.push({ type: "group", group, rowIndex: rowIdx });
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

    return { flatRows: rows, ticketRowMap: tRowMap, timelineBounds: { start, end } };
  }, [effectiveTickets, groups]);

  const applyDateShift = useCallback((ticketIds: Set<string>, dayDelta: number) => {
    setDateOverrides((prev) => {
      const next = new Map(prev);
      for (const tid of ticketIds) {
        const ticket = tickets.find((t) => t.id === tid);
        if (!ticket) continue;
        next.set(tid, {
          startDate: ticket.startDate ? shiftDateStr(ticket.startDate, dayDelta) : null,
          dueDate: ticket.dueDate ? shiftDateStr(ticket.dueDate, dayDelta) : null,
          dayOffsetStart: ticket.dayOffsetStart != null ? ticket.dayOffsetStart + dayDelta : null,
          dayOffsetDue: ticket.dayOffsetDue != null ? ticket.dayOffsetDue + dayDelta : null,
        });
      }
      return next;
    });
  }, [tickets]);

  const refetch = useCallback(() => {
    // Clear local overrides — Convex queries auto-update
    setDateOverrides(new Map());
  }, []);

  return {
    flatRows,
    dependencyMap,
    reverseDependencyMap,
    timelineBounds,
    ticketRowMap,
    loading,
    refetch,
    applyDateShift,
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
