"use client";

import { useState } from "react";

interface MetricTooltipProps {
  label: string;
  tooltip: string;
  className?: string;
}

export default function MetricTooltip({ label, tooltip, className = "" }: MetricTooltipProps) {
  const [show, setShow] = useState(false);

  return (
    <span
      className={`relative inline-block cursor-help ${className}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {label}
      {show && (
        <span
          className="absolute z-[99999] px-3 py-2 bg-[#1A1A1A] text-white text-[11px] leading-relaxed rounded-lg text-center font-normal normal-case tracking-normal shadow-xl pointer-events-none"
          style={{
            bottom: "calc(100% + 10px)",
            left: "50%",
            transform: "translateX(-50%)",
            width: 240,
          }}
        >
          {tooltip}
        </span>
      )}
    </span>
  );
}
