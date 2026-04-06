"use client";

import { Ticket } from "@/types";
import { friendlyDate } from "@/lib/date-format";

const ROW_HEIGHT = 40;
const BAR_HEIGHT = 24;
const BAR_Y_OFFSET = (ROW_HEIGHT - BAR_HEIGHT) / 2;

interface GanttTaskBarProps {
  ticket: Ticket;
  left: number;
  width: number;
  top: number;
  color: string;
  onDragStart?: (ticketId: string, startX: number) => void;
  onClick?: (ticketId: string) => void;
  isDragging?: boolean;
}

export default function GanttTaskBar({ ticket, left, width, top, color, onDragStart, onClick, isDragging = false }: GanttTaskBarProps) {
  const isClosed = ticket.status === "closed";
  const barWidth = Math.max(width, 8);

  return (
    <div
      className={`absolute group select-none ${isDragging ? "cursor-grabbing z-20" : "cursor-grab"}`}
      style={{ left, top: top + BAR_Y_OFFSET, height: BAR_HEIGHT, transition: isDragging ? "none" : "left 0.15s ease" }}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        onDragStart?.(ticket.id, e.clientX);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(ticket.id);
      }}
      title={`${ticket.title}\n${ticket.startDate ? friendlyDate(ticket.startDate) : "No start"} → ${ticket.dueDate ? friendlyDate(ticket.dueDate) : "No due"}`}
    >
      {/* Bar */}
      <div
        className={`h-full rounded ${isDragging ? "shadow-lg ring-2 ring-blue-400/50" : "transition-shadow group-hover:shadow-md"} ${isClosed ? "opacity-50" : ""}`}
        style={{ width: barWidth, backgroundColor: color + "cc", borderLeft: `3px solid ${color}` }}
      />

      {/* Label — always outside to the right of the bar */}
      <span
        className="absolute top-0 flex items-center h-full text-[10px] font-medium text-[var(--foreground)] whitespace-nowrap pointer-events-none"
        style={{ left: barWidth + 6 }}
      >
        {ticket.title}
      </span>
    </div>
  );
}

export { ROW_HEIGHT, BAR_HEIGHT };
