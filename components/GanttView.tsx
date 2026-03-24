"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import useGanttData from "@/hooks/useGanttData";
import { buildBusinessDays, dateToBusinessDayIndex } from "./gantt/ganttUtils";
import GanttToolbar from "./gantt/GanttToolbar";
import GanttChart from "./gantt/GanttChart";
import TicketDetailModal from "./TicketDetailModal";
import { TeamMember } from "@/types";

interface GanttViewProps {
  projectId: number;
}

export default function GanttView({ projectId }: GanttViewProps) {
  const data = useGanttData(projectId);
  const [zoom, setZoom] = useState<"week" | "month">("week");
  const [dayWidth, setDayWidth] = useState(40);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [detailTicketId, setDetailTicketId] = useState<number | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  // Drag state — all visual, no backend calls during drag
  const dragRef = useRef<{
    ticketId: number;
    startX: number;
    affectedIds: Set<number>;
  } | null>(null);
  const [dragDayDelta, setDragDayDelta] = useState(0);
  const [dragAffectedIds, setDragAffectedIds] = useState<Set<number>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fetch team members for detail modal
  useEffect(() => {
    fetch("/api/admin/team")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setTeamMembers(d.filter((m: TeamMember) => m.active)))
      .catch(() => {});
  }, []);

  const businessDays = useMemo(
    () => buildBusinessDays(data.timelineBounds.start, data.timelineBounds.end),
    [data.timelineBounds.start, data.timelineBounds.end]
  );

  const scrollToToday = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const todayStr = new Date().toISOString().split("T")[0];
    const todayIdx = dateToBusinessDayIndex(todayStr, businessDays);
    const todayOffset = todayIdx * dayWidth;
    scrollContainerRef.current.scrollTo({
      left: todayOffset - scrollContainerRef.current.clientWidth / 3,
      behavior: "smooth",
    });
  }, [businessDays, dayWidth]);

  useEffect(() => {
    if (!data.loading) {
      setTimeout(scrollToToday, 100);
    }
  }, [data.loading, scrollToToday]);

  const handleZoomChange = useCallback(
    (z: "week" | "month") => {
      setZoom(z);
      setDayWidth(z === "week" ? 40 : 12);
    },
    []
  );

  const handleAutoFit = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const containerWidth = scrollContainerRef.current.clientWidth;
    const fitted = Math.max(6, Math.min(60, containerWidth / businessDays.length));
    setDayWidth(fitted);
    scrollContainerRef.current.scrollTo({ left: 0 });
  }, [businessDays.length]);

  // Compute downstream dependents for a ticket (BFS)
  const getAffectedIds = useCallback(
    (ticketId: number): Set<number> => {
      const affected = new Set<number>();
      affected.add(ticketId);
      const queue = [ticketId];
      while (queue.length > 0) {
        const current = queue.shift()!;
        const downstream = data.reverseDependencyMap.get(current) || [];
        for (const childId of downstream) {
          if (!affected.has(childId)) {
            affected.add(childId);
            queue.push(childId);
          }
        }
      }
      return affected;
    },
    [data.reverseDependencyMap]
  );

  // Drag start — just set up refs, compute affected set once
  const handleDragStart = useCallback(
    (ticketId: number, startX: number) => {
      const affected = getAffectedIds(ticketId);
      dragRef.current = { ticketId, startX, affectedIds: affected };
      setDragAffectedIds(affected);
      setDragDayDelta(0);
      setIsDragging(true);
    },
    [getAffectedIds]
  );

  // Mouse move/up handlers — attached to document during drag
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const pixelDelta = e.clientX - dragRef.current.startX;
      const newDayDelta = Math.round(pixelDelta / dayWidth);
      setDragDayDelta(newDayDelta);
    };

    const handleMouseUp = async () => {
      const drag = dragRef.current;
      // Read the current delta from a fresh calculation
      const finalDelta = dragDayDelta;

      setIsDragging(false);
      dragRef.current = null;

      if (finalDelta === 0 || !drag) {
        setDragDayDelta(0);
        setDragAffectedIds(new Set());
        return;
      }

      // Optimistically update local state immediately (no refetch)
      data.applyDateShift(drag.affectedIds, finalDelta);
      setDragDayDelta(0);
      setDragAffectedIds(new Set());

      // Save to backend in background
      setSaving(true);
      try {
        const updates: Promise<Response>[] = [];
        for (const tid of drag.affectedIds) {
          const row = data.flatRows.find(
            (r) => r.type === "ticket" && r.ticket.id === tid
          );
          if (row && row.type === "ticket") {
            const ticket = row.ticket;
            // Dates were already shifted by applyDateShift, use the current values
            updates.push(
              fetch(`/api/admin/tickets/${tid}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  startDate: ticket.startDate,
                  dueDate: ticket.dueDate,
                }),
              })
            );
          }
        }
        await Promise.all(updates);
      } catch {
        // On error, refetch to get correct state
        data.refetch();
      } finally {
        setSaving(false);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dayWidth, dragDayDelta, data]);

  if (data.loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="space-y-0 relative">
      <GanttToolbar
        zoom={zoom}
        onZoomChange={handleZoomChange}
        onScrollToToday={scrollToToday}
        onAutoFit={handleAutoFit}
      />
      <GanttChart
        flatRows={data.flatRows}
        dependencyMap={data.dependencyMap}
        ticketRowMap={data.ticketRowMap}
        timelineBounds={data.timelineBounds}
        dayWidth={dayWidth}
        zoom={zoom}
        scrollContainerRef={scrollContainerRef}
        onTicketClick={setDetailTicketId}
        onDragStart={handleDragStart}
        dragDayDelta={isDragging ? dragDayDelta : 0}
        dragAffectedIds={isDragging ? dragAffectedIds : null}
      />

      {saving && (
        <div className="absolute top-2 right-4 flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[var(--border)] rounded-lg shadow-sm text-xs text-[var(--muted)]">
          <div className="animate-spin rounded-full h-3 w-3 border-b border-[var(--accent)]" />
          Saving...
        </div>
      )}

      {detailTicketId !== null && (
        <TicketDetailModal
          ticketId={detailTicketId}
          teamMembers={teamMembers}
          onClose={() => setDetailTicketId(null)}
          onTicketUpdated={() => data.refetch()}
        />
      )}
    </div>
  );
}
