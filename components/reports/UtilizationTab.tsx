"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";
import type { UtilizationReport } from "@/lib/reports";

interface UtilizationTabProps {
  start: string;
  end: string;
}

// Generate consistent colors for clients
const CLIENT_COLORS = [
  "#FF9500", "#3B82F6", "#10B981", "#8B5CF6", "#EC4899",
  "#F59E0B", "#06B6D4", "#EF4444", "#84CC16", "#6366F1",
  "#14B8A6", "#F97316", "#A855F7", "#0EA5E9", "#22C55E",
];

function fmtHours(h: number): string {
  if (h >= 100) return `${Math.round(h)}h`;
  return `${h.toFixed(1)}h`;
}

export default function UtilizationTab({ start, end }: UtilizationTabProps) {
  const [data, setData] = useState<UtilizationReport | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reports/utilization?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  useEffect(() => {
    if (start && end) fetchData();
  }, [start, end, fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#FF9500] border-t-transparent" />
      </div>
    );
  }

  if (!data || data.members.length === 0) {
    return (
      <div className="text-center py-16 text-sm text-[#9CA3AF]">
        No time entries found for this period.
      </div>
    );
  }

  // Get unique client names for chart legend
  const allClients = new Map<string, string>();
  for (const member of data.members) {
    for (const c of member.byClient) {
      const name = c.clientName || "Internal";
      if (!allClients.has(name)) {
        allClients.set(name, CLIENT_COLORS[allClients.size % CLIENT_COLORS.length]);
      }
    }
  }

  // Build chart data
  const chartData = data.members.map((m) => {
    const entry: Record<string, string | number> = { name: m.memberName.split(" ")[0] };
    for (const c of m.byClient) {
      const clientName = c.clientName || "Internal";
      entry[clientName] = Math.round(c.hours * 10) / 10;
    }
    return entry;
  });

  const clientEntries = Array.from(allClients.entries());

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
          <div className="text-xs text-[#9CA3AF] mb-1">Total Team Hours</div>
          <div className="text-2xl font-semibold text-[#1A1A1A]">{fmtHours(data.totalTeamHours)}</div>
        </div>
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
          <div className="text-xs text-[#9CA3AF] mb-1">Avg Utilization</div>
          <div className="text-2xl font-semibold text-[#1A1A1A]">{data.avgUtilization}%</div>
        </div>
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
          <div className="text-xs text-[#9CA3AF] mb-1">Most Utilized</div>
          <div className="text-2xl font-semibold text-[#1A1A1A] truncate">
            {data.members[0]?.memberName.split(" ")[0] || "—"}
          </div>
          <div className="text-xs text-[#9CA3AF]">{data.members[0]?.utilizationPct || 0}%</div>
        </div>
      </div>

      {/* Stacked bar chart */}
      <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
        <h3 className="text-sm font-medium text-[#1A1A1A] mb-4">Hours by Team Member</h3>
        <ResponsiveContainer width="100%" height={Math.max(200, data.members.length * 50)}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickFormatter={(v) => `${v}h`} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#1A1A1A" }} width={80} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E5E5" }}
              formatter={(value) => [`${Number(value).toFixed(1)}h`, undefined]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {clientEntries.map(([name, color]) => (
              <Bar key={name} dataKey={name} stackId="hours" fill={color} radius={0} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detail table */}
      <div className="border border-[#E5E5E5] rounded-xl bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#F0F0F0]">
              <th className="text-left px-4 py-3 text-xs font-medium text-[#9CA3AF]">Team Member</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-[#9CA3AF]">Logged</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-[#9CA3AF]">Available</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-[#9CA3AF]">Utilization</th>
            </tr>
          </thead>
          <tbody>
            {data.members.map((m) => (
              <tr key={m.teamMemberId} className="border-t border-[#F0F0F0] hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: m.memberColor || "#6B7280" }}
                    />
                    <span className="text-[#1A1A1A] font-medium">{m.memberName}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-[#1A1A1A]">{fmtHours(m.totalHours)}</td>
                <td className="px-4 py-3 text-right text-[#9CA3AF]">{fmtHours(m.availableHours)}</td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      m.utilizationPct >= 100
                        ? "bg-red-50 text-red-700"
                        : m.utilizationPct >= 80
                        ? "bg-yellow-50 text-yellow-700"
                        : m.utilizationPct >= 50
                        ? "bg-green-50 text-green-700"
                        : "bg-gray-50 text-gray-600"
                    }`}
                  >
                    {m.utilizationPct}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
