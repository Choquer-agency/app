import { getAnalyticsDataClient } from "./google-auth";
import { cachedFetch } from "./cache";
import { GA4Sessions, TimeSeriesPoint } from "@/types";

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
 * Get GA4 session summary
 */
export async function getGA4Sessions(
  propertyId: string,
  startDate: string,
  endDate: string
): Promise<GA4Sessions> {
  return cachedFetch(`ga4:sessions:${propertyId}:${startDate}:${endDate}`, CACHE_TTL, async () => {
    const client = getAnalyticsDataClient();
    const res = await client.properties.runReport({
      property: propertyId,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "newUsers" },
        ],
        dimensionFilter: {
          filter: {
            fieldName: "sessionDefaultChannelGroup",
            stringFilter: { value: "Organic Search" },
          },
        },
      },
    });

    const row = res.data.rows?.[0];
    const totalSessions = parseInt(row?.metricValues?.[0]?.value || "0", 10);

    // Get total (non-filtered) sessions too
    const totalRes = await client.properties.runReport({
      property: propertyId,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "newUsers" },
        ],
      },
    });

    const totalRow = totalRes.data.rows?.[0];

    return {
      totalSessions: parseInt(totalRow?.metricValues?.[0]?.value || "0", 10),
      organicSessions: totalSessions,
      users: parseInt(totalRow?.metricValues?.[1]?.value || "0", 10),
      newUsers: parseInt(totalRow?.metricValues?.[2]?.value || "0", 10),
    };
  });
}

/**
 * Get daily organic sessions time series
 */
export async function getGA4TimeSeries(
  propertyId: string,
  startDate: string,
  endDate: string
): Promise<TimeSeriesPoint[]> {
  return cachedFetch(`ga4:ts:${propertyId}:${startDate}:${endDate}`, CACHE_TTL, async () => {
    const client = getAnalyticsDataClient();
    const res = await client.properties.runReport({
      property: propertyId,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "sessions" }],
        dimensionFilter: {
          filter: {
            fieldName: "sessionDefaultChannelGroup",
            stringFilter: { value: "Organic Search" },
          },
        },
        orderBys: [{ dimension: { dimensionName: "date" } }],
      },
    });

    return (res.data.rows || []).map((row) => {
      const raw = row.dimensionValues?.[0]?.value || "";
      // GA4 returns date as YYYYMMDD
      const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
      return {
        date,
        organicSessions: parseInt(row.metricValues?.[0]?.value || "0", 10),
      };
    });
  });
}

/**
 * Get daily total users time series (all channels)
 */
export async function getGA4UsersTimeSeries(
  propertyId: string,
  startDate: string,
  endDate: string
): Promise<TimeSeriesPoint[]> {
  return cachedFetch(`ga4:users-ts:${propertyId}:${startDate}:${endDate}`, CACHE_TTL, async () => {
    const client = getAnalyticsDataClient();
    const res = await client.properties.runReport({
      property: propertyId,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      },
    });

    return (res.data.rows || []).map((row) => {
      const raw = row.dimensionValues?.[0]?.value || "";
      const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
      return {
        date,
        users: parseInt(row.metricValues?.[0]?.value || "0", 10),
      };
    });
  });
}

/**
 * Get traffic acquisition breakdown by channel
 */
export interface TrafficChannel {
  channel: string;
  users: number;
  sessions: number;
  newUsers: number;
}

export async function getGA4TrafficAcquisition(
  propertyId: string,
  startDate: string,
  endDate: string
): Promise<TrafficChannel[]> {
  return cachedFetch(`ga4:acquisition:${propertyId}:${startDate}:${endDate}`, CACHE_TTL, async () => {
    const client = getAnalyticsDataClient();
    const res = await client.properties.runReport({
      property: propertyId,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [
          { name: "activeUsers" },
          { name: "sessions" },
          { name: "newUsers" },
        ],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: "10",
      },
    });

    return (res.data.rows || []).map((row) => ({
      channel: row.dimensionValues?.[0]?.value || "Unknown",
      users: parseInt(row.metricValues?.[0]?.value || "0", 10),
      sessions: parseInt(row.metricValues?.[1]?.value || "0", 10),
      newUsers: parseInt(row.metricValues?.[2]?.value || "0", 10),
    }));
  });
}

/**
 * Get GA4 KPI: organic sessions current 30d vs prior 30d
 */
export async function getGA4KPIs(propertyId: string) {
  const [current, previous] = await Promise.all([
    getGA4Sessions(propertyId, daysAgo(30), daysAgo(0)),
    getGA4Sessions(propertyId, daysAgo(60), daysAgo(30)),
  ]);

  function pctChange(curr: number, prev: number): number {
    if (prev === 0) return 0;
    return ((curr - prev) / prev) * 100;
  }

  return {
    organicSessions: {
      label: "Organic Sessions",
      value: current.organicSessions,
      previousValue: previous.organicSessions,
      changePercent: pctChange(current.organicSessions, previous.organicSessions),
      format: "number" as const,
    },
    totalSessions: {
      label: "Sessions",
      value: current.totalSessions,
      previousValue: previous.totalSessions,
      changePercent: pctChange(current.totalSessions, previous.totalSessions),
      format: "number" as const,
    },
  };
}
