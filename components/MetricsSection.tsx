"use client";

import { useState, useEffect } from "react";
import { DateRange, KPIData, TimeSeriesPoint, TopPage, KeywordRanking } from "@/types";
import DateRangeSelector from "./DateRangeSelector";
import KPICards from "./KPICards";
import TrafficCharts from "./TrafficCharts";
import KeywordTable from "./KeywordTable";

interface TrafficChannel {
  channel: string;
  users: number;
  sessions: number;
  newUsers: number;
}

interface MetricsSectionProps {
  initialKpis: KPIData[];
  initialUsersTimeSeries: TimeSeriesPoint[];
  initialTrafficChannels: TrafficChannel[];
  initialTopPages: TopPage[];
  initialKeywords: KeywordRanking[];
  clientSlug: string;
  initialRange: DateRange;
}

export default function MetricsSection({
  initialKpis,
  initialUsersTimeSeries,
  initialTrafficChannels,
  initialTopPages,
  initialKeywords,
  clientSlug,
  initialRange,
}: MetricsSectionProps) {
  const [range, setRange] = useState<DateRange>(initialRange);
  const [kpis, setKpis] = useState(initialKpis);
  const [usersTimeSeries, setUsersTimeSeries] = useState(initialUsersTimeSeries);
  const [trafficChannels, setTrafficChannels] = useState(initialTrafficChannels);
  const [topPages, setTopPages] = useState(initialTopPages);
  const [loading, setLoading] = useState(false);

  async function handleRangeChange(newRange: DateRange) {
    setRange(newRange);
    setLoading(true);
    try {
      const res = await fetch(`/api/metrics?slug=${clientSlug}&range=${newRange}`);
      if (res.ok) {
        const data = await res.json();
        if (data.kpis) setKpis(data.kpis);
        if (data.usersTimeSeries) setUsersTimeSeries(data.usersTimeSeries);
        if (data.trafficChannels) setTrafficChannels(data.trafficChannels);
        if (data.topPages) setTopPages(data.topPages);
      }
    } catch {} finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold">Performance Snapshot</h2>
        <DateRangeSelector value={range} onChange={handleRangeChange} />
      </div>

      {loading && <p className="text-xs text-muted mb-2">Updating metrics...</p>}

      <KPICards kpis={kpis} />
      <TrafficCharts
        usersTimeSeries={usersTimeSeries}
        trafficChannels={trafficChannels}
        topPages={topPages}
      />
      <KeywordTable keywords={initialKeywords} />
    </>
  );
}
