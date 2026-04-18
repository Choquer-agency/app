"use client";

import React, { useState, useEffect, useCallback } from "react";
import { friendlyDate } from "@/lib/date-format";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { VelocityReport } from "@/lib/reports";
import ChartZoomFix from "./ChartZoomFix";

const STATUS_LABELS: Record<string, string> = {
  needs_attention: "Backlog",
  stuck: "Stuck",
  in_progress: "In Progress",
  qa_ready: "QA Ready",
  client_review: "Client Review",
  approved_go_live: "Go Live",
  closed: "Closed",
  complete: "Complete",
};

const STATUS_COLORS: Record<string, string> = {
  needs_attention: "bg-orange-100 text-orange-700",
  stuck: "bg-red-100 text-red-700",
  in_progress: "bg-blue-100 text-blue-700",
  qa_ready: "bg-purple-100 text-purple-700",
  client_review: "bg-amber-100 text-amber-700",
  approved_go_live: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-600",
  complete: "bg-green-100 text-green-700",
};

function fmtDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = Math.round(hours / 24 * 10) / 10;
  return `${days}d`;
}

function resolutionColor(hours: number): string {
  if (hours <= 4) return "#10B981";       // green — under 4h
  if (hours <= 24) return "#3B82F6";      // blue — under 1 day
  if (hours <= 72) return "#F59E0B";      // amber — under 3 days
  if (hours <= 168) return "#F97316";     // orange — under 1 week
  return "#EF4444";                        // red — over 1 week
}

