"use client";

import { GanttRow } from "@/hooks/useGanttData";
import { TicketStatus } from "@/types";
import { getStatusDotColor } from "@/components/TicketStatusBadge";

const ROW_HEIGHT = 40;
const GROUP_HEADER_HEIGHT = 36;

interface GanttTaskListProps {
  flatRows: GanttRow[];
  onTicketClick: (ticketId: number) => void;
}

export default function GanttTaskList({ flatRows, onTicketClick }: GanttTaskListProps) {
  return (
    <div>
      {flatRows.map((row, i) => {
        if (row.type === "group") {
          return (
            <div
              key={`g-${row.group.id}`}
              className="flex items-center gap-2 px-3 border-b border-gray-100"
              style={{
                height: GROUP_HEADER_HEIGHT,
                backgroundColor: row.group.color ? row.group.color + "18" : "#f3f4f6",
              }}
            >
              {row.group.color && (
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: row.group.color }} />
              )}
              <span className="text-xs font-semibold text-[var(--foreground)] truncate">{row.group.name}</span>
            </div>
          );
        }

        const { ticket, depth } = row;
        const isClosed = ticket.status === "closed";

        return (
          <div
            key={`t-${ticket.id}`}
            className="flex items-center gap-2 px-3 border-b border-gray-50 hover:bg-blue-50/30 transition cursor-pointer"
            style={{ height: ROW_HEIGHT, paddingLeft: 12 + depth * 20 }}
            onClick={() => onTicketClick(ticket.id)}
          >
            {/* Status circle */}
            <StatusCircle status={ticket.status} />

            {/* Title */}
            <span className={`text-xs truncate ${isClosed ? "line-through text-[var(--muted)]" : "text-[var(--foreground)]"}`}>
              {ticket.title}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StatusCircle({ status }: { status: TicketStatus }) {
  if (status === "closed") {
    return (
      <div className="shrink-0 w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }

  const color = getStatusDotColor(status);
  return (
    <div
      className="shrink-0 w-4 h-4 rounded-full border-2"
      style={{ borderColor: color, borderStyle: "dashed" }}
    />
  );
}

export { ROW_HEIGHT, GROUP_HEADER_HEIGHT };
