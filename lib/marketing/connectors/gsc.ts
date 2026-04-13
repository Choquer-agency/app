import { getSearchConsoleClient } from "@/lib/google-auth";
import {
  ConnectorContext,
  DiscoveryResult,
  MarketingConnector,
  MetricQuery,
  MetricResult,
  ConnectorError,
} from "../types";

const GSC_METRICS = ["clicks", "impressions", "ctr", "position"];

const GSC_DIMENSIONS = ["query", "page", "country", "device", "date", "searchAppearance"];

export const gscConnector: MarketingConnector = {
  platform: "gsc",

  isConfigured(ctx) {
    return Boolean(ctx.client.gscSiteUrl);
  },

  missingReason(ctx) {
    return `${ctx.client.name} has no Search Console property configured.`;
  },

  discover(): DiscoveryResult {
    return {
      platform: "gsc",
      metrics: GSC_METRICS.map((name) => ({ name, description: `GSC ${name}`, type: "metric" })),
      dimensions: GSC_DIMENSIONS.map((name) => ({ name, description: `GSC ${name}`, type: "dimension" })),
    };
  },

  async fetch(ctx: ConnectorContext, query: MetricQuery): Promise<MetricResult> {
    const siteUrl = ctx.client.gscSiteUrl!;
    const client = getSearchConsoleClient();

    const dimensions = query.dimensions || [];
    const res = await client.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: query.dateRange.start,
        endDate: query.dateRange.end,
        dimensions,
        rowLimit: query.limit || 1000,
        dimensionFilterGroups: query.filters?.length
          ? [
              {
                filters: query.filters.map((f) => ({
                  dimension: f.dimension,
                  operator: f.op === "contains" ? "contains" : "equals",
                  expression: f.value,
                })),
              },
            ]
          : undefined,
      },
    });

    const rows = res.data.rows || [];
    if (!rows.length) {
      throw new ConnectorError(
        `No Search Console data for ${ctx.client.name} in ${query.dateRange.label}`,
        "no_data"
      );
    }

    const totals: Record<string, number> = {
      clicks: 0,
      impressions: 0,
      ctr: 0,
      position: 0,
    };
    const breakdown = rows.map((r) => {
      const dims: Record<string, string> = {};
      dimensions.forEach((d, i) => {
        dims[d] = r.keys?.[i] ?? "";
      });
      totals.clicks += r.clicks || 0;
      totals.impressions += r.impressions || 0;
      return {
        dimensions: dimensions.length ? dims : undefined,
        metrics: {
          clicks: r.clicks || 0,
          impressions: r.impressions || 0,
          ctr: r.ctr || 0,
          position: r.position || 0,
        },
      };
    });
    totals.ctr = totals.impressions ? totals.clicks / totals.impressions : 0;
    totals.position =
      rows.reduce((sum, r) => sum + (r.position || 0), 0) / Math.max(1, rows.length);

    // Filter to requested metrics only
    const requestedTotals: Record<string, number> = {};
    query.metrics.forEach((m) => {
      if (m in totals) requestedTotals[m] = totals[m];
    });

    return {
      platform: "gsc",
      client: { id: ctx.client._id, name: ctx.client.name, slug: ctx.client.slug },
      dateRange: query.dateRange,
      totals: requestedTotals.clicks !== undefined ? requestedTotals : totals,
      breakdown,
      meta: { siteUrl, rowCount: rows.length },
    };
  },
};
