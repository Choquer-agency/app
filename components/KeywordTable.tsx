"use client";

import { useState } from "react";
import { KeywordRanking } from "@/types";
import type { SERankingStats } from "@/lib/serankings";
import MetricTooltip from "./MetricTooltip";

interface KeywordTableProps {
  keywords: KeywordRanking[];
  stats: SERankingStats | null;
}

function Sparkline({ data, id }: { data: number[]; id: string }) {
  if (data.length < 2) return null;

  const w = 57;
  const h = 13;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => ({
    x: (i / (data.length - 1)) * w,
    y: h - ((v - min) / range) * h,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const fillPath = `${linePath} L${w},${h} L0,${h} Z`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="mt-1">
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FF9500" stopOpacity={0.2} />
          <stop offset="100%" stopColor="#FF9500" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#spark-${id})`} />
      <path d={linePath} fill="none" stroke="#FF9500" strokeWidth={1} />
    </svg>
  );
}

function ChangeIndicator({ change, invertColor }: { change: number; invertColor?: boolean }) {
  if (change === 0) return null;
  // For avg position, lower is better so we invert the color logic
  const isPositive = invertColor ? change < 0 : change > 0;
  const color = isPositive ? "text-[#0d7a55]" : "text-[#b91c1c]";
  const arrow = isPositive ? "▲" : "▼";
  return (
    <span className={`text-[10px] font-semibold ${color} ml-1.5`}>
      {arrow} {Math.abs(change)}
    </span>
  );
}

export default function KeywordTable({ keywords, stats }: KeywordTableProps) {
  const [showAll, setShowAll] = useState(false);

  // Sort: ranked keywords first (by position asc), then unranked (position 0) at the end
  const sorted = [...keywords].sort((a, b) => {
    if (a.currentPosition === 0 && b.currentPosition === 0) return 0;
    if (a.currentPosition === 0) return 1;
    if (b.currentPosition === 0) return -1;
    return a.currentPosition - b.currentPosition;
  });
  const displayed = showAll ? sorted : sorted.slice(0, 5);

  return (
    <section id="keywords-section" className="mb-8" data-track="keywords">
      <h2 className="text-base font-semibold mb-3">Keyword Rankings</h2>

      {stats && (
        <div className="flex gap-0 border border-[#E5E5E5] rounded-xl bg-white mb-4">
          {/* Avg Position */}
          <div className="flex-1 px-3 py-3 text-center border-r border-[#E5E5E5]">
            <p className="text-[10px] text-muted font-medium uppercase tracking-wide">
              <MetricTooltip label="Avg. Position" tooltip="Average ranking position across all tracked keywords. Lower is better — focus on the trend moving down over time rather than the absolute number" />
            </p>
            <div className="flex items-baseline justify-center mt-0.5">
              <p className="text-lg font-bold">{stats.avgPosition}</p>
              <ChangeIndicator change={stats.avgPositionChange} invertColor />
            </div>
            <div className="flex justify-center">
              <Sparkline data={stats.avgPositionHistory} id="avg" />
            </div>
          </div>

          {/* Top 3 */}
          <div className="flex-1 px-3 py-3 text-center border-r border-[#E5E5E5]">
            <p className="text-[10px] text-muted font-medium uppercase tracking-wide">
              <MetricTooltip label="Top 3" tooltip="Number of keywords ranking in positions 1–3 on Google — the most valuable spots for driving clicks" />
            </p>
            <div className="flex items-baseline justify-center mt-0.5">
              <p className="text-lg font-bold">{stats.top3}</p>
              <ChangeIndicator change={stats.top3Change} />
            </div>
            <div className="flex justify-center">
              <Sparkline data={stats.top3History} id="top3" />
            </div>
          </div>

          {/* Organic Keywords */}
          <div className="flex-1 px-3 py-3 text-center border-r border-[#E5E5E5]">
            <p className="text-[10px] text-muted font-medium uppercase tracking-wide">
              <MetricTooltip label="Organic Keywords" tooltip="Total number of keywords your site currently ranks for in Google Search" />
            </p>
            <div className="flex items-baseline justify-center mt-0.5">
              <p className="text-lg font-bold">{stats.organicKeywords}</p>
            </div>
            <div className="flex justify-center">
              <Sparkline data={stats.organicKeywordsHistory} id="organic" />
            </div>
          </div>

          {/* Position Distribution */}
          <div className="flex-1 px-3 py-3">
            <p className="text-[10px] text-muted font-medium uppercase tracking-wide text-center mb-1.5">
              <MetricTooltip label="Distribution" tooltip="How your keywords are spread across ranking positions — Top 10 (page 1), Top 30 (pages 1–3), and Top 100" />
            </p>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Top 10</span>
                <span className="font-semibold">{stats.top10}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Top 30</span>
                <span className="font-semibold">{stats.top30}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Top 100</span>
                <span className="font-semibold">{stats.top100}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="border border-[#E5E5E5] rounded-xl overflow-hidden bg-[#FAFAFA]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E5E5E5] bg-white text-xs text-muted relative z-10">
              <th className="px-4 py-2.5 text-left font-medium">
                <MetricTooltip label="Keyword" tooltip="Search terms your site is being tracked for in Google" />
              </th>
              <th className="px-3 py-2.5 text-left font-medium w-16">
                <MetricTooltip label="Pos." tooltip="Current Google ranking position for this keyword — lower is better" />
              </th>
              <th className="px-3 py-2.5 text-left font-medium w-16">
                <MetricTooltip label="Change" tooltip="Position change since last check — green means improved ranking" />
              </th>
              <th className="px-3 py-2.5 text-left font-medium w-16">
                <MetricTooltip label="Vol." tooltip="Monthly search volume — how many people search for this keyword each month" />
              </th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((kw, i) => (
              <tr
                key={kw.id}
                className={`${
                  i < displayed.length - 1 || sorted.length > 5 ? "border-b border-[#F0F0F0]" : ""
                } bg-white group/row hover:bg-[#FFFAF5] transition-colors cursor-default`}
              >
                <td className="px-4 py-2 text-sm text-[#1A1A1A] group-hover/row:text-[#FF9500] transition-colors">{kw.keyword}</td>
                <td className="px-3 py-2 text-sm font-medium">{kw.currentPosition > 0 ? kw.currentPosition : <span className="text-muted">--</span>}</td>
                <td className="px-3 py-2">
                  {kw.change > 0 ? (
                    <span className="text-xs font-semibold text-[#0d7a55]">+{kw.change}</span>
                  ) : kw.change < 0 ? (
                    <span className="text-xs font-semibold text-[#b91c1c]">{kw.change}</span>
                  ) : (
                    <span className="text-xs text-muted">--</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-muted">{kw.searchVolume.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {sorted.length > 5 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="w-full py-2.5 text-xs text-muted hover:text-[#FF9500] transition bg-white border-t border-[#E5E5E5] font-medium"
            data-track="accordion"
          >
            {showAll ? "Show less" : `Show all ${sorted.length} keywords`}
          </button>
        )}
      </div>
    </section>
  );
}
