"use client";

import { useState, useEffect, useCallback } from "react";
import type { UtilizationReport } from "@/lib/reports";

interface UtilizationTabProps {
  start: string;
  end: string;
}

function fmtHours(h: number | undefined | null): string {
  const n = Number(h ?? 0);
  if (n >= 100) return `${Math.round(n)}h`;
  return `${n.toFixed(1)}h`;
}

export default function UtilizationTab({ start, end }: UtilizationTabProps) {
  const [data, setData] = useState<UtilizationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reports/utilization?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&_t=${Date.now()}`, { cache: "no-store" });
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

  // Find max clocked hours for scaling bars
  const maxHours = Math.max(...data.members.map((m) => Math.max(Number(m.clockedHours ?? 0), Number(m.totalHours ?? 0), 1)));
  // Round up to a nice number for the axis
  const axisMax = Math.ceil(maxHours / 10) * 10 || 40;
  const axisTicks = Array.from({ length: 5 }, (_, i) => Math.round((axisMax / 4) * i));

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
          <div className="text-xs text-[#9CA3AF] mb-1">Logged / Clocked</div>
          <div className="text-2xl font-semibold text-[#1A1A1A]">
            {fmtHours(data.totalTeamHours)}
            <span className="text-[#9CA3AF] font-normal"> / {fmtHours(data.totalClockedHours)}</span>
          </div>
        </div>
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
          <div className="text-xs text-[#9CA3AF] mb-1">Avg Utilization</div>
          <div className="text-2xl font-semibold text-[#1A1A1A]">
            {(data.totalClockedHours ?? 0) > 0
              ? `${Math.round((data.totalTeamHours / data.totalClockedHours) * 100)}%`
              : "0%"}
          </div>
          <div className="text-xs text-[#9CA3AF] mt-0.5">% of clocked time logged to tickets</div>
        </div>
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
          <div className="text-xs text-[#9CA3AF] mb-1">Most Utilized</div>
          <div className="text-2xl font-semibold text-[#1A1A1A] truncate">
            {data.members[0]?.memberName.split(" ")[0] || "—"}
          </div>
          <div className="text-xs text-[#9CA3AF]">{data.members[0]?.utilizationPct || 0}%</div>
        </div>
      </div>

      {/* Logged vs clocked bar chart — pure HTML */}
      <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-[#1A1A1A]">Logged vs Clocked Hours</h3>
          <div className="flex items-center gap-4 text-xs text-[#6B7280]">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-[#FF9500]" />
              Logged
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-3 rounded-sm border border-[#FCD34D]"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(45deg, #FCD34D 0, #FCD34D 2px, #FEF3C7 2px, #FEF3C7 4px)",
                }}
              />
              Unlogged
            </div>
          </div>
        </div>

        <div className="relative">
          {/* Grid lines */}
          <div className="absolute inset-0 ml-[80px]" style={{ pointerEvents: "none" }}>
            {axisTicks.map((tick) => (
              <div
                key={tick}
                className="absolute top-0 bottom-6 border-l border-dashed border-[#F0F0F0]"
                style={{ left: `${(tick / axisMax) * 100}%` }}
              />
            ))}
          </div>

          {/* Bars */}
          <div className="space-y-0">
            {data.members.map((m, idx) => {
              const logged = Number(m.totalHours ?? 0);
              const clocked = Number(m.clockedHours ?? 0);
              const gap = Math.max(0, clocked - logged);
              const loggedPct = (logged / axisMax) * 100;
              const gapPct = (gap / axisMax) * 100;
              const isHovered = hoverIndex === idx;

              return (
                <div
                  key={m.teamMemberId}
                  className="relative flex items-center gap-0 group"
                  style={{
                    padding: "10px 0",
                    backgroundColor: isHovered ? "var(--hover-tan)" : "transparent",
                    transition: "background-color 0.15s",
                  }}
                  onMouseEnter={() => setHoverIndex(idx)}
                  onMouseLeave={() => setHoverIndex(null)}
                >
                  {/* Name */}
                  <div className="w-[80px] shrink-0 text-xs text-[#1A1A1A] font-medium text-right pr-3">
                    {m.memberName.split(" ")[0]}
                  </div>

                  {/* Bar area */}
                  <div style={{ flex: 1, height: 28, position: "relative", overflow: "visible" }}>
                    {/* Logged segment */}
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        height: 28,
                        width: `${loggedPct}%`,
                        backgroundColor: "#FF9500",
                        borderRadius: gapPct > 0 ? "0" : "0 6px 6px 0",
                        minWidth: logged > 0 ? 2 : 0,
                      }}
                    />
                    {/* Gap (unlogged) segment */}
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: `${loggedPct}%`,
                        height: 28,
                        width: `${gapPct}%`,
                        borderRadius: "0 6px 6px 0",
                        backgroundImage: gap > 0
                          ? "repeating-linear-gradient(45deg, #FCD34D 0, #FCD34D 2px, #FEF3C7 2px, #FEF3C7 4px)"
                          : "none",
                        minWidth: gap > 0 ? 2 : 0,
                      }}
                    />
                  </div>

                  {/* Tooltip */}
                  {isHovered && (
                    <div className="absolute z-10 bg-white rounded-lg border border-[#E5E5E5] px-3 py-2 shadow-sm text-xs pointer-events-none" style={{ right: "15%", top: -4 }}>
                      <div className="font-medium text-[#1A1A1A] mb-1">{m.memberName.split(" ")[0]}</div>
                      <div className="flex items-center gap-1.5 text-[#FF9500]">
                        <span className="inline-block w-2 h-2 rounded-sm bg-[#FF9500]" />
                        Logged: {logged.toFixed(1)}h
                      </div>
                      {gap > 0 && (
                        <div className="flex items-center gap-1.5 text-[#D97706] mt-0.5">
                          <span
                            className="inline-block w-2 h-2 rounded-sm"
                            style={{
                              backgroundImage:
                                "repeating-linear-gradient(45deg, #FCD34D 0, #FCD34D 1px, #FEF3C7 1px, #FEF3C7 2px)",
                            }}
                          />
                          Unlogged: {gap.toFixed(1)}h
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* X-axis labels */}
          <div className="ml-[80px] flex justify-between pt-1 border-t border-[#E5E5E5]">
            {axisTicks.map((tick) => (
              <span key={tick} className="text-[11px] text-[#9CA3AF]">{tick}h</span>
            ))}
          </div>
        </div>
      </div>

      {/* Detail table */}
      <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Team Member</th>
              <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Logged</th>
              <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Clocked</th>
              <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Goal</th>
              <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Utilization</th>
            </tr>
          </thead>
          <tbody>
            {data.members.map((m) => (
              <tr key={m.teamMemberId} className="border-b border-[var(--border)] hover:bg-[var(--hover-tan)]">
                <td className="px-2 py-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: m.memberColor || "#6B7280" }}
                    />
                    <span className="text-[#1A1A1A] font-medium">{m.memberName}</span>
                  </div>
                </td>
                <td className="px-2 py-3 text-right text-[#1A1A1A]">{fmtHours(m.totalHours)}</td>
                <td className="px-2 py-3 text-right text-[#1A1A1A]">{fmtHours(m.clockedHours)}</td>
                <td className="px-2 py-3 text-right text-[#9CA3AF]">{fmtHours(m.availableHours)}</td>
                <td className="px-2 py-3 text-right">
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
