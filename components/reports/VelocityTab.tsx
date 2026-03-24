"use client";

import { useState, useEffect, useCallback } from "react";
import { friendlyDate } from "@/lib/date-format";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { VelocityReport } from "@/lib/reports";

const STATUS_LABELS: Record<string, string> = {
  needs_attention: "Needs Attention",
  stuck: "Stuck",
  in_progress: "In Progress",
  qa_ready: "QA Ready",
  client_review: "Client Review",
  approved_go_live: "Approved / Go Live",
  closed: "Closed",
};

function fmtDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = Math.round(hours / 24 * 10) / 10;
  return `${days}d`;
}

export default function VelocityTab() {
  const [data, setData] = useState<VelocityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [weeks, setWeeks] = useState(12);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reports/velocity?weeks=${weeks}`);
      if (res.ok) setData(await res.json());
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [weeks]);

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
        No ticket velocity data available.
      </div>
    );
  }

  const avgThroughput = data.weeklyThroughput.length > 0
    ? Math.round(data.weeklyThroughput.reduce((s, w) => s + w.ticketsClosed, 0) / data.weeklyThroughput.length * 10) / 10
    : 0;

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#9CA3AF]">Period:</span>
        <div className="flex items-center bg-[#F5F5F5] rounded-lg p-0.5">
          {[4, 8, 12, 24].map((w) => (
            <button
              key={w}
              onClick={() => setWeeks(w)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                weeks === w
                  ? "bg-[#1A1A1A] text-white shadow-sm"
                  : "text-[#6B7280] hover:text-[#1A1A1A]"
              }`}
            >
              {w} weeks
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
          <div className="text-xs text-[#9CA3AF] mb-1">Avg Resolution Time</div>
          <div className="text-2xl font-semibold text-[#1A1A1A]">{fmtDuration(data.overallAvgHours)}</div>
        </div>
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
          <div className="text-xs text-[#9CA3AF] mb-1">Total Closed</div>
          <div className="text-2xl font-semibold text-[#1A1A1A]">{data.totalClosed}</div>
        </div>
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
          <div className="text-xs text-[#9CA3AF] mb-1">Avg Throughput / Week</div>
          <div className="text-2xl font-semibold text-[#1A1A1A]">{avgThroughput}</div>
        </div>
      </div>

      {/* Tickets closed per week */}
      {data.weeklyThroughput.length > 0 && (
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
          <h3 className="text-sm font-medium text-[#1A1A1A] mb-4">Tickets Closed Per Week</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.weeklyThroughput} margin={{ left: 0, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
              <XAxis
                dataKey="weekStart"
                tick={{ fontSize: 11, fill: "#9CA3AF" }}
                tickFormatter={(v) => friendlyDate(v)}
              />
              <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E5E5" }}
                labelFormatter={(v) => friendlyDate(v)}
              />
              <Line type="monotone" dataKey="ticketsClosed" stroke="#FF9500" strokeWidth={2} dot={{ r: 3, fill: "#FF9500" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Status duration breakdown (bottleneck detection) */}
      {data.statusDurations.length > 0 && (
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
          <h3 className="text-sm font-medium text-[#1A1A1A] mb-4">Avg Time in Each Status (Bottleneck Detection)</h3>
          <ResponsiveContainer width="100%" height={Math.max(180, data.statusDurations.length * 40)}>
            <BarChart
              data={data.statusDurations.map((d) => ({
                ...d,
                label: STATUS_LABELS[d.status] || d.status,
              }))}
              layout="vertical"
              margin={{ left: 10, right: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickFormatter={(v) => fmtDuration(v)} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: "#1A1A1A" }} width={120} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E5E5" }}
                formatter={(value) => [fmtDuration(Number(value)), "Avg time"]}
              />
              <Bar dataKey="avgHours" fill="#FF9500" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Resolution by client/project */}
      {data.avgResolution.length > 0 && (
        <div className="border border-[#E5E5E5] rounded-xl bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-[#F0F0F0]">
            <h3 className="text-sm font-medium text-[#1A1A1A]">Resolution Time by Client / Project</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F0F0F0]">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-[#9CA3AF]">Client</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-[#9CA3AF]">Project</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-[#9CA3AF]">Closed</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-[#9CA3AF]">Avg Resolution</th>
              </tr>
            </thead>
            <tbody>
              {data.avgResolution.map((r, i) => (
                <tr key={i} className="border-t border-[#F0F0F0] hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-[#1A1A1A]">{r.clientName || "Internal"}</td>
                  <td className="px-4 py-2.5 text-[#9CA3AF]">{r.projectName || "—"}</td>
                  <td className="px-4 py-2.5 text-right text-[#1A1A1A]">{r.ticketsClosed}</td>
                  <td className="px-4 py-2.5 text-right text-[#1A1A1A] font-medium">{fmtDuration(r.avgResolutionHours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
