"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface BillableHoursMember {
  teamMemberId: string;
  memberName: string;
  memberColor: string;
  effectiveRate: number;
  totalHours: number;
  billableHours: number;
  internalHours: number;
  utilizationPct: number;
  totalCost: number;
}

interface BillableHoursClient {
  clientId: string;
  clientName: string;
  revenue: number;
  costOfDelivery: number;
  grossProfit: number;
  marginPct: number;
  loggedHours: number;
  includedHours: number;
  byCategory: Array<{ category: string; hours: number }>;
  byMember: Array<{ memberName: string; hours: number; cost: number }>;
}

interface Report {
  month: string;
  members: BillableHoursMember[];
  clients: BillableHoursClient[];
  summary: {
    totalBillableHours: number;
    totalInternalHours: number;
    totalCostOfDelivery: number;
    totalRevenue: number;
    blendedMarginPct: number;
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  seo: "SEO",
  google_ads: "Google Ads",
  retainer: "Retainer",
  website: "Website",
  other: "Other",
};

function fmtMoney(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtMoneyFull(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function getMonthOptions(): { value: string; label: string }[] {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    options.push({ value, label });
  }
  return options;
}

export default function BillableHoursTab() {
  const monthOptions = getMonthOptions();
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reports/billable-hours?month=${selectedMonth}`);
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
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

  if (!data) {
    return <div className="text-center py-16 text-sm text-[#9CA3AF]">No data available.</div>;
  }

  const utilizationData = data.members.map((m) => ({
    name: m.memberName.split(" ")[0],
    billable: m.billableHours,
    internal: m.internalHours,
    utilization: m.utilizationPct,
    color: m.memberColor,
  }));

  return (
    <div className="space-y-6">
      {/* Month selector */}
      <div className="flex items-center gap-3">
        {monthOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setSelectedMonth(opt.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
              selectedMonth === opt.value
                ? "bg-[#1A1A1A] text-white"
                : "bg-gray-100 text-[#9CA3AF] hover:text-[#1A1A1A]"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
          <div className="text-xs text-[#9CA3AF] mb-1">Total Hours Worked</div>
          <div className="text-2xl font-semibold text-[#1A1A1A]">
            {(data.summary.totalBillableHours + data.summary.totalInternalHours).toFixed(1)}h
          </div>
        </div>
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
          <div className="text-xs text-[#9CA3AF] mb-1">Billable Hours</div>
          <div className="text-2xl font-semibold text-green-600">
            {data.summary.totalBillableHours.toFixed(1)}h
          </div>
        </div>
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
          <div className="text-xs text-[#9CA3AF] mb-1">Cost of Delivery</div>
          <div className="text-2xl font-semibold text-red-500">
            {fmtMoneyFull(data.summary.totalCostOfDelivery)}
          </div>
        </div>
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
          <div className="text-xs text-[#9CA3AF] mb-1">Revenue</div>
          <div className="text-2xl font-semibold text-green-600">
            {fmtMoneyFull(data.summary.totalRevenue)}
          </div>
        </div>
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
          <div className="text-xs text-[#9CA3AF] mb-1">Blended Margin</div>
          <div
            className={`text-2xl font-semibold ${
              data.summary.blendedMarginPct >= 50
                ? "text-green-600"
                : data.summary.blendedMarginPct >= 30
                  ? "text-amber-500"
                  : "text-red-500"
            }`}
          >
            {data.summary.blendedMarginPct}%
          </div>
        </div>
      </div>

      {/* Team Utilization Chart */}
      {utilizationData.length > 0 && (
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
          <h3 className="text-sm font-medium text-[#1A1A1A] mb-4">
            Team Billable Utilization
          </h3>
          <ResponsiveContainer width="100%" height={Math.max(180, utilizationData.length * 45)}>
            <BarChart
              data={utilizationData}
              layout="vertical"
              margin={{ left: 10, right: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickFormatter={(v) => `${v}h`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#1A1A1A" }} width={80} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E5E5" }}
                formatter={(value) => [`${Number(value).toFixed(1)}h`, ""]}
              />
              <Bar dataKey="billable" name="Billable" fill="#10B981" stackId="hours" radius={[0, 0, 0, 0]} />
              <Bar dataKey="internal" name="Internal" fill="#E5E7EB" stackId="hours" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>

          {/* Utilization labels */}
          <div className="flex flex-wrap gap-4 mt-3 px-2">
            {data.members.map((m) => (
              <div key={m.teamMemberId} className="flex items-center gap-2 text-xs">
                <span className="font-medium text-[#1A1A1A]">{m.memberName.split(" ")[0]}</span>
                <span
                  className={`font-semibold ${
                    m.utilizationPct >= 80
                      ? "text-green-600"
                      : m.utilizationPct >= 50
                        ? "text-amber-500"
                        : "text-red-400"
                  }`}
                >
                  {m.utilizationPct}%
                </span>
                <span className="text-[#9CA3AF]">
                  ({m.billableHours.toFixed(1)}h / {m.totalHours.toFixed(1)}h)
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-5 mt-3 px-2 border-t border-[#F0F0F0] pt-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-[#10B981]" />
              <span className="text-xs text-[#9CA3AF]">Billable (ticket timers on client work)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-[#E5E7EB]" />
              <span className="text-xs text-[#9CA3AF]">Untracked (clocked in but no ticket timer)</span>
            </div>
          </div>
        </div>
      )}

      {/* Client Profitability Table */}
      {data.clients.length > 0 && (
        <div className="border border-[#E5E5E5] rounded-xl bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-[#F0F0F0]">
            <h3 className="text-sm font-medium text-[#1A1A1A]">Client Profitability</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F0F0F0]">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-[#9CA3AF]">Client</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-[#9CA3AF]">Hours</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-[#9CA3AF]">Revenue</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-[#9CA3AF]">Cost</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-[#9CA3AF]">Profit</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-[#9CA3AF]">Margin</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-[#9CA3AF]">Categories</th>
              </tr>
            </thead>
            <tbody>
              {data.clients.map((c) => (
                <tr key={c.clientId} className="border-t border-[#F0F0F0] hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-[#1A1A1A]">{c.clientName}</td>
                  <td className="px-4 py-2.5 text-right text-[#1A1A1A]">
                    {c.loggedHours.toFixed(1)}h
                    {c.includedHours > 0 && (
                      <span className="text-[#9CA3AF] text-xs ml-1">/ {c.includedHours}h</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-green-600 font-medium">
                    {fmtMoneyFull(c.revenue)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-red-400">
                    {fmtMoneyFull(c.costOfDelivery)}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-semibold ${
                      c.grossProfit >= 0 ? "text-green-600" : "text-red-500"
                    }`}
                  >
                    {fmtMoneyFull(c.grossProfit)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        c.marginPct >= 50
                          ? "bg-green-100 text-green-700"
                          : c.marginPct >= 30
                            ? "bg-amber-100 text-amber-700"
                            : c.marginPct >= 0
                              ? "bg-red-100 text-red-600"
                              : "bg-red-200 text-red-700"
                      }`}
                    >
                      {c.marginPct}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1 flex-wrap">
                      {c.byCategory.map((cat) => (
                        <span
                          key={cat.category}
                          className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-[#9CA3AF]"
                        >
                          {CATEGORY_LABELS[cat.category] || cat.category}{" "}
                          {cat.hours.toFixed(1)}h
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
