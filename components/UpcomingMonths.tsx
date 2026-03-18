"use client";

import { useState } from "react";
import { WorkLogEntry } from "@/types";

interface MonthPlan {
  monthLabel: string;
  entries: WorkLogEntry[];
  summary?: string;
}

interface UpcomingMonthsProps {
  monthPlans: MonthPlan[];
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

export default function UpcomingMonths({ monthPlans }: UpcomingMonthsProps) {
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  if (monthPlans.length === 0) return null;

  return (
    <section id="upcoming-section" data-track="upcoming">
      <div className="bg-[#F6FFF9] rounded-2xl px-6 py-5">
        <h3 className="text-sm font-semibold text-[#0d5a3f] mb-3">Upcoming Months</h3>
        <div className="space-y-1">
          {monthPlans.map(({ monthLabel, entries, summary }) => (
            <div key={monthLabel}>
              <button
                onClick={() => setOpenMonth(openMonth === monthLabel ? null : monthLabel)}
                className="w-full flex items-center justify-between py-2 group text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#0d5a3f] group-hover:text-[#1A1A1A] transition">
                    {openMonth === monthLabel ? "\u25BC" : "\u25B6"}
                  </span>
                  <span className="text-sm font-medium text-[#1A1A1A]">{monthLabel}</span>
                  <span className="text-[10px] bg-[#DDFFF0] text-[#0d5a3f] px-2 py-0.5 rounded-full font-medium">
                    Planned
                  </span>
                </div>
                <span className="text-xs text-[#6b7280] max-w-[50%] text-right truncate">
                  {summary || `${entries.length} tasks planned`}
                </span>
              </button>

              {openMonth === monthLabel && (
                <div className="pl-5 pb-4 space-y-3 mt-1">
                  {entries.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 text-sm">
                      <div className="w-4 h-4 mt-0.5 rounded-full border-2 border-[#34D399] flex-shrink-0" />
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[#1A1A1A]">{entry.task}</span>
                        {entry.category.map((cat) => (
                          <span
                            key={cat}
                            className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getCat(cat)}`}
                          >
                            {cat}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
