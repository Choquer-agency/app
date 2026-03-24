"use client";

import { useState, useEffect, useCallback } from "react";
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
import type { RevenueReport } from "@/lib/reports";

const CATEGORY_LABELS: Record<string, string> = {
  seo: "SEO",
  retainer: "Retainer",
  google_ads: "Google Ads",
  social_media_ads: "Social Media Ads",
  blog: "Blog",
  website: "Website",
  other: "Other",
};

const CATEGORY_COLORS: Record<string, string> = {
  seo: "#10B981",
  retainer: "#3B82F6",
  google_ads: "#F59E0B",
  social_media_ads: "#EC4899",
  blog: "#8B5CF6",
  website: "#FF9500",
  other: "#6B7280",
};

function fmtMoney(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtMoneyFull(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function RevenueTab() {
  const [data, setData] = useState<RevenueReport | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/reports/revenue?months=12");
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
        No revenue data available.
      </div>
    );
  }

  const categoryData = data.revenueByCategory.map((c) => ({
    ...c,
    label: CATEGORY_LABELS[c.category] || c.category,
    fill: CATEGORY_COLORS[c.category] || "#6B7280",
  }));

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
          <div className="text-xs text-[#9CA3AF] mb-1">Current MRR</div>
          <div className="text-2xl font-semibold text-[#1A1A1A]">{fmtMoneyFull(data.currentMrr)}</div>
        </div>
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
          <div className="text-xs text-[#9CA3AF] mb-1">Projected Annual Revenue</div>
          <div className="text-2xl font-semibold text-[#1A1A1A]">{fmtMoneyFull(data.projectedAnnualRevenue)}</div>
        </div>
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
          <div className="text-xs text-[#9CA3AF] mb-1">Active Clients</div>
          <div className="text-2xl font-semibold text-[#1A1A1A]">{data.clientLtv.length}</div>
        </div>
      </div>

      {/* MRR Trend */}
      {data.mrrTrend.length > 0 && (
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
          <h3 className="text-sm font-medium text-[#1A1A1A] mb-4">MRR Trend (12 Months)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.mrrTrend} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "#9CA3AF" }}
                tickFormatter={(v) => {
                  const [, m] = v.split("-");
                  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                  return months[parseInt(m) - 1] || v;
                }}
              />
              <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} tickFormatter={fmtMoney} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E5E5" }}
                formatter={(value) => [fmtMoneyFull(Number(value)), "MRR"]}
              />
              <Line type="monotone" dataKey="mrr" stroke="#FF9500" strokeWidth={2} dot={{ r: 3, fill: "#FF9500" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Revenue by Category */}
      {categoryData.length > 0 && (
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
          <h3 className="text-sm font-medium text-[#1A1A1A] mb-4">Revenue by Service Category</h3>
          <ResponsiveContainer width="100%" height={Math.max(180, categoryData.length * 40)}>
            <BarChart data={categoryData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickFormatter={fmtMoney} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: "#1A1A1A" }} width={120} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E5E5" }}
                formatter={(value) => [fmtMoneyFull(Number(value)), "Revenue"]}
              />
              {categoryData.map((c) => (
                <Bar key={c.category} dataKey="revenue" fill={c.fill} radius={[0, 4, 4, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Client Lifetime Value */}
      {data.clientLtv.length > 0 && (
        <div className="border border-[#E5E5E5] rounded-xl bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-[#F0F0F0]">
            <h3 className="text-sm font-medium text-[#1A1A1A]">Client Lifetime Value</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F0F0F0]">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-[#9CA3AF]">Client</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-[#9CA3AF]">MRR</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-[#9CA3AF]">Months Active</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-[#9CA3AF]">Lifetime Value</th>
              </tr>
            </thead>
            <tbody>
              {data.clientLtv.map((c) => (
                <tr key={c.clientId} className="border-t border-[#F0F0F0] hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-[#1A1A1A]">{c.clientName}</td>
                  <td className="px-4 py-2.5 text-right text-[#1A1A1A]">{fmtMoneyFull(c.mrr)}</td>
                  <td className="px-4 py-2.5 text-right text-[#9CA3AF]">{c.monthsActive}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-[#1A1A1A]">{fmtMoneyFull(c.ltv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
