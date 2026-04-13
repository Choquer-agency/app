import { google } from "googleapis";
import {
  ConnectorContext,
  DiscoveryResult,
  MarketingConnector,
  MetricQuery,
  MetricResult,
  ConnectorError,
} from "../types";

const GBP_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "BUSINESS_CONVERSATIONS",
  "BUSINESS_DIRECTION_REQUESTS",
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
  "BUSINESS_BOOKINGS",
  "BUSINESS_FOOD_ORDERS",
  "BUSINESS_FOOD_MENU_CLICKS",
];

function splitDate(d: string) {
  const [year, month, day] = d.split("-").map(Number);
  return { year, month, day };
}

export const gbpConnector: MarketingConnector = {
  platform: "gbp",

  isConfigured(ctx) {
    return Boolean(ctx.client.gbpLocationName);
  },

  missingReason(ctx) {
    return `${ctx.client.name} has no Google Business Profile location configured.`;
  },

  discover(): DiscoveryResult {
    return {
      platform: "gbp",
      metrics: GBP_METRICS.map((name) => ({
        name,
        description: `GBP metric: ${name}`,
        type: "metric" as const,
      })),
      dimensions: [
        { name: "date", description: "Daily breakdown", type: "dimension" as const },
      ],
    };
  },

  async fetch(ctx: ConnectorContext, query: MetricQuery): Promise<MetricResult> {
    const location = ctx.client.gbpLocationName!;
    const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!keyJson) throw new ConnectorError("GOOGLE_SERVICE_ACCOUNT_KEY is not set", "not_connected");
    const credentials = JSON.parse(keyJson.replace(/\n/g, "\\n"));

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/business.manage"],
    });
    const token = await auth.getAccessToken();

    const start = splitDate(query.dateRange.start);
    const end = splitDate(query.dateRange.end);
    const url = new URL(
      `https://businessprofileperformance.googleapis.com/v1/${location}:fetchMultiDailyMetricsTimeSeries`
    );
    const wanted = query.metrics.filter((m) => GBP_METRICS.includes(m));
    if (!wanted.length) {
      throw new ConnectorError(
        `No valid GBP metrics requested. Valid: ${GBP_METRICS.join(", ")}`,
        "invalid_metric"
      );
    }
    wanted.forEach((m) => url.searchParams.append("dailyMetrics", m));
    url.searchParams.set("dailyRange.startDate.year", String(start.year));
    url.searchParams.set("dailyRange.startDate.month", String(start.month));
    url.searchParams.set("dailyRange.startDate.day", String(start.day));
    url.searchParams.set("dailyRange.endDate.year", String(end.year));
    url.searchParams.set("dailyRange.endDate.month", String(end.month));
    url.searchParams.set("dailyRange.endDate.day", String(end.day));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new ConnectorError(`GBP API error: ${res.status} ${detail}`, "upstream_error");
    }
    const body = await res.json();
    const series = body.multiDailyMetricTimeSeries?.[0]?.dailyMetricTimeSeries ?? [];

    const totals: Record<string, number> = {};
    const dailyBuckets = new Map<string, Record<string, number>>();
    for (const entry of series) {
      const metric = entry.dailyMetric as string;
      const values = entry.timeSeries?.datedValues || [];
      for (const dv of values) {
        const d = `${dv.date.year}-${String(dv.date.month).padStart(2, "0")}-${String(dv.date.day).padStart(2, "0")}`;
        const v = Number(dv.value || 0);
        totals[metric] = (totals[metric] || 0) + v;
        const bucket = dailyBuckets.get(d) ?? {};
        bucket[metric] = v;
        dailyBuckets.set(d, bucket);
      }
    }

    const breakdown = Array.from(dailyBuckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, metrics]) => ({ dimensions: { date }, metrics }));

    return {
      platform: "gbp",
      client: { id: ctx.client._id, name: ctx.client.name, slug: ctx.client.slug },
      dateRange: query.dateRange,
      totals,
      breakdown,
      meta: { location },
    };
  },
};
