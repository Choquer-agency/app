"use client";

import React, { useState, useEffect, useCallback } from "react";
import FilterDropdown from "@/components/FilterDropdown";

interface BillableHoursMember {
  teamMemberId: string;
  memberName: string;
  memberColor: string;
  effectiveRate: number;
  totalHours: number;
  billableHours: number;
  internalHours: number;
  untrackedHours: number;
  utilizationPct: number;
  totalCost: number;
}

interface BillableHoursClient {
  clientId: string;
  clientName: string;
  billable: boolean;
  revenue: number;
  costOfDelivery: number;
  grossProfit: number;
  marginPct: number;
  loggedHours: number;
  includedHours: number;
  packageCategories: string[];
  byMember: Array<{ memberName: string; hours: number; cost: number }>;
  tickets: Array<{ ticketId: string; ticketNumber: string; title: string; hours: number; memberNames: string[] }>;
}

interface Report {
  month: string;
  members: BillableHoursMember[];
  clients: BillableHoursClient[];
  summary: {
    totalBillableHours: number;
    totalInternalHours: number;
    totalCostOfDelivery: number;
    totalEmployeeCost: number;
    totalRevenue: number;
    blendedMarginPct: number;
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  seo: "SEO",
  google_ads: "Google Ads",
  retainer: "Retainer",
  website: "Website",
  blog: "Blog",
  blogs: "Blog",
  hosting: "Hosting",
  ai: "AI SEO",
  ai_chat: "AI Chat",
};

const CATEGORY_COLORS: Record<string, string> = {
  seo: "bg-blue-100 text-blue-700",
  google_ads: "bg-purple-100 text-purple-700",
  retainer: "bg-amber-100 text-amber-700",
  website: "bg-green-100 text-green-700",
  blog: "bg-pink-100 text-pink-700",
  blogs: "bg-pink-100 text-pink-700",
  hosting: "bg-gray-100 text-gray-600",
  ai: "bg-cyan-100 text-cyan-700",
  ai_chat: "bg-teal-100 text-teal-700",
};

function fmtMoney(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtMoneyFull(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function BillableHoursTab() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth()); // 0-indexed
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [billableHoverIdx, setBillableHoverIdx] = useState<number | null>(null);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);