export default function VelocityTab() {
  const [data, setData] = useState<VelocityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [weeks, setWeeks] = useState(12);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reports/velocity?weeks=${weeks}&_t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
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
        <div className="flex items-center bg-[var(--hover-tan)] rounded-lg p-0.5">
          {[4, 8, 12, 24].map((w) => (
            <button
              key={w}
              onClick={() => setWeeks(w)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                weeks === w
                  ? "bg-white text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {w} weeks
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: 12, width: "100%" }}>
        <div style={{ flex: 1 }} className="border border-[#E5E5E5] rounded-xl p-3 bg-white">
          <div className="text-[10px] text-[#9CA3AF] mb-1">Avg Resolution</div>
          <div className="text-2xl font-semibold text-[#1A1A1A]">{fmtDuration(data.overallAvgHours)}</div>
          <div className="text-[10px] text-[#9CA3AF] mt-1">Create to close</div>
        </div>
        <div style={{ flex: 1 }} className="border border-[#E5E5E5] rounded-xl p-3 bg-white">
          <div className="text-[10px] text-[#9CA3AF] mb-1">Tickets Created</div>
          <div className="text-2xl font-semibold text-[#3B82F6]">{data.totalCreated ?? 0}</div>
          <div className="text-[10px] text-[#9CA3AF] mt-1">In this period</div>
        </div>
        <div style={{ flex: 1 }} className="border border-[#E5E5E5] rounded-xl p-3 bg-white">
          <div className="text-[10px] text-[#9CA3AF] mb-1">Tickets Closed</div>
          <div className="text-2xl font-semibold text-[#FF9500]">{data.totalClosed}</div>
          <div className="text-[10px] text-[#9CA3AF] mt-1">In this period</div>
        </div>
        <div style={{ flex: 1 }} className="border border-[#E5E5E5] rounded-xl p-3 bg-white">
          <div className="text-[10px] text-[#9CA3AF] mb-1">Still Open</div>
          <div className="text-2xl font-semibold text-[#1A1A1A]">{data.totalOpen ?? 0}</div>
          <div className="text-[10px] text-[#9CA3AF] mt-1">Across all clients</div>
        </div>
        <div style={{ flex: 1 }} className="border border-[#E5E5E5] rounded-xl p-3 bg-white">
          <div className="text-[10px] text-[#9CA3AF] mb-1">Throughput / Week</div>
          <div className="text-2xl font-semibold text-[#1A1A1A]">{avgThroughput}</div>
          <div className="text-[10px] text-[#9CA3AF] mt-1">Avg tickets closed</div>
        </div>
      </div>

      {/* Created vs Closed per week */}
      {data.weeklyThroughput.length > 0 && (
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-[#1A1A1A]">Created vs Closed Per Week</h3>
            <div className="flex items-center gap-4 text-xs text-[#6B7280]">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-0.5 bg-[#3B82F6] rounded" />
                Created
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-0.5 bg-[#FF9500] rounded" />
                Closed
              </div>
            </div>
          </div>
          <ChartZoomFix><ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.weeklyThroughput} margin={{ left: 0, right: 30, top: 5, bottom: 5 }}>
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
                formatter={(value: number, name: string) => [
                  value,
                  name === "ticketsCreated" ? "Created" : "Closed",
                ]}
              />
              <Line type="monotone" dataKey="ticketsCreated" name="ticketsCreated" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3, fill: "#3B82F6" }} />
              <Line type="monotone" dataKey="ticketsClosed" name="ticketsClosed" stroke="#FF9500" strokeWidth={2} dot={{ r: 3, fill: "#FF9500" }} />
            </LineChart>
          </ResponsiveContainer></ChartZoomFix>
        </div>
      )}

      {/* Resolution by client */}
      {data.avgResolution.length > 0 && (
        <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <h3 className="text-sm font-medium text-[#1A1A1A]">Resolution Time by Client</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Client</th>
                <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Created</th>
                <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Closed</th>
                <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Open</th>
                <th className="px-2 py-2.5 pr-4 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Avg Resolution</th>
              </tr>
            </thead>
            <tbody>
              {data.avgResolution.map((r, i) => {
                const key = r.clientId ?? `none-${i}`;
                const isExpanded = expandedClient === key;
                return (
                  <React.Fragment key={key}>
                    <tr
                      className={`hover:bg-[var(--hover-tan)] cursor-pointer ${isExpanded ? "" : "border-b border-[var(--border)]"}`}
                      onClick={() => setExpandedClient(isExpanded ? null : key)}
                    >
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-2">
                          <svg className={`w-3 h-3 text-[#9CA3AF] transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                          <span className="font-medium text-[#1A1A1A]">{r.clientName || "No Client"}</span>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-right text-[#3B82F6]">{r.ticketsCreated ?? 0}</td>
                      <td className="px-2 py-3 text-right text-[#FF9500]">{r.ticketsClosed}</td>
                      <td className="px-2 py-3 text-right text-[#1A1A1A]">{r.ticketsOpen ?? 0}</td>
                      <td className="px-2 py-3 text-right">
                        {r.ticketsClosed > 0 ? (
                          <div className="flex items-center justify-end gap-2 pr-2">
                            <span className="font-medium text-[#1A1A1A]">{fmtDuration(r.avgResolutionHours)}</span>
                            <span
                              className="inline-block w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: resolutionColor(r.avgResolutionHours) }}
                            />
                          </div>
                        ) : (
                          <span className="text-[#9CA3AF] pr-2">—</span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b border-[var(--border)]">
                        <td colSpan={5} className="px-0 py-0">
                          <div style={{ marginLeft: 32, marginRight: 32, marginBottom: 12, marginTop: 4 }} className="bg-white border border-[#E5E5E5] rounded-xl overflow-hidden">
                            {r.tickets && r.tickets.length > 0 ? (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-[#E5E5E5]">
                                    <th style={{ paddingRight: 32 }} className="text-left px-4 py-2 font-medium text-[var(--muted)]">Ticket</th>
                                    <th className="text-left px-4 py-2 font-medium text-[var(--muted)]">Title</th>
                                    <th style={{ paddingRight: 32 }} className="text-left px-4 py-2 font-medium text-[var(--muted)]">Status</th>
                                    <th style={{ paddingRight: 32 }} className="text-left px-4 py-2 font-medium text-[var(--muted)]">Resolution</th>
                                    <th className="text-left px-4 py-2 font-medium text-[var(--muted)]">Assignee</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {r.tickets.map((t: any) => (
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
                                      <td style={{ paddingRight: 32 }} className="px-4 py-2 whitespace-nowrap">
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[t.status] || "bg-gray-100 text-gray-600"}`}>
                                          {STATUS_LABELS[t.status] || t.status}
                                        </span>
                                      </td>
                                      <td style={{ paddingRight: 32 }} className="px-4 py-2 text-[#1A1A1A]">
                                        {t.resolutionHours != null ? fmtDuration(t.resolutionHours) : "—"}
                                      </td>
                                      <td className="px-4 py-2">
                                        <div className="flex items-center -space-x-1">
                                          {(t.assignees || []).map((a: any, idx: number) => (
                                            a.profilePicUrl ? (
                                              <img
                                                key={idx}
                                                src={a.profilePicUrl}
                                                alt={a.name}
                                                title={a.name}
                                                className="w-5 h-5 rounded-full border border-white object-cover"
                                              />
                                            ) : (
                                              <div
                                                key={idx}
                                                title={a.name}
                                                className="w-5 h-5 rounded-full border border-white bg-[#E5E7EB] flex items-center justify-center text-[8px] font-medium text-[#6B7280]"
                                              >
                                                {a.name?.charAt(0) || "?"}
                                              </div>
                                            )
                                          ))}
                                          {(!t.assignees || t.assignees.length === 0) && (
                                            <span className="text-[#9CA3AF] text-xs">—</span>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <div className="px-4 py-4 text-xs text-[#9CA3AF]">No tickets in this period</div>
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
