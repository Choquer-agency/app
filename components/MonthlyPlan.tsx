"use client";

import { useState } from "react";
import { WorkLogEntry } from "@/types";

interface MonthlyPlanProps {
  entries: WorkLogEntry[];
  monthLabel: string; // e.g. "April 2026"
}

const CATEGORY_COLORS: Record<string, string> = {
  Content: "bg-[#B1D0FF] text-[#1a4a7a]",
  "On-Page SEO": "bg-[#BDFFE8] text-[#0d5a3f]",
  Technical: "bg-[#A69FFF] text-[#2d2878]",
  "Link Building": "bg-[#FFA69E] text-[#7a1a14]",
  Analytics: "bg-[#FFF09E] text-[#6b5f00]",
  Strategy: "bg-[#FBBDFF] text-[#6b1470]",
};

function getCat(cat: string) {
  return CATEGORY_COLORS[cat] || "bg-[#F0F0F0] text-[#6b7280]";
}

export default function MonthlyPlan({ entries, monthLabel }: MonthlyPlanProps) {
  const [open, setOpen] = useState(false);

  if (entries.length === 0) return null;

  return (
    <section id="plan-section" className="mb-4" data-track="plan">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-3 group"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted group-hover:text-foreground transition">
            {open ? "\u25BC" : "\u25B6"}
          </span>
          <h2 className="text-lg font-semibold">{monthLabel}</h2>
          <span className="text-xs bg-[#F0F0F0] text-muted px-2 py-0.5 rounded-full font-medium">
            Planned
          </span>
        </div>
        <span className="text-xs text-muted">{entries.length} tasks</span>
      </button>

      {open && (
        <div className="pb-4 space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-start gap-3 py-1.5">
              <span className="text-muted text-sm mt-0.5">\u25CB</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm">{entry.task}</span>
                  {entry.category.map((cat) => (
                    <span
                      key={cat}
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getCat(cat)}`}
                    >
                      {cat}
                    </span>
                  ))}
                </div>
                {entry.subtasks && (
                  <p className="text-xs text-muted mt-0.5">{entry.subtasks}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
