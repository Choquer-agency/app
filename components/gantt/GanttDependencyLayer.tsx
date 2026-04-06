"use client";

import { GanttRow } from "@/hooks/useGanttData";
import { BusinessDay, dateToBusinessDayIndex } from "./ganttUtils";

const ROW_HEIGHT = 40;
const GROUP_HEADER_HEIGHT = 36;
const BAR_HEIGHT = 24;
const BAR_Y_OFFSET = (ROW_HEIGHT - BAR_HEIGHT) / 2;

interface GanttDependencyLayerProps {
  flatRows: GanttRow[];
  dependencyMap: Map<string, string[]>;
  ticketRowMap: Map<string, number>;
  businessDays: BusinessDay[];
  dayWidth: number;
  totalHeight: number;
}

export default function GanttDependencyLayer({
  flatRows,
  dependencyMap,
  ticketRowMap,
  businessDays,
  dayWidth,
  totalHeight,
}: GanttDependencyLayerProps) {
  // Build ticketId → actual Y pixel position
  const ticketYMap = new Map<string, number>();
  let yOffset = 0;
  for (const row of flatRows) {
    if (row.type === "group") {
      yOffset += GROUP_HEADER_HEIGHT;
    } else {
      ticketYMap.set(row.ticket.id, yOffset);
      yOffset += ROW_HEIGHT;
    }
  }

  // Build ticketId → bar X bounds
  const ticketXMap = new Map<string, { left: number; right: number }>();
  for (const row of flatRows) {
    if (row.type !== "ticket") continue;
    const t = row.ticket;
    const startDate = t.startDate || t.dueDate;
    const endDate = t.dueDate || t.startDate;
    if (!startDate || !endDate) continue;
    const startIdx = dateToBusinessDayIndex(startDate, businessDays);
    const endIdx = dateToBusinessDayIndex(endDate, businessDays);
    const duration = Math.max(1, endIdx - startIdx + 1);
    ticketXMap.set(t.id, {
      left: startIdx * dayWidth,
      right: startIdx * dayWidth + duration * dayWidth - 4,
    });
  }

  // Build reverse map: upstreamId → [downstreamIds] so we can group by upstream
  const reverseMap = new Map<string, string[]>();
  for (const [ticketId, depIds] of dependencyMap.entries()) {
    for (const depId of depIds) {
      if (!reverseMap.has(depId)) reverseMap.set(depId, []);
      reverseMap.get(depId)!.push(ticketId);
    }
  }

  const trunks: string[] = [];   // no arrowhead
  const branches: string[] = []; // with arrowhead
  // Sort upstream tickets by their right edge (earlier exits = further left trunk)
  const sortedUpstreams = [...reverseMap.entries()]
    .map(([upId, downIds]) => ({ upId, downIds, rightX: ticketXMap.get(upId)?.right ?? 0 }))
    .sort((a, b) => a.rightX - b.rightX);

  // Assign each upstream a trunk index based on chronological order
  // Earlier upstreams get lower indices = further left
  for (let i = 0; i < sortedUpstreams.length; i++) {
    const { upId: upstreamId, downIds: downstreamIds } = sortedUpstreams[i];
    const upY = ticketYMap.get(upstreamId);
    const upX = ticketXMap.get(upstreamId);
    if (upY === undefined || !upX) continue;

    const validDownstream = downstreamIds
      .map((id) => ({
        id,
        y: ticketYMap.get(id),
        x: ticketXMap.get(id),
      }))
      .filter((d) => d.y !== undefined && d.x)
      .sort((a, b) => a.y! - b.y!);

    if (validDownstream.length === 0) continue;

    const exitX = upX.right;
    const exitY = upY + BAR_Y_OFFSET + BAR_HEIGHT / 2;
    const exitRowBottom = upY + ROW_HEIGHT - 2;

    // Trunk X: always left of downstream bars, spaced by trunk index
    const minDownstreamLeft = Math.min(...validDownstream.map((d) => d.x!.left));
    const trunkX = minDownstreamLeft - 14 - i * 7;

    // Trunk Y range: from exitRowBottom to the last downstream bar's center Y
    const firstDownY = validDownstream[0].y! + BAR_Y_OFFSET + BAR_HEIGHT / 2;
    const lastDownY = validDownstream[validDownstream.length - 1].y! + BAR_Y_OFFSET + BAR_HEIGHT / 2;

    // Trunk: exit stub right → drop to row gap → left to trunk → vertical trunk (no arrow)
    trunks.push(`M ${exitX} ${exitY} H ${exitX + 3} V ${exitRowBottom} H ${trunkX} V ${lastDownY}`);

    // Branches: horizontal from trunk to each downstream bar's left edge (with arrow)
    for (const d of validDownstream) {
      const entryY = d.y! + BAR_Y_OFFSET + BAR_HEIGHT / 2;
      const entryX = d.x!.left;
      branches.push(`M ${trunkX} ${entryY} H ${entryX}`);
    }
  }

  if (trunks.length === 0 && branches.length === 0) return null;

  return (
    <svg
      className="absolute top-0 left-0 pointer-events-none"
      style={{ width: "100%", height: totalHeight, overflow: "visible" }}
    >
      <defs>
        <marker
          id="gantt-arrow"
          markerWidth="6"
          markerHeight="4"
          refX="5"
          refY="2"
          orient="auto"
        >
          <path d="M 0 0 L 6 2 L 0 4 Z" fill="#b0b8c4" />
        </marker>
      </defs>
      {/* Trunks — no arrowhead */}
      {trunks.map((d, i) => (
        <path
          key={`trunk-${i}`}
          d={d}
          stroke="#b0b8c4"
          strokeWidth={1.5}
          fill="none"
          strokeLinejoin="round"
        />
      ))}
      {/* Branches — with arrowhead */}
      {branches.map((d, i) => (
        <path
          key={`branch-${i}`}
          d={d}
          stroke="#b0b8c4"
          strokeWidth={1.5}
          fill="none"
          markerEnd="url(#gantt-arrow)"
        />
      ))}
    </svg>
  );
}
