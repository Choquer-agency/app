"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { MonthlySnapshot } from "@/types";

interface HistoricalChartProps {
  snapshot: MonthlySnapshot;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function HistoricalChart({ snapshot }: HistoricalChartProps) {
  const keywordsTotal = snapshot.keywordData?.length || 0;
  const keywordsImproved = snapshot.keywordData?.filter((k) => k.change > 0).length || 0;

  return (
    <div className="space-y-4 pt-2">
      {/* Quick stats for this month */}
      {snapshot.kpiSummary && snapshot.kpiSummary.length > 0 && (
        <div className="flex gap-4 flex-wrap">
          {snapshot.kpiSummary.map((kpi) => (
            <div key={kpi.label} className="text-xs">
              <span className="text-muted">{kpi.label}: </span>
              <span className="font-medium">{kpi.value.toLocaleString()}</span>
              <span className={`ml-1 ${kpi.changePercent >= 0 ? "text-success" : "text-danger"}`}>
                {kpi.changePercent >= 0 ? "+" : ""}{kpi.changePercent.toFixed(1)}%
              </span>
            </div>
          ))}
          {keywordsTotal > 0 && (
            <div className="text-xs">
              <span className="text-muted">Keywords: </span>
              <span className="font-medium">{keywordsTotal} tracked</span>
              <span className="text-success ml-1">{keywordsImproved} improved</span>
            </div>
          )}
        </div>
      )}

      {/* Compact charts side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {snapshot.gscData?.timeSeries && snapshot.gscData.timeSeries.length > 0 && (
          <div>
            <p className="text-[10px] text-muted mb-1">Clicks & Impressions</p>
            <ResponsiveContainer width="100%" height={100}>
              <LineChart data={snapshot.gscData.timeSeries}>
                <XAxis dataKey="date" tickFormatter={fmtDate} fontSize={9} tick={{ fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                <YAxis fontSize={9} tick={{ fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={30} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                <Line type="monotone" dataKey="clicks" stroke="#FF9500" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="impressions" stroke="#B1D0FF" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {snapshot.ga4Data?.timeSeries && snapshot.ga4Data.timeSeries.length > 0 && (
          <div>
            <p className="text-[10px] text-muted mb-1">Organic Sessions</p>
            <ResponsiveContainer width="100%" height={100}>
              <LineChart data={snapshot.ga4Data.timeSeries}>
                <XAxis dataKey="date" tickFormatter={fmtDate} fontSize={9} tick={{ fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                <YAxis fontSize={9} tick={{ fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={30} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                <Line type="monotone" dataKey="organicSessions" stroke="#A69FFF" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Top keywords at that time */}
      {snapshot.keywordData && snapshot.keywordData.length > 0 && (
        <div>
          <p className="text-[10px] text-muted mb-1">Top Keywords (at that time)</p>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            {snapshot.keywordData.slice(0, 5).map((kw) => (
              <span key={kw.id} className="text-xs">
                {kw.keyword}{" "}
                <span className="text-muted">#{kw.currentPosition}</span>
                {kw.change !== 0 && (
                  <span className={`ml-0.5 ${kw.change > 0 ? "text-success" : "text-danger"}`}>
                    {kw.change > 0 ? "+" : ""}{kw.change}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
