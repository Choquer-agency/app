import {
  ConnectorContext,
  DiscoveryResult,
  MarketingConnector,
  MetricQuery,
  MetricResult,
  ConnectorError,
} from "../types";
import { fetchWithRefresh, findOAuthConnection } from "../token-refresh";

const YT_METRICS = [
  { name: "views", description: "Video views" },
  { name: "estimatedMinutesWatched", description: "Minutes watched" },
  { name: "averageViewDuration", description: "Average view duration (seconds)" },
  { name: "averageViewPercentage", description: "Average view percentage" },
  { name: "subscribersGained", description: "Subscribers gained" },
  { name: "subscribersLost", description: "Subscribers lost" },
  { name: "likes", description: "Likes" },
  { name: "dislikes", description: "Dislikes" },
  { name: "comments", description: "Comments" },
  { name: "shares", description: "Shares" },
  { name: "annotationClickThroughRate", description: "Annotation CTR" },
];

const YT_DIMENSIONS = [
  { name: "day", description: "Daily breakdown" },
  { name: "video", description: "Per video" },
  { name: "country", description: "Country code" },
  { name: "deviceType", description: "Device type" },
  { name: "trafficSourceType", description: "Traffic source" },
];

export const youtubeConnector: MarketingConnector = {
  platform: "youtube",

  isConfigured(ctx) {
    return Boolean(ctx.client.youtubeChannelId);
  },

  missingReason(ctx) {
    return `${ctx.client.name} has no YouTube channel ID configured.`;
  },

  discover(): DiscoveryResult {
    return {
      platform: "youtube",
      metrics: YT_METRICS.map((m) => ({ ...m, type: "metric" as const })),
      dimensions: YT_DIMENSIONS.map((d) => ({ ...d, type: "dimension" as const })),
    };
  },

  async fetch(ctx: ConnectorContext, query: MetricQuery): Promise<MetricResult> {
    const channelId = ctx.client.youtubeChannelId!;
    const connection = await findOAuthConnection("google_oauth");
    if (!connection) {
      throw new ConnectorError(
        "Agency Google account is not connected. Connect it at Settings > Connections.",
        "not_connected"
      );
    }

    const params = new URLSearchParams({
      ids: `channel==${channelId}`,
      startDate: query.dateRange.start,
      endDate: query.dateRange.end,
      metrics: query.metrics.join(","),
    });
    if (query.dimensions?.length) params.set("dimensions", query.dimensions.join(","));
    if (query.filters?.length) {
      params.set(
        "filters",
        query.filters.map((f) => `${f.dimension}==${f.value}`).join(";")
      );
    }
    if (query.sort) {
      params.set("sort", `${query.sort.direction === "desc" ? "-" : ""}${query.sort.metric}`);
    }
    if (query.limit) params.set("maxResults", String(query.limit));

    const res = await fetchWithRefresh(connection, (token) => ({
      url: `https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`,
      init: {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
    }));
    if (!res.ok) {
      const detail = await res.text();
      throw new ConnectorError(
        `YouTube Analytics error: ${res.status} ${detail.slice(0, 500)}`,
        res.status === 401 ? "auth_expired" : "upstream_error"
      );
    }
    const body = await res.json();
    const headers: { name: string; columnType: string; dataType: string }[] = body.columnHeaders || [];
    const rows: unknown[][] = body.rows || [];

    const dimIndexes = headers
      .map((h, i) => ({ h, i }))
      .filter((x) => x.h.columnType === "DIMENSION");
    const metricIndexes = headers
      .map((h, i) => ({ h, i }))
      .filter((x) => x.h.columnType === "METRIC");

    const totals: Record<string, number> = {};
    for (const m of query.metrics) totals[m] = 0;
    const breakdown = rows.map((row) => {
      const dims: Record<string, string> = {};
      dimIndexes.forEach(({ h, i }) => {
        dims[h.name] = String(row[i] ?? "");
      });
      const metrics: Record<string, number> = {};
      metricIndexes.forEach(({ h, i }) => {
        const v = Number(row[i] ?? 0);
        metrics[h.name] = v;
        totals[h.name] = (totals[h.name] ?? 0) + v;
      });
      return { dimensions: dimIndexes.length ? dims : undefined, metrics };
    });

    return {
      platform: "youtube",
      client: { id: ctx.client._id, name: ctx.client.name, slug: ctx.client.slug },
      dateRange: query.dateRange,
      totals,
      breakdown,
      meta: { channelId },
    };
  },
};
