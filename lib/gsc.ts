import { getSearchConsoleClient } from "./google-auth";
import { cachedFetch } from "./cache";
import { GSCPerformance, TimeSeriesPoint, TopPage } from "@/types";

const CACHE_TTL = 14400; // 4 hours

function dateString(d: Date): string {
  return d.toISOString().split("T")[0];
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return dateString(d);
}

/**
 * Get GSC performance summary for a date range
 */
export async function getGSCPerformance(
  siteUrl: string,
  startDate: string,
  endDate: string
): Promise<GSCPerformance> {
  return cachedFetch(`gsc:perf:${siteUrl}:${startDate}:${endDate}`, CACHE_TTL, async () => {
    const client = getSearchConsoleClient();
    const res = await client.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: [],
        rowLimit: 1,
      },
    });

    const row = res.data.rows?.[0];
    return {
      clicks: row?.clicks ?? 0,
      impressions: row?.impressions ?? 0,
      ctr: row?.ctr ?? 0,
      position: row?.position ?? 0,
    };
  });
}

/**
 * Get daily clicks + impressions time series
 */
export async function getGSCTimeSeries(
  siteUrl: string,
  startDate: string,
  endDate: string
): Promise<TimeSeriesPoint[]> {
  return cachedFetch(`gsc:ts:${siteUrl}:${startDate}:${endDate}`, CACHE_TTL, async () => {
    const client = getSearchConsoleClient();
    const res = await client.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ["date"],
        rowLimit: 25000,
      },
    });

    return (res.data.rows || []).map((row) => ({
      date: row.keys![0],
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
    }));
  });
}

/**
 * Get top pages by clicks
 */
export async function getGSCTopPages(
  siteUrl: string,
  startDate: string,
  endDate: string,
  limit = 10
): Promise<TopPage[]> {
  return cachedFetch(`gsc:pages:${siteUrl}:${startDate}:${endDate}:${limit}`, CACHE_TTL, async () => {
    const client = getSearchConsoleClient();
    const res = await client.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ["page"],
        rowLimit: limit,
      },
    });

    return (res.data.rows || []).map((row) => ({
      page: row.keys![0],
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: (row.ctr ?? 0) * 100,
      position: row.position ?? 0,
    }));
  });
}

/**
 * Get GSC KPI data for a given range vs prior equivalent period
 */
export async function getGSCKPIs(siteUrl: string, range = "28d") {
  const { startDate, endDate } = getDateRange(range);
  const startD = new Date(startDate);
  const endD = new Date(endDate);
  const daySpan = Math.round((endD.getTime() - startD.getTime()) / 86400000);
  const prevEnd = daysAgo(daySpan + 2);
  const prevStart = daysAgo(daySpan * 2 + 2);

  const [current, previous] = await Promise.all([
    getGSCPerformance(siteUrl, startDate, endDate),
    getGSCPerformance(siteUrl, prevStart, prevEnd),
  ]);

  function pctChange(curr: number, prev: number): number {
    if (prev === 0) return 0;
    return ((curr - prev) / prev) * 100;
  }

  return {
    clicks: {
      label: "Total Clicks",
      value: current.clicks,
      previousValue: previous.clicks,
      changePercent: pctChange(current.clicks, previous.clicks),
      format: "number" as const,
    },
    impressions: {
      label: "Total Impressions",
      value: current.impressions,
      previousValue: previous.impressions,
      changePercent: pctChange(current.impressions, previous.impressions),
      format: "number" as const,
    },
  };
}

/**
 * Get time series for a given date range option
 */
export function getDateRange(range: string): { startDate: string; endDate: string } {
  const endDate = daysAgo(2); // GSC ~2 day delay
  switch (range) {
    case "7d":
      return { startDate: daysAgo(9), endDate };
    case "28d":
      return { startDate: daysAgo(30), endDate };
    case "3m":
      return { startDate: daysAgo(92), endDate };
    case "12m":
      return { startDate: daysAgo(367), endDate };
    case "6m":
    default:
      return { startDate: daysAgo(182), endDate };
  }
}
