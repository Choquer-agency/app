"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import type { ChartHint } from "@/types/enrichment";

interface Props {
  hint: ChartHint;
}

const METRIC_LABELS: Record<string, string> = {
  ga4_organic_sessions: "Organic sessions",
  gsc_clicks: "Clicks",
  gsc_impressions: "Impressions",
  se_ranking_position: "Ranking position",
};

function formatDate(d: string) {
  if (!d) return "";
  const parts = d.split("-");
  if (parts.length !== 3) return d;
  return `${parts[1]}/${parts[2]}`;
}

export default function InlineMetricChart({ hint }: Props) {
  const series = hint.series || [];
  if (!series.length) return null;

  const total = series.reduce((sum, p) => sum + (p.value || 0), 0);
  const label = METRIC_LABELS[hint.metric] || hint.metric;

  return (
    <div className="mt-2 bg-[#FAFCFF] border border-[#E5E5E5] rounded-lg px-3 py-2">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wide text-[#6B705C] font-medium">
          {hint.caption || label}
        </span>
        <span className="text-[10px] text-[#888]">
          {label}: {Math.round(total).toLocaleString()}
        </span>
      </div>
      <div style={{ width: "100%", height: 80 }}>
        <ResponsiveContainer>
          <LineChart data={series} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 9, fill: "#888" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip
              formatter={(value: number) => [Math.round(value).toLocaleString(), label]}
              labelFormatter={(l) => l}
              contentStyle={{ fontSize: 11, padding: "4px 8px" }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#FF9500"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