  const monthParam = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-01`;

  // Year options: current year and previous year
  const yearOptions = [now.getFullYear(), now.getFullYear() - 1];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reports/billable-hours?month=${monthParam}&_t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }, [monthParam]);

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

  // Chart data — three segments: billable, internal, untracked
  const utilizationData = data.members.map((m) => ({
    name: m.memberName.split(" ")[0],
    billable: m.billableHours,
    internal: m.internalHours,
    untracked: m.untrackedHours ?? Math.max(0, m.totalHours - m.billableHours - m.internalHours),
    total: m.totalHours,
    utilization: m.utilizationPct,
    color: m.memberColor,
  }));

  const chartMax = Math.max(...utilizationData.map((d) => d.total), 1);
  const chartAxisMax = Math.ceil(chartMax / 10) * 10 || 40;
  const chartTicks = Array.from({ length: 5 }, (_, i) => Math.round((chartAxisMax / 4) * i));

  return (
    <div className="space-y-6">
      {/* Month/Year selector */}
      <div className="flex items-center gap-3">
        <FilterDropdown
          label=""
          value={String(selectedMonth)}
          onChange={(v) => setSelectedMonth(Number(v))}
          options={MONTHS.map((label, idx) => ({ value: String(idx), label }))}
        />
        <FilterDropdown
          label=""
          value={String(selectedYear)}
          onChange={(v) => setSelectedYear(Number(v))}
          options={yearOptions.map((y) => ({ value: String(y), label: String(y) }))}
        />
      </div>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: 12, width: "100%" }}>
        <div style={{ flex: 1 }} className="border border-[#E5E5E5] rounded-xl p-3 bg-white">
          <div className="text-[10px] text-[#9CA3AF] mb-1">Hours Worked</div>
          <div className="text-2xl font-semibold text-[#1A1A1A]">
            {(data.summary.totalBillableHours + data.summary.totalInternalHours).toFixed(1)}h
          </div>
          <div className="text-[10px] text-[#9CA3AF] mt-1">Total clocked time</div>
        </div>
        <div style={{ flex: 1 }} className="border border-[#E5E5E5] rounded-xl p-3 bg-white">
          <div className="text-[10px] text-[#9CA3AF] mb-1">Billable Hours</div>
          <div className="text-2xl font-semibold text-green-600">
            {data.summary.totalBillableHours.toFixed(1)}h
          </div>
          <div className="text-[10px] text-[#9CA3AF] mt-1">On client tickets</div>
        </div>
        <div style={{ flex: 1 }} className="border border-[#E5E5E5] rounded-xl p-3 bg-white">
          <div className="text-[10px] text-[#9CA3AF] mb-1">Employee Cost</div>
          <div className="text-2xl font-semibold text-red-500">
            {fmtMoneyFull(data.summary.totalEmployeeCost)}
          </div>
          <div className="text-[10px] text-[#9CA3AF] mt-1">All team hours × rate</div>
        </div>
        <div style={{ flex: 1 }} className="border border-[#E5E5E5] rounded-xl p-3 bg-white">
          <div className="text-[10px] text-[#9CA3AF] mb-1">Delivery Cost</div>
          <div className="text-2xl font-semibold text-red-500">
            {fmtMoneyFull(data.summary.totalCostOfDelivery)}
          </div>
          <div className="text-[10px] text-[#9CA3AF] mt-1">Client work only</div>
        </div>
        <div style={{ flex: 1 }} className="border border-[#E5E5E5] rounded-xl p-3 bg-white">
          <div className="text-[10px] text-[#9CA3AF] mb-1">Revenue</div>
          <div className="text-2xl font-semibold text-green-600">
            {fmtMoneyFull(data.summary.totalRevenue)}
          </div>
          <div className="text-[10px] text-[#9CA3AF] mt-1">Active monthly packages</div>
        </div>
        <div style={{ flex: 1 }} className="border border-[#E5E5E5] rounded-xl p-3 bg-white">
          <div className="text-[10px] text-[#9CA3AF] mb-1">Blended Margin</div>
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
          <div className="text-[10px] text-[#9CA3AF] mt-1">Revenue − employee cost</div>
        </div>
      </div>

      {/* Team Billable Utilization — pure HTML bar chart */}
      {utilizationData.length > 0 && (
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
          <h3 className="text-sm font-medium text-[#1A1A1A] mb-4">
            Team Billable Utilization
          </h3>

          <div className="relative">
            {/* Grid lines */}
            <div className="absolute inset-0 ml-[80px]" style={{ pointerEvents: "none" }}>
              {chartTicks.map((tick) => (
                <div
                  key={tick}
                  className="absolute top-0 bottom-6 border-l border-dashed border-[#F0F0F0]"
                  style={{ left: `${(tick / chartAxisMax) * 100}%` }}
                />
              ))}
            </div>

            {/* Bars */}
            {utilizationData.map((d, idx) => {
              const billablePct = (d.billable / chartAxisMax) * 100;
              const internalPct = (d.internal / chartAxisMax) * 100;
              const untrackedPct = (d.untracked / chartAxisMax) * 100;
              const hasInternal = d.internal > 0;
              const hasUntracked = d.untracked > 0;
              const isLastBillable = !hasInternal && !hasUntracked;
              const isLastInternal = hasInternal && !hasUntracked;
              const isHovered = billableHoverIdx === idx;
              return (
                <div
                  key={idx}
                  className="relative flex items-center gap-0 transition-colors"
                  style={{ padding: "10px 0", backgroundColor: isHovered ? "var(--hover-tan)" : "transparent" }}
                  onMouseEnter={() => setBillableHoverIdx(idx)}
                  onMouseLeave={() => setBillableHoverIdx(null)}
                >
                  <div className="w-[80px] shrink-0 text-xs text-[#1A1A1A] font-medium text-right pr-3">
                    {d.name}
                  </div>
                  <div style={{ flex: 1, height: 28, position: "relative" }}>
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        height: 28,
                        width: `${billablePct}%`,
                        backgroundColor: "#10B981",
                        borderRadius: isLastBillable ? "0 6px 6px 0" : "0",
                        minWidth: d.billable > 0 ? 2 : 0,
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: `${billablePct}%`,
                        height: 28,
                        width: `${internalPct}%`,
                        backgroundColor: "#FF9500",
                        borderRadius: isLastInternal ? "0 6px 6px 0" : "0",
                        minWidth: hasInternal ? 2 : 0,
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: `${billablePct + internalPct}%`,
                        height: 28,
                        width: `${untrackedPct}%`,
                        backgroundColor: "#E5E7EB",
                        borderRadius: "0 6px 6px 0",
                        minWidth: hasUntracked ? 2 : 0,
                      }}
                    />
                  </div>
                  {/* Tooltip */}
                  {isHovered && (
                    <div className="absolute z-10 bg-white rounded-lg border border-[#E5E5E5] px-3 py-2 shadow-sm text-xs pointer-events-none" style={{ right: "15%", top: -4 }}>
                      <div className="font-medium text-[#1A1A1A] mb-1">{d.name}</div>
                      <div className="flex items-center gap-1.5 text-[#10B981]">
                        <span className="inline-block w-2 h-2 rounded-sm bg-[#10B981]" />
                        Billable: {d.billable.toFixed(1)}h
                      </div>
                      {d.internal > 0 && (
                        <div className="flex items-center gap-1.5 text-[#FF9500] mt-0.5">
                          <span className="inline-block w-2 h-2 rounded-sm bg-[#FF9500]" />
                          Internal: {d.internal.toFixed(1)}h
                        </div>
                      )}
                      {d.untracked > 0 && (
                        <div className="flex items-center gap-1.5 text-[#9CA3AF] mt-0.5">
                          <span className="inline-block w-2 h-2 rounded-sm bg-[#E5E7EB]" />
                          Untracked: {d.untracked.toFixed(1)}h
                        </div>
                      )}
                      <div className="mt-1 pt-1 border-t border-[#F0F0F0] text-[#1A1A1A]">
                        {d.utilization}% utilization
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* X-axis */}
            <div className="ml-[80px] flex justify-between pt-1 border-t border-[#E5E5E5]">
              {chartTicks.map((tick) => (
                <span key={tick} className="text-[11px] text-[#9CA3AF]">{tick}h</span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-5 mt-3 px-2 border-t border-[#F0F0F0] pt-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-[#10B981]" />
              <span className="text-xs text-[#9CA3AF]">Billable</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-[#FF9500]" />
              <span className="text-xs text-[#9CA3AF]">Internal</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-[#E5E7EB]" />
              <span className="text-xs text-[#9CA3AF]">Untracked</span>
            </div>
          </div>
        </div>
      )}

      {/* Client Profitability Table */}
      {data.clients.length > 0 && (
        <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <h3 className="text-sm font-medium text-[#1A1A1A]">Client Profitability</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Client</th>
                <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Hours</th>
                <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Revenue</th>
                <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Cost</th>
                <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Profit</th>
                <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Margin</th>
                <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Packages</th>
              </tr>
            </thead>
            <tbody>
              {data.clients.map((c) => {
                const isExpanded = expandedClient === c.clientId;
                return (
                  <React.Fragment key={c.clientId}>
                    <tr
                      className={`hover:bg-[var(--hover-tan)] cursor-pointer ${isExpanded ? "" : "border-b border-[var(--border)]"}`}
                      onClick={() => setExpandedClient(isExpanded ? null : c.clientId)}
                    >
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-2">
                          <svg className={`w-3 h-3 text-[#9CA3AF] transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                          <span className="font-medium text-[#1A1A1A]">{c.clientName}</span>
                          {!c.billable && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Non-billable</span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-3 text-right text-[#1A1A1A]">
                        {c.loggedHours.toFixed(1)}h
                        {c.includedHours > 0 && (
                          <span className="text-[#9CA3AF] text-xs ml-1">/ {c.includedHours}h</span>
                        )}
                      </td>
                      <td className="px-2 py-3 text-right text-green-600 font-medium">
                        {fmtMoneyFull(c.revenue)}
                      </td>
                      <td className="px-2 py-3 text-right text-red-400">
                        {fmtMoneyFull(c.costOfDelivery)}
                      </td>
                      <td
                        className={`px-2 py-3 text-right font-semibold ${
                          c.grossProfit >= 0 ? "text-green-600" : "text-red-500"
                        }`}
                      >
                        {fmtMoneyFull(c.grossProfit)}
                      </td>
                      <td className="px-2 py-3 text-right">
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
                      <td className="px-2 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {c.packageCategories.map((cat) => (
                            <span
                              key={cat}
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[cat] || "bg-gray-100 text-gray-600"}`}
                            >
                              {CATEGORY_LABELS[cat] || cat.charAt(0).toUpperCase() + cat.slice(1)}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b border-[var(--border)]">
                        <td colSpan={7} className="px-0 py-0">
                          <div style={{ marginLeft: 8, marginRight: 8, marginBottom: 12, marginTop: 4 }} className="bg-white border border-[#E5E5E5] rounded-xl overflow-hidden">
                            {c.tickets && c.tickets.length > 0 ? (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-[#E5E5E5]">
                                    <th style={{ paddingRight: 32 }} className="text-left px-4 py-2 font-medium text-[var(--muted)]">Ticket</th>
                                    <th className="text-left px-4 py-2 font-medium text-[var(--muted)]">Title</th>
                                    <th style={{ paddingRight: 32 }} className="text-left px-4 py-2 font-medium text-[var(--muted)]">Hours</th>
                                    <th className="text-left px-4 py-2 font-medium text-[var(--muted)]">Team</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {c.tickets.map((t) => (
                                    <tr key={t.ticketId} className="border-t border-[#F0F0F0] hover:bg-[var(--hover-tan)]">
                                      <td style={{ paddingRight: 32 }} className="px-4 py-2">
                                        <a
                                          href={`/admin/tickets?ticket=${t.ticketId}`}
                                          className="text-[#FF9500] font-medium hover:underline"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {t.ticketNumber}
                                        </a>
                                      </td>
                                      <td className="px-4 py-2 text-[#1A1A1A]">{t.title}</td>
                                      <td style={{ paddingRight: 32 }} className="px-4 py-2 text-[#1A1A1A]">{t.hours.toFixed(1)}h</td>
                                      <td className="px-4 py-2 text-[#9CA3AF]">{t.memberNames.join(", ")}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <div className="px-4 py-4 text-xs text-[#9CA3AF]">No tracked tickets this month</div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
