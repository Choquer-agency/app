"use client";

interface GanttTodayLineProps {
  left: number;
  height: number;
}

export default function GanttTodayLine({ left, height }: GanttTodayLineProps) {
  if (left < 0) return null;

  return (
    <div
      className="absolute top-0 z-10 pointer-events-none"
      style={{ left, height }}
    >
      {/* Dot at top */}
      <div className="absolute -top-1 -left-[5px] w-[10px] h-[10px] rounded-full bg-red-500" />
      {/* Vertical line */}
      <div className="absolute top-1 left-0 w-[2px] bg-red-500/70" style={{ height: height - 4 }} />
    </div>
  );
}
