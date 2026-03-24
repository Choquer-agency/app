"use client";

import { GanttRow } from "@/hooks/useGanttData";
import { BusinessDay, dateToBusinessDayIndex } from "./ganttUtils";
import GanttTaskBar, { ROW_HEIGHT } from "./GanttTaskBar";
import { GROUP_HEADER_HEIGHT } from "./GanttTaskList";

interface GanttTimelineProps {
  flatRows: GanttRow[];
  businessDays: BusinessDay[];
  dayWidth: number;
  onDragStart?: (ticketId: number, startX: number) => void;
  onTicketClick?: (ticketId: number) => void;
  dragDayDelta?: number;
  dragAffectedIds?: Set<number> | null;
}

export default function GanttTimeline({
  flatRows,
  businessDays,
  dayWidth,
  onDragStart,
  onTicketClick,
  dragDayDelta = 0,
  dragAffectedIds = null,
}: GanttTimelineProps) {
  const totalWidth = businessDays.length * dayWidth;

  // Calculate positions for each row
  let yOffset = 0;
  const rowPositions: { row: GanttRow; y: number }[] = [];
  for (const row of flatRows) {
    rowPositions.push({ row, y: yOffset });
    yOffset += row.type === "group" ? GROUP_HEADER_HEIGHT : ROW_HEIGHT;
  }
  const totalHeight = yOffset;

  return (
    <div className="relative" style={{ width: totalWidth, height: totalHeight }}>
      {/* Row backgrounds */}
      {rowPositions.map(({ row, y }) => {
        if (row.type === "group") {
          return (
            <div
              key={`row-g-${row.group.id}`}
              className="absolute w-full border-b border-gray-100"
              style={{
                top: y,
                height: GROUP_HEADER_HEIGHT,
                backgroundColor: row.group.color ? row.group.color + "12" : "#f9fafb",
              }}
            />
          );
        }
        return (
          <div
            key={`row-t-${row.ticket.id}`}
            className="absolute w-full border-b border-gray-50"
            style={{ top: y, height: ROW_HEIGHT }}
          />
        );
      })}

      {/* Task bars */}
      {rowPositions.map(({ row, y }) => {
        if (row.type !== "ticket") return null;
        const { ticket, groupColor } = row;
        if (!ticket.startDate && !ticket.dueDate) return null;

        const startDate = ticket.startDate || ticket.dueDate!;
        const endDate = ticket.dueDate || ticket.startDate!;

        const startIdx = dateToBusinessDayIndex(startDate, businessDays);
        const endIdx = dateToBusinessDayIndex(endDate, businessDays);
        const duration = Math.max(1, endIdx - startIdx + 1);

        // Apply visual drag offset
        const isBeingDragged = dragAffectedIds?.has(ticket.id);
        const visualOffset = isBeingDragged ? dragDayDelta * dayWidth : 0;

        return (
          <GanttTaskBar
            key={`bar-${ticket.id}`}
            ticket={ticket}
            left={startIdx * dayWidth + visualOffset}
            width={duration * dayWidth - 4}
            top={y}
            color={groupColor}
            onDragStart={onDragStart}
            onClick={onTicketClick}
            isDragging={!!isBeingDragged}
          />
        );
      })}
    </div>
  );
}
