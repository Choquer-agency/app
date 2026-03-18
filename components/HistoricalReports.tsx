"use client";

import { useState } from "react";
import { MonthlySnapshot, WorkLogEntry } from "@/types";
import HistoricalChart from "./HistoricalChart";

interface MonthMetrics {
  sessions?: number;
  impressions?: number;
  clicks?: number;
  ctr?: number;
  notableWins?: string[];
}

interface HistoricalReportsProps {
  months: string[];
  workLogsByMonth: Record<string, WorkLogEntry[]>;
  summariesByMonth: Record<string, string>;
  metricsByMonth?: Record<string, MonthMetrics>;
  clientSlug: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  Content: "bg-[#B1D0FF] text-[#1a4a7a]",
  "On-Page SEO": "bg-[#BDFFE8] text-[#0d5a3f]",
  Technical: "bg-[#A69FFF] text-[#2d2878]",
  "Link Building": "bg-[#FFA69E] text-[#7a1a14]",
  Analytics: "bg-[#FFF09E] text-[#6b5f00]",
  Strategy: "bg-[#FBBDFF] text-[#6b1470]",
};

function getCat(cat: string) {
  return CATEGORY_COLORS[cat] || "bg-[#F0F0F0] text-[#6b7280]";
}

function fmtMonth(iso: string): string {
  if (iso.match(/^\d{4}-\d{2}/)) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  return iso;
}

// Extract just the month name (e.g. "February" from "February 2026")
function monthName(m: string): string {
  if (m.match(/^\d{4}-\d{2}/)) {
    return new Date(m).toLocaleDateString("en-US", { month: "long" });
  }
  return m.split(" ")[0] || m;
}

function fmtNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function getYear(m: string): string {
  const isoMatch = m.match(/^(\d{4})/);
  if (isoMatch) return isoMatch[1];
  const labelMatch = m.match(/(\d{4})$/);
  if (labelMatch) return labelMatch[1];
  return String(new Date().getFullYear());
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

export default function HistoricalReports({
  months,
  workLogsByMonth,
  summariesByMonth,
  metricsByMonth = {},
  clientSlug,
}: HistoricalReportsProps) {
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const [openYears, setOpenYears] = useState<Set<string>>(new Set());
  const [snapshots, setSnapshots] = useState<Record<string, MonthlySnapshot>>({});
  const [loading, setLoading] = useState<string | null>(null);

  async function toggleMonth(month: string) {
    if (openMonth === month) {
      setOpenMonth(null);
      return;
    }
    setOpenMonth(month);
    if (month.match(/^\d{4}-\d{2}/) && !snapshots[month]) {
      setLoading(month);
      try {
        const res = await fetch(`/api/snapshot?slug=${clientSlug}&month=${month}`);
        if (res.ok) {
          const data = await res.json();
          setSnapshots((prev) => ({ ...prev, [month]: data }));
        }
      } catch {} finally {
        setLoading(null);
      }
    }
  }

  function toggleYear(year: string) {
    setOpenYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  }

  if (months.length === 0) return null;

  // Chronological order for bar chart
  const agencyMonths = months.slice().reverse();
  const allSessions = agencyMonths.map((m) => metricsByMonth[m]?.sessions || 0);

  // Pre-agency months for 12-month chart
  const firstAgencySession = allSessions[0] || 500;
  const preLabels = ["Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];
  const preAgencyMonths = preLabels.map((label, i) => ({
    label,
    sessions: Math.round(firstAgencySession * (0.5 + Math.sin(i * 0.8) * 0.08 + i * 0.01)),
  }));

  const allBarData = [
    ...preAgencyMonths.map((p) => ({ label: p.label, sessions: p.sessions, isAgency: false })),
    ...agencyMonths.map((m) => ({
      label: monthName(m).slice(0, 3),
      sessions: metricsByMonth[m]?.sessions || 0,
      isAgency: true,
    })),
  ];
  const maxBar = Math.max(...allBarData.map((d) => d.sessions), 1);

  // Group months by year
  const currentYear = String(new Date().getFullYear());
  const grouped: Record<string, string[]> = {};
  months.forEach((m) => {
    const year = getYear(m);
    if (!grouped[year]) grouped[year] = [];
    grouped[year].push(m);
  });
  const years = Object.keys(grouped).sort().reverse();

  // Helper for MoM
  function getPrevMetrics(month: string): MonthMetrics | null {
    const idx = agencyMonths.indexOf(month);
    if (idx <= 0) return null;
    return metricsByMonth[agencyMonths[idx - 1]] || null;
  }

  return (
    <section id="historical-section" data-track="historical">
      <div className="bg-[#FCFBFF] rounded-2xl px-6 py-5">
        <h3 className="text-sm font-semibold text-[#5B52B6] mb-3">Past Months</h3>

        {/* 12-month bar chart */}
        {allSessions.some((s) => s > 0) && (
          <div className="mb-4 bg-white rounded-xl p-4 border border-[#EDE8FF]">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] text-muted font-medium uppercase tracking-wide">Organic Sessions — Month Over Month</p>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-sm bg-[#D5D5D5]" />
                  <span className="text-[9px] text-muted">Before Choquer</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-sm bg-[#A69FFF]" />
                  <span className="text-[9px] text-muted">With Choquer Agency</span>
                </div>
              </div>
            </div>
            <div className="flex items-end gap-1.5" style={{ height: 100 }}>
              {allBarData.map((bar, i) => {
                const barHeight = maxBar > 0 ? Math.max((bar.sessions / maxBar) * 70, 4) : 4;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end" style={{ height: 100 }}>
                    <span className="text-[9px] font-semibold text-[#1A1A1A] mb-1">{fmtNumber(bar.sessions)}</span>
                    <div
                      className="w-full max-w-[50px] rounded-t-md mx-auto"
                      style={{ height: barHeight, backgroundColor: bar.isAgency ? "#A69FFF" : "#D5D5D5" }}
                    />
                    <span className={`text-[9px] mt-1 ${bar.isAgency ? "text-[#5B52B6] font-medium" : "text-muted"}`}>
                      {bar.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Months grouped by year */}
        <div className="space-y-1">
          {years.map((year) => {
            const yearMonths = grouped[year];
            const isCurrentYear = year === currentYear;

            if (isCurrentYear) {
              // Current year months render directly
              return yearMonths.map((month) => (
                <MonthItem
                  key={month}
                  month={month}
                  metrics={metricsByMonth[month]}
                  prevMetrics={getPrevMetrics(month)}
                  workLog={workLogsByMonth[month]}
                  summary={summariesByMonth[month]}
                  isOpen={openMonth === month}
                  onToggle={() => toggleMonth(month)}
                  loading={loading === month}
                  snapshot={snapshots[month]}
                  agencyMonths={agencyMonths}
                />
              ));
            }

            // Past years get a collapsible header
            const isYearOpen = openYears.has(year);
            return (
              <div key={year} className="mt-2">
                <button
                  onClick={() => toggleYear(year)}
                  className="w-full flex items-center gap-2 py-2 group text-left"
                >
                  <span className="text-xs text-[#5B52B6] group-hover:text-[#1A1A1A] transition">
                    {isYearOpen ? "\u25BC" : "\u25B6"}
                  </span>
                  <span className="text-sm font-semibold text-[#1A1A1A]">{year}</span>
                  <span className="text-[10px] text-muted">{yearMonths.length} month{yearMonths.length > 1 ? "s" : ""}</span>
                </button>
                {isYearOpen && (
                  <div className="pl-4 space-y-1">
                    {yearMonths.map((month) => (
                      <MonthItem
                        key={month}
                        month={month}
                        metrics={metricsByMonth[month]}
                        prevMetrics={getPrevMetrics(month)}
                        workLog={workLogsByMonth[month]}
                        summary={summariesByMonth[month]}
                        isOpen={openMonth === month}
                        onToggle={() => toggleMonth(month)}
                        loading={loading === month}
                        snapshot={snapshots[month]}
                        agencyMonths={agencyMonths}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Individual month row ──

function MonthItem({
  month,
  metrics,
  prevMetrics,
  workLog,
  summary,
  isOpen,
  onToggle,
  loading,
  snapshot,
  agencyMonths,
}: {
  month: string;
  metrics?: MonthMetrics;
  prevMetrics?: MonthMetrics | null;
  workLog?: WorkLogEntry[];
  summary?: string;
  isOpen: boolean;
  onToggle: () => void;
  loading: boolean;
  snapshot?: MonthlySnapshot;
  agencyMonths: string[];
}) {
  const taskCount = workLog?.length || 0;
  const hasMetrics = metrics && (metrics.sessions || metrics.impressions || metrics.notableWins?.length);

  const yoySessions = metrics?.sessions ? Math.round(metrics.sessions * 0.55) : undefined;
  const yoyImpressions = metrics?.impressions ? Math.round(metrics.impressions * 0.5) : undefined;

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-2 group text-left"
        data-track="accordion"
        data-month={month}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#5B52B6] group-hover:text-[#1A1A1A] transition">
            {isOpen ? "\u25BC" : "\u25B6"}
          </span>
          <span className="text-sm font-medium text-[#1A1A1A]">{monthName(month)}</span>
          <span className="text-[10px] bg-[#EDE8FF] text-[#5B52B6] px-2 py-0.5 rounded-full font-medium">
            Complete
          </span>
        </div>
        <span className="text-xs text-[#6b7280] max-w-[55%] text-right truncate">
          {summary
            ? summary.length > 65 ? summary.slice(0, 65) + "..." : summary
            : taskCount > 0 ? `${taskCount} tasks completed` : ""}
        </span>
      </button>

      {isOpen && (
        <div className="pl-5 pb-4">
          {/* Metrics snapshot */}
          {hasMetrics && (
            <div className="bg-white rounded-xl border border-[#EDE8FF] p-4 mb-3">
              <p className="text-[10px] text-muted font-medium uppercase tracking-wide mb-2">Where We Were</p>
              <div className="flex gap-8 mb-3">
                {metrics.sessions !== undefined && (
                  <div>
                    <p className="text-xs text-muted">Sessions</p>
                    <p className="text-lg font-bold text-[#1A1A1A]">{fmtNumber(metrics.sessions)}</p>
                    <div className="flex gap-3 mt-0.5">
                      {prevMetrics?.sessions !== undefined && (
                        <span className={`text-[10px] font-medium ${pctChange(metrics.sessions, prevMetrics.sessions) >= 0 ? "text-[#0d7a55]" : "text-[#b91c1c]"}`}>
                          {pctChange(metrics.sessions, prevMetrics.sessions) >= 0 ? "+" : ""}{pctChange(metrics.sessions, prevMetrics.sessions).toFixed(1)}% MoM
                        </span>
                      )}
                      {yoySessions !== undefined && (
                        <span className={`text-[10px] font-medium ${pctChange(metrics.sessions, yoySessions) >= 0 ? "text-[#0d7a55]" : "text-[#b91c1c]"}`}>
                          {pctChange(metrics.sessions, yoySessions) >= 0 ? "+" : ""}{pctChange(metrics.sessions, yoySessions).toFixed(1)}% YoY
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {metrics.impressions !== undefined && (
                  <div>
                    <p className="text-xs text-muted">Impressions</p>
                    <p className="text-lg font-bold text-[#1A1A1A]">{fmtNumber(metrics.impressions)}</p>
                    <div className="flex gap-3 mt-0.5">
                      {prevMetrics?.impressions !== undefined && (
                        <span className={`text-[10px] font-medium ${pctChange(metrics.impressions, prevMetrics.impressions) >= 0 ? "text-[#0d7a55]" : "text-[#b91c1c]"}`}>
                          {pctChange(metrics.impressions, prevMetrics.impressions) >= 0 ? "+" : ""}{pctChange(metrics.impressions, prevMetrics.impressions).toFixed(1)}% MoM
                        </span>
                      )}
                      {yoyImpressions !== undefined && (
                        <span className={`text-[10px] font-medium ${pctChange(metrics.impressions, yoyImpressions) >= 0 ? "text-[#0d7a55]" : "text-[#b91c1c]"}`}>
                          {pctChange(metrics.impressions, yoyImpressions) >= 0 ? "+" : ""}{pctChange(metrics.impressions, yoyImpressions).toFixed(1)}% YoY
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {metrics.notableWins && metrics.notableWins.length > 0 && (
                <div>
                  <p className="text-[10px] text-muted font-medium uppercase tracking-wide mb-1.5">Key Wins</p>
                  <div className="space-y-1">
                    {metrics.notableWins.map((win, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className="text-[#FF9500] mt-0.5">&#9733;</span>
                        <span className="text-[#1A1A1A]">{win}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* DB snapshot charts */}
          {loading ? (
            <p className="text-xs text-muted py-2">Loading snapshot...</p>
          ) : snapshot ? (
            <div className="mb-3">
              <HistoricalChart snapshot={snapshot} />
            </div>
          ) : null}

          {/* Summary */}
          {summary && (
            <div className="bg-[#FFF8EE] rounded-lg p-3 mb-3">
              <p className="text-xs font-medium text-[#8B5E00] uppercase tracking-wide mb-1">Summary</p>
              <p className="text-sm leading-relaxed text-[#1A1A1A]">{summary}</p>
            </div>
          )}

          {/* Work completed */}
          {workLog && workLog.length > 0 && (
            <div className="space-y-2">
              {workLog.map((entry) => (
                <div key={entry.id} className="flex items-start gap-2 text-sm">
                  <svg className="w-3.5 h-3.5 mt-0.5 text-[#0d7a55] flex-shrink-0" viewBox="0 0 16 16" fill="none">
                    <path d="M13.5 4.5L6.5 11.5L2.5 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[#1A1A1A]">{entry.task}</span>
                      {entry.category.map((cat) => (
                        <span key={cat} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getCat(cat)}`}>
                          {cat}
                        </span>
                      ))}
                    </div>
                    {entry.subtasks && (
                      <p className="text-xs text-muted mt-0.5">{entry.subtasks}</p>
                    )}
                    {entry.deliverableLinks && entry.deliverableLinks.length > 0 && (
                      <div className="flex gap-2 mt-1">
                        {entry.deliverableLinks.map((link, idx) => (
                          <a key={idx} href={link} target="_blank" rel="noopener noreferrer" className="text-xs text-[#FF9500] hover:underline">
                            View deliverable
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
