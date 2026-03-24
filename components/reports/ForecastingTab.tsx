"use client";

import { useState, useEffect, useCallback } from "react";
import { friendlyDate } from "@/lib/date-format";
import type { ForecastingReport } from "@/lib/reports";

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  urgent: { bg: "bg-red-50", text: "text-red-700" },
  high: { bg: "bg-orange-50", text: "text-orange-700" },
  normal: { bg: "bg-blue-50", text: "text-blue-700" },
  low: { bg: "bg-gray-50", text: "text-gray-600" },
};

const STATUS_LABELS: Record<string, string> = {
  needs_attention: "Needs Attention",
  stuck: "Stuck",
  in_progress: "In Progress",
  qa_ready: "QA Ready",
  client_review: "Client Review",
  approved_go_live: "Go Live",
};

const CAPACITY_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  overloaded: { bg: "bg-red-50", text: "text-red-700", label: "Overloaded" },
  balanced: { bg: "bg-yellow-50", text: "text-yellow-700", label: "Balanced" },
  available: { bg: "bg-green-50", text: "text-green-700", label: "Available" },
};

function fmtHours(h: number): string {
  return `${h.toFixed(1)}h`;
}

function getDayLabel(dateStr: string): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const d = new Date(dateStr + "T00:00:00");
  return days[d.getDay()];
}

function getDayNum(dateStr: string): string {
  return dateStr.slice(8);
}

export default function ForecastingTab() {
  const [data, setData] = useState<ForecastingReport | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/reports/forecasting");
      if (res.ok) setData(await res.json());
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#FF9500] border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16 text-sm text-[#9CA3AF]">
        No forecasting data available.
      </div>
    );
  }

  // Split heatmap into 4 weeks
  const weeks: Array<typeof data.deadlineHeatmap> = [];
  for (let i = 0; i < 4; i++) {
    weeks.push(data.deadlineHeatmap.slice(i * 7, (i + 1) * 7));
  }

  return (
    <div className="space-y-6">
      {/* Team workload cards */}
      <div>
        <h3 className="text-sm font-medium text-[#1A1A1A] mb-3">Team Workload</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.teamWorkload.map((m) => {
            const cap = CAPACITY_CONFIG[m.capacityStatus];
            return (
              <div key={m.teamMemberId} className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: m.memberColor }}
                    />
                    <span className="text-sm font-medium text-[#1A1A1A]">{m.memberName}</span>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cap.bg} ${cap.text}`}>
                    {cap.label}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[#9CA3AF]">Open tickets:</span>
                    <span className="ml-1 font-medium text-[#1A1A1A]">{m.openTickets}</span>
                  </div>
                  <div>
                    <span className="text-[#9CA3AF]">Overdue:</span>
                    <span className={`ml-1 font-medium ${m.overdueTickets > 0 ? "text-red-600" : "text-[#1A1A1A]"}`}>
                      {m.overdueTickets}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#9CA3AF]">Hours this week:</span>
                    <span className="ml-1 font-medium text-[#1A1A1A]">{fmtHours(m.hoursLoggedThisWeek)}</span>
                  </div>
                  <div>
                    <span className="text-[#9CA3AF]">Remaining:</span>
                    <span className={`ml-1 font-medium ${m.remainingCapacity < 0 ? "text-red-600" : "text-green-600"}`}>
                      {fmtHours(m.remainingCapacity)}
                    </span>
                  </div>
                </div>
                {/* Capacity bar */}
                <div className="mt-3">
                  <div className="h-1.5 bg-[#F0F0F0] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, m.availableHours > 0 ? (m.hoursLoggedThisWeek / m.availableHours) * 100 : 0)}%`,
                        backgroundColor: m.capacityStatus === "overloaded" ? "#EF4444" : m.capacityStatus === "balanced" ? "#F59E0B" : "#10B981",
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Deadline heatmap */}
      <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
        <h3 className="text-sm font-medium text-[#1A1A1A] mb-4">Deadline Heatmap (Next 4 Weeks)</h3>
        <div className="space-y-2">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex items-center gap-1">
              <span className="text-xs text-[#9CA3AF] w-12 shrink-0">Wk {wi + 1}</span>
              <div className="flex gap-1 flex-1">
                {week.map((day) => {
                  const isToday = day.date === new Date().toISOString().slice(0, 10);
                  return (
                    <div
                      key={day.date}
                      className={`flex-1 h-10 rounded-md flex flex-col items-center justify-center text-xs ${
                        isToday ? "ring-2 ring-[#FF9500] ring-offset-1" : ""
                      }`}
                      style={{
                        backgroundColor: day.count === 0
                          ? "#F9FAFB"
                          : day.count <= 1
                          ? "#FEF3C7"
                          : day.count <= 3
                          ? "#FBBF24"
                          : "#EF4444",
                        color: day.count >= 3 ? "white" : "#1A1A1A",
                      }}
                      title={`${day.date}: ${day.count} deadline${day.count !== 1 ? "s" : ""}`}
                    >
                      <span className="text-[10px] opacity-60">{getDayLabel(day.date)}</span>
                      <span className="font-medium">{getDayNum(day.date)}</span>
                      {day.count > 0 && <span className="text-[9px]">{day.count}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming deadlines list */}
      {data.upcomingDeadlines.length > 0 && (
        <div className="border border-[#E5E5E5] rounded-xl bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-[#F0F0F0]">
            <h3 className="text-sm font-medium text-[#1A1A1A]">
              Upcoming Deadlines ({data.upcomingDeadlines.length})
            </h3>
          </div>
          <div className="divide-y divide-[#F0F0F0]">
            {data.upcomingDeadlines.map((d) => {
              const p = PRIORITY_COLORS[d.priority] || PRIORITY_COLORS.normal;
              const dueDate = new Date(d.dueDate + "T00:00:00");
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const daysUntil = Math.round((dueDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
              const dueLabel = daysUntil === 0 ? "Today" : daysUntil === 1 ? "Tomorrow" : `${daysUntil}d`;

              return (
                <div key={d.ticketId} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${p.bg} ${p.text}`}>
                    {d.priority}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#9CA3AF] font-mono">{d.ticketNumber}</span>
                      <span className="text-sm text-[#1A1A1A] truncate">{d.title}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {d.clientName && <span className="text-xs text-[#9CA3AF]">{d.clientName}</span>}
                      {d.assigneeNames.length > 0 && (
                        <span className="text-xs text-[#9CA3AF]">
                          &middot; {d.assigneeNames.join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-[#9CA3AF]">
                      {friendlyDate(d.dueDate)}
                    </div>
                    <div className={`text-xs font-medium ${
                      daysUntil <= 1 ? "text-red-600" : daysUntil <= 3 ? "text-yellow-600" : "text-[#9CA3AF]"
                    }`}>
                      {dueLabel}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data.upcomingDeadlines.length === 0 && (
        <div className="text-center py-8 text-sm text-[#9CA3AF]">
          No upcoming deadlines in the next 4 weeks.
        </div>
      )}
    </div>
  );
}
