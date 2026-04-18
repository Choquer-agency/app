"use client";

import { useState, useEffect, useCallback } from "react";
import { friendlyMonth } from "@/lib/date-format";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import type { ProfitabilityReport } from "@/lib/reports";

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  ok: { bg: "bg-green-50", text: "text-green-700", label: "On Track" },
  warning: { bg: "bg-yellow-50", text: "text-yellow-700", label: "Warning" },
  exceeded: { bg: "bg-red-50", text: "text-red-700", label: "Exceeded" },
};

const TREND_COLORS = [
  "#FF9500", "#3B82F6", "#10B981", "#8B5CF6", "#EC4899",
  "#F59E0B", "#06B6D4", "#EF4444", "#84CC16", "#6366F1",
];

function fmtHours(h: number): string {
  return `${h.toFixed(1)}h`;
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function ProfitabilityTab() {
  const [data, setData] = useState<ProfitabilityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reports/profitability?month=${selectedMonth}-01`);
      if (res.ok) setData(await res.json());
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

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

  if (!data || data.clients.length === 0) {
    return (
      <div className="text-center py-16 text-sm text-[#9CA3AF]">
        No client profitability data for this month.
      </div>
    );
  }

  // Build trend chart data
  const trendData = data.trends.map((t) => {
    const point: Record<string, string | number> = { month: t.month.slice(5) };
    for (const c of t.clients) {
      point[c.clientName] = c.loggedHours;
    }
    return point;
  });

  const trendClients = data.clients.slice(0, 10).map((c) => c.clientName);

  // Month selector (generate last 6 months)
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <div className="space-y-6">
      {/* Month selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#9CA3AF]">Month:</span>
        <div className="flex items-center bg-[var(--hover-tan)] rounded-lg p-0.5">
          {months.reverse().map((m) => (
            <button
              key={m}
              onClick={() => setSelectedMonth(m)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                selectedMonth === m
                  ? "bg-white text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {friendlyMonth(m)}
            </button>
          ))}
        </div>
      </div>

      {/* Client table */}
      <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Client</th>
              <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Included</th>
              <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Logged</th>
              <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Overage</th>
              <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Cost</th>
              <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.clients.map((c) => {
              const s = STATUS_COLORS[c.status];
              const pctUsed = c.includedHours > 0 ? (c.loggedHours / c.includedHours) * 100 : 0;
              return (
                <tr key={c.clientId} className="border-b border-[var(--border)] hover:bg-[var(--hover-tan)]">
                  <td className="px-2 py-3 font-medium text-[#1A1A1A]">{c.clientName}</td>
                  <td className="px-2 py-3 text-right text-[#9CA3AF]">{fmtHours(c.includedHours)}</td>
                  <td className="px-2 py-3 text-right text-[#1A1A1A]">{fmtHours(c.loggedHours)}</td>
                  <td className="px-2 py-3 text-right">
                    {c.overage > 0 ? (
                      <span className="text-red-600">+{fmtHours(c.overage)}</span>
                    ) : (
                      <span className="text-green-600">{fmtHours(c.overage)}</span>
                    )}
                  </td>
                  <td className="px-2 py-3 text-right text-[#1A1A1A]">
                    {c.overageCost > 0 ? fmtMoney(c.overageCost) : "—"}
                  </td>
                  <td className="px-2 py-3 text-right">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
                      {Math.round(pctUsed)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 6-month trend */}
      {trendData.length > 0 && (
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
          <h3 className="text-sm font-medium text-[#1A1A1A] mb-4">6-Month Trend (Hours Logged)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData} margin={{ left: 0, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} tickFormatter={(v) => `${v}h`} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E5E5" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {trendClients.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={TREND_COLORS[i % TREND_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
