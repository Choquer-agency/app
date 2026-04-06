"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ServiceBoardCategory } from "@/types";

interface BoardSummary {
  category: string;
  categoryLabel: string;
  month: string;
  total: number;
  completed: number;
  clients: Array<{ id: string; name: string; status: string }>;
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

const STATUS_COLORS: Record<string, string> = {
  needs_attention: "bg-orange-500",
  in_progress: "bg-blue-500",
  report_ready: "bg-purple-500",
  email_sent: "bg-emerald-500",
};

const CATEGORY_COLORS: Record<string, { bg: string; accent: string; bar: string }> = {
  seo: { bg: "bg-blue-50", accent: "text-blue-700", bar: "bg-blue-500" },
  google_ads: { bg: "bg-amber-50", accent: "text-amber-700", bar: "bg-amber-500" },
  retainer: { bg: "bg-purple-50", accent: "text-purple-700", bar: "bg-purple-500" },
};

export default function ServiceBoardSummaryBanner({ specialistId }: { specialistId?: string }) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Real-time Convex subscription — updates instantly when entry statuses change
  const summaries = useQuery(
    api.serviceBoardEntries.getMySummary,
    specialistId ? { specialistId: specialistId as Id<"teamMembers">, month: getCurrentMonth() } : "skip"
  ) as BoardSummary[] | undefined;

  if (!summaries || summaries.length === 0) return null;

  return (
    <div className="pb-4 space-y-2">
      {summaries.map((summary) => {
        const percent = summary.total > 0 ? (summary.completed / summary.total) * 100 : 0;
        const colors = CATEGORY_COLORS[summary.category] || CATEGORY_COLORS.seo;
        const isExpanded = expandedCategory === summary.category;
        const remaining = summary.clients.filter((c) => c.status !== "email_sent");
        const done = summary.clients.filter((c) => c.status === "email_sent");

        return (
          <div key={summary.category} className={`rounded-xl border border-gray-200 overflow-hidden ${colors.bg}`}>
            {/* Summary row */}
            <div
              className="flex items-center gap-4 px-4 py-3 cursor-pointer"
              onClick={() => setExpandedCategory(isExpanded ? null : summary.category)}
            >
              {/* Expand arrow */}
              <svg
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
                className={`text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? "rotate-90" : ""}`}
              >
                <path d="M9 5l7 7-7 7" />
              </svg>

              {/* Label */}
              <div className="flex items-center gap-2 min-w-[140px]">
                <span className={`text-sm font-semibold ${colors.accent}`}>
                  {summary.month} {summary.categoryLabel}
                </span>
              </div>

              {/* Progress bar */}
              <div className="flex-1 flex items-center gap-3">
                <div className="flex-1 h-2 bg-white/60 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className={`text-sm font-bold tabular-nums ${colors.accent}`}>
                  {summary.completed} / {summary.total}
                </span>
              </div>

              {/* Link to board */}
              <a
                href={`/admin/tickets/${summary.category === "google_ads" ? "google-ads" : summary.category}`}
                onClick={(e) => e.stopPropagation()}
                className={`text-xs ${colors.accent} hover:underline flex-shrink-0`}
              >
                Open board
              </a>
            </div>

            {/* Expanded client list */}
            {isExpanded && (
              <div className="border-t border-gray-200/50 px-4 py-2">
                {remaining.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {remaining.map((client) => (
                      <div key={client.id} className="flex items-center gap-2 py-0.5">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[client.status] || "bg-gray-400"}`} />
                        <span className="text-xs text-gray-700">{client.name}</span>
                        <span className="text-[10px] text-gray-400 capitalize">
                          {client.status.replace(/_/g, " ")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {done.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-gray-200/50">
                    {done.map((client) => (
                      <div key={client.id} className="flex items-center gap-2 py-0.5 opacity-60">
                        <svg width="12" height="12" fill="none" stroke="#10B981" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-xs text-gray-500 line-through">{client.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
