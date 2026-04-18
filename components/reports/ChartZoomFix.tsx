"use client";

/**
 * Wraps Recharts charts to counteract the global `zoom: 1.1875` on <body>.
 * CSS zoom breaks Recharts tooltip coordinate calculations — this wrapper
 * applies an inverse zoom so the chart's internal coordinates match the mouse.
 */
export default function ChartZoomFix({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ zoom: 1 / 1.1875 }}>
      {children}
    </div>
  );
}
