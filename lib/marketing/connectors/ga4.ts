import { getAnalyticsDataClient } from "@/lib/google-auth";
import {
  ConnectorContext,
  DiscoveryResult,
  MarketingConnector,
  MetricQuery,
  MetricResult,
  ConnectorError,
} from "../types";

const KNOWN_METRICS: { name: string; description: string }[] = [
  { name: "sessions", description: "Total sessions" },
  { name: "activeUsers", description: "Active users" },
  { name: "newUsers", description: "New users" },
  { name: "engagedSessions", description: "Engaged sessions" },
  { name: "engagementRate", description: "Engagement rate (0-1)" },
  { name: "bounceRate", description: "Bounce rate (0-1)" },
  { name: "averageSessionDuration", description: "Average session duration in seconds" },
  { name: "screenPageViews", description: "Pageviews / screen views" },
  { name: "eventCount", description: "Total events" },
  { name: "conversions", description: "Conversion events" },
  { name: "totalRevenue", description: "Total revenue" },
];

const KNOWN_DIMENSIONS: { name: string; description: string }[] = [
  { name: "date", description: "Day (YYYYMMDD)" },
  { name: "sessionSource", description: "Source of the session" },
  { name: "sessionMedium", description: "Medium of the session" },
  { name: "sessionDefaultChannelGroup", description: "Default channel grouping" },
  { name: "sessionCampaignName", description: "Campaign name" },
  { name: "landingPage", description: "Landing page path" },
  { name: "pagePath", description: "Page path" },
  { name: "country", description: "Country" },
  { name: "deviceCategory", description: "Device category (desktop/mobile/tablet)" },
];

export const ga4Connector: MarketingConnector = {
  platform: "ga4",

  isConfigured(ctx) {
    return Boolean(ctx.client.ga4PropertyId);
  },

  missingReason(ctx) {
    return `${ctx.client.name} has no GA4 property ID configured.`;
  },

  discover(): DiscoveryResult {
    return {
      platform: "ga4",
      metrics: KNOWN_METRICS.map((m) => ({ ...m, type: "metric" })),
      dimensions: KNOWN_DIMENSIONS.map((d) => ({ ...d, type: "dimension" })),
    };
  },

  async fetch(ctx: ConnectorContext, query: MetricQuery): Promise<MetricResult> {
    const propertyId = ctx.client.ga4PropertyId!;
    const property = propertyId.startsWith("properties/") ? propertyId : `properties/${propertyId}`;
    const client = getAnalyticsDataClient();

    const metricFilters = (query.filters || []).map((f) => ({
      filter: {
        fieldName: f.dimension,
        stringFilter: {
          value: f.value,
          matchType: f.op === "contains" ? ("CONTAINS" as const) : ("EXACT" as const),
        },
      },
    }));

    const res = await client.properties.runReport({
      property,
      requestBody: {
        dateRanges: [{ startDate: query.dateRange.start, endDate: query.dateRange.end }],
        metrics: query.metrics.map((name) => ({ name })),
        dimensions: (query.dimensions || []).map((name) => ({ name })),
        dimensionFilter:
          metricFilters.length === 1
            ? metricFilters[0]
            : metricFilters.length > 1
            ? { andGroup: { expressions: metricFilters } }
            : undefined,
        orderBys: query.sort
          ? [
              {
                metric: { metricName: query.sort.metric },
                desc: query.sort.direction === "desc",
              },
            ]
          : undefined,
        limit: query.limit ? String(query.limit) : undefined,
      },
    });

    const data = res.data;
    if (!data.rows) {
      throw new ConnectorError(
        `No data from GA4 for ${ctx.client.name} in ${query.dateRange.label}`,
        "no_data"
      );
    }

    const metricHeaders = data.metricHeaders || [];
    const dimensionHeaders = data.dimensionHeaders || [];

    const breakdown = (data.rows || []).map((row) => {
      const dims: Record<string, string> = {};
      dimensionHeaders.forEach((h, i) => {
        dims[h.name!] = row.dimensionValues?.[i]?.value ?? "";
      });
      const metrics: Record<string, number> = {};
      metricHeaders.forEach((h, i) => {
        metrics[h.name!] = Number(row.metricValues?.[i]?.value ?? 0);
      });
      return { dimensions: dimensionHeaders.length ? dims : undefined, metrics };
    });

    const totals: Record<string, number> = {};
    const totalRow = data.totals?.[0];
    metricHeaders.forEach((h, i) => {
      totals[h.name!] = Number(totalRow?.metricValues?.[i]?.value ?? 0);
    });

    return {
      platform: "ga4",
      client: { id: ctx.client._id, name: ctx.client.name, slug: ctx.client.slug },
      dateRange: query.dateRange,
      totals,
      breakdown,
      meta: { propertyId: property, rowCount: data.rowCount || breakdown.length },
    };
  },
};
