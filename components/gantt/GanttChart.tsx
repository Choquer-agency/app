"use client";

import { useRef, useCallback, useMemo } from "react";
import { GanttRow } from "@/hooks/useGanttData";
import { buildBusinessDays, dateToBusinessDayIndex } from "./ganttUtils";
import GanttTaskList, { ROW_HEIGHT, GROUP_HEADER_HEIGHT } from "./GanttTaskList";
import GanttTimelineHeader from "./GanttTimelineHeader";
import GanttTimeline from "./GanttTimeline";
import GanttTodayLine from "./GanttTodayLine";
import GanttDependencyLayer from "./GanttDependencyLayer";

interface GanttChartProps {
  flatRows: GanttRow[];
  dependencyMap: Map<string, string[]>;
  ticketRowMap: Map<string, number>;
  timelineBounds: { start: Date; end: Date };
  dayWidth: number;
  zoom: "week" | "month";
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onTicketClick: (ticketId: string) => void;
  onDragStart: (ticketId: string, startX: number) => void;
  dragDayDelta?: number;
  dragAffectedIds?: Set<string> | null;
}

export default function GanttChart({
  flatRows,
  dependencyMap,
  ticketRowMap,
  timelineBounds,
  dayWidth,
  zoom,
  scrollContainerRef,
  onTicketClick,
  onDragStart,
  dragDayDelta = 0,
  dragAffectedIds = null,
}: GanttChartProps) {
  const leftPanelRef = useRef<HTMLDivElement>(null);

  const businessDays = useMemo(
    () => buildBusinessDays(timelineBounds.start, timelineBounds.end),
    [timelineBounds.start, timelineBounds.end]
  );

  const todayStr = new Date().toISOString().split("T")[0];
  const todayIdx = dateToBusinessDayIndex(todayStr, businessDays);
  const todayOffset = todayIdx * dayWidth;

  // Calculate total content height
  let totalHeight = 0;
  for (const row of flatRows) {
    totalHeight += row.type === "group" ? GROUP_HEADER_HEIGHT : ROW_HEIGHT;
  }

  // Sync vertical scroll
  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current && leftPanelRef.current) {
      leftPanelRef.current.scrollTop = scrollContainerRef.current.scrollTop;
    }
  }, [scrollContainerRef]);

  return (
    <div className="flex border border-[var(--border)] rounded-xl overflow-hidden bg-white" style={{ height: "calc(100vh - 300px)" }}>
      {/* Left panel — fixed task list */}
      <div
        ref={leftPanelRef}
        className="w-[280px] shrink-0 border-r border-[var(--border)] overflow-hidden"
      >
        {/* Header spacer */}
        <div className="sticky top-0 z-10 bg-white border-b border-[var(--border)]">
          <div className="flex items-center px-3 text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider" style={{ height: 52 }}>
            Name
          </div>
        </div>
        <GanttTaskList flatRows={flatRows} onTicketClick={onTicketClick} />
      </div>

      {/* Right panel — scrollable timeline */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto"
        onScroll={handleScroll}
      >
        <div style={{ width: businessDays.length * dayWidth, minWidth: "100%" }}>
          <GanttTimelineHeader
            businessDays={businessDays}
            dayWidth={dayWidth}
            zoom={zoom}
          />
          <div className="relative">
            <GanttTimeline
              flatRows={flatRows}
              businessDays={businessDays}
              dayWidth={dayWidth}
              onDragStart={onDragStart}
              onTicketClick={onTicketClick}
              dragDayDelta={dragDayDelta}
              dragAffectedIds={dragAffectedIds}
            />
            <GanttDependencyLayer
              flatRows={flatRows}
              dependencyMap={dependencyMap}
              ticketRowMap={ticketRowMap}
              businessDays={businessDays}
              dayWidth={dayWidth}
              totalHeight={totalHeight}
            />
            <GanttTodayLine left={todayOffset} height={totalHeight} />
          </div>
        </div>
      </div>
    </div>
  );
}
