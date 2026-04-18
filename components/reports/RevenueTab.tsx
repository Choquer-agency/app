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
import ChartZoomFix from "./ChartZoomFix";

interface RevenueTrendPoint {
  month: string;
  usd: number;
  cad: number;
  total: number;
  netTotal: number;
  count: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  seo: "SEO",
  retainer: "Retainer",
  google_ads: "Google Ads",
  blog: "Blog",
  blogs: "Blog",
  website: "Website",
  hosting: "Hosting",
  ai: "AI SEO",
  ai_chat: "AI Chat",
};

function fmtMoney(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtMoneyFull(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function monthLabel(v: string): string {
  const [, m] = v.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months[parseInt(m) - 1] || v;
}

function monthLabelFull(v: string): string {
  const [y, m] = v.split("-");
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return months[parseInt(m) - 1] + " " + y;
}

export default function RevenueTab() {
  const [data, setData] = useState<RevenueReport | null>(null);
  const [trend, setTrend] = useState<RevenueTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [revenueRes, trendRes] = await Promise.all([
        fetch(`/api/admin/reports/revenue?months=12&_t=${Date.now()}`, { cache: "no-store" }),
        fetch(`/api/admin/reports/revenue-trend?_t=${Date.now()}`, { cache: "no-store" }),
      ]);
      if (revenueRes.ok) setData(await revenueRes.json());
      if (trendRes.ok) {
        const trendData = await trendRes.json();
        setTrend(trendData.trend || []);
      }
    } catch {}
    setLoading(false);
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

  // Compute smart projected annual revenue:
  // Completed months = actual Converge collected
  // Current month MRR + remaining months × MRR + one-time payments
  const currentYear = new Date().getFullYear();
  const currentMonthIdx = new Date().getMonth(); // 0-indexed
  const thisYearTrend = trend.filter((t) => t.month.startsWith(String(currentYear)));
  const completedMonths = thisYearTrend.filter((t) => {
    const m = parseInt(t.month.split("-")[1]) - 1;
    return m < currentMonthIdx;
  });
  const lockedRevenue = completedMonths.reduce((sum, t) => sum + t.netTotal, 0);
  const currentMonthCollected = thisYearTrend.find((t) => parseInt(t.month.split("-")[1]) - 1 === currentMonthIdx)?.netTotal ?? 0;
  const remainingMonths = 12 - currentMonthIdx - 1;
  const projectedAnnual = Math.round(
    lockedRevenue + currentMonthCollected + (remainingMonths * data.currentMrr) + (data.lockedRevenue ?? 0)
  );

  const categoryData = data.revenueByCategory.map((c) => ({
    ...c,
    label: CATEGORY_LABELS[c.category] || c.category.charAt(0).toUpperCase() + c.category.slice(1),
  }));

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div style={{ display: "flex", gap: 12, width: "100%" }}>
        <div style={{ flex: 1 }} className="border border-[#E5E5E5] rounded-xl p-3 bg-white">
          <div className="text-[10px] text-[#9CA3AF] mb-1">Current MRR</div>
          <div className="text-2xl font-semibold text-[#1A1A1A]">{fmtMoneyFull(data.currentMrr)}</div>
          <div className="text-[10px] text-[#9CA3AF] mt-1">Active recurring packages</div>
        </div>
        <div style={{ flex: 1 }} className="border border-[#E5E5E5] rounded-xl p-3 bg-white">
          <div className="text-[10px] text-[#9CA3AF] mb-1">Projected Annual Revenue</div>
          <div className="text-2xl font-semibold text-[#1A1A1A]">{fmtMoneyFull(projectedAnnual)}</div>
          <div className="text-[10px] text-[#9CA3AF] mt-1">Locked + MRR × remaining</div>
        </div>
        <div style={{ flex: 1 }} className="border border-[#E5E5E5] rounded-xl p-3 bg-white">
          <div className="text-[10px] text-[#9CA3AF] mb-1">Active Clients</div>
          <div className="text-2xl font-semibold text-[#1A1A1A]">{data.clientLtv.length}</div>
          <div className="text-[10px] text-[#9CA3AF] mt-1">With recurring packages</div>
        </div>
      </div>

      {/* Actual Collected Revenue Trend */}
      {trend.length > 0 && (
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
          <h3 className="text-sm font-medium text-[#1A1A1A] mb-4">Monthly Collected Revenue (Converge)</h3>
          <ChartZoomFix>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trend} margin={{ left: 10, right: 30 }} barSize={24}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickFormatter={monthLabel} />
                <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} tickFormatter={fmtMoney} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E5E5" }}
                  formatter={(value: number, name: string) => [fmtMoneyFull(value), name === "usd" ? "USD" : "CAD"]}
                  labelFormatter={monthLabelFull}
                />
                <Bar dataKey="usd" name="usd" fill="#3B82F6" stackId="revenue" />
                <Bar dataKey="cad" name="cad" fill="#EF4444" stackId="revenue" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartZoomFix>
          <div className="flex items-center gap-5 mt-3 px-2">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-[#3B82F6]" />
              <span className="text-xs text-[#9CA3AF]">USD</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-[#EF4444]" />
              <span className="text-xs text-[#9CA3AF]">CAD</span>
            </div>
            <span className="text-xs text-[#9CA3AF] ml-auto">
              Actual Converge transactions
            </span>
          </div>
        </div>
      )}

      {/* MRR Trend */}
      {data.mrrTrend.length > 0 && (
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
          <h3 className="text-sm font-medium text-[#1A1A1A] mb-4">MRR Trend (Recurring Only)</h3>
          <ChartZoomFix>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.mrrTrend} margin={{ left: 10, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickFormatter={monthLabel} />
                <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} tickFormatter={fmtMoney} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E5E5" }}
                  formatter={(value: number) => [fmtMoneyFull(value), "MRR"]}
                  labelFormatter={monthLabelFull}
                />
                <Line type="monotone" dataKey="mrr" stroke="#FF9500" strokeWidth={2} dot={{ r: 3, fill: "#FF9500" }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartZoomFix>
          <div className="text-xs text-[#9CA3AF] mt-2 px-2">Recurring packages only — excludes one-time top-ups and website builds</div>
        </div>
      )}

      {/* Revenue by Category */}
      {categoryData.length > 0 && (
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
          <h3 className="text-sm font-medium text-[#1A1A1A] mb-4">Revenue by Service Category</h3>
          <ChartZoomFix>
            <ResponsiveContainer width="100%" height={Math.max(180, categoryData.length * 50)}>
              <BarChart data={categoryData} layout="vertical" margin={{ left: 10, right: 30 }} barSize={24}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickFormatter={fmtMoney} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: "#1A1A1A" }} width={120} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E5E5" }}
                  formatter={(value: number) => [fmtMoneyFull(value), "Revenue"]}
                />
                <Bar dataKey="revenue" fill="#FF9500" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartZoomFix>
        </div>
      )}

      {/* Client Lifetime Value */}
      {data.clientLtv.length > 0 && (
        <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <h3 className="text-sm font-medium text-[#1A1A1A]">Client Lifetime Value</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="pl-5 pr-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Client</th>
                <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">MRR</th>
                <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Months Active</th>
                <th style={{ paddingRight: 20 }} className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Lifetime Value</th>
              </tr>
            </thead>
            <tbody>
              {data.clientLtv.map((c) => (
                <tr key={c.clientId} className="border-b border-[var(--border)] hover:bg-[var(--hover-tan)]">
                  <td className="pl-5 pr-2 py-3 font-medium text-[#1A1A1A]">{c.clientName}</td>
                  <td className="px-2 py-3 text-right text-[#1A1A1A]">{fmtMoneyFull(c.mrr)}</td>
                  <td className="px-2 py-3 text-right text-[#9CA3AF]">{c.monthsActive}</td>
                  <td style={{ paddingRight: 20 }} className="px-2 py-3 text-right font-semibold text-[#1A1A1A]">{fmtMoneyFull(c.ltv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
