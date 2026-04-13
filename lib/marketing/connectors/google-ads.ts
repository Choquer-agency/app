import {
  ConnectorContext,
  DiscoveryResult,
  MarketingConnector,
  MetricQuery,
  MetricResult,
  ConnectorError,
} from "../types";
import { fetchWithRefresh, findOAuthConnection } from "../token-refresh";

const ADS_METRICS = [
  { name: "metrics.impressions", description: "Impressions" },
  { name: "metrics.clicks", description: "Clicks" },
  { name: "metrics.ctr", description: "Click-through rate" },
  { name: "metrics.average_cpc", description: "Average CPC (micros)" },
  { name: "metrics.cost_micros", description: "Cost in micros (divide by 1,000,000 for account currency)" },
  { name: "metrics.conversions", description: "Conversions" },
  { name: "metrics.conversions_value", description: "Conversion value" },
  { name: "metrics.all_conversions", description: "All conversions" },
];

const ADS_DIMENSIONS = [
  { name: "campaign.id", description: "Campaign ID" },
  { name: "campaign.name", description: "Campaign name" },
  { name: "campaign.status", description: "Campaign status" },
  { name: "ad_group.id", description: "Ad group ID" },
  { name: "ad_group.name", description: "Ad group name" },
  { name: "segments.date", description: "Date" },
  { name: "segments.device", description: "Device" },
];

function escapeGaqlValue(v: string) {
  return v.replace(/['"\\]/g, "\\$&");
}

export const googleAdsConnector: MarketingConnector = {
  platform: "google_ads",

  isConfigured(ctx) {
    return Boolean(ctx.client.googleAdsCustomerId);
  },

  missingReason(ctx) {
    return `${ctx.client.name} has no Google Ads Customer ID configured.`;
  },

  discover(): DiscoveryResult {
    return {
      platform: "google_ads",
      metrics: ADS_METRICS.map((m) => ({ ...m, type: "metric" as const })),
      dimensions: ADS_DIMENSIONS.map((d) => ({ ...d, type: "dimension" as const })),
    };
  },

  async fetch(ctx: ConnectorContext, query: MetricQuery): Promise<MetricResult> {
    const customerId = ctx.client.googleAdsCustomerId!.replace(/-/g, "");
    const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, "");
    if (!devToken) {
      throw new ConnectorError(
        "GOOGLE_ADS_DEVELOPER_TOKEN is not set",
        "not_connected"
      );
    }

    const connection = await findOAuthConnection("google_oauth");
    if (!connection) {
      throw new ConnectorError(
        "Agency Google account is not connected. Connect it at Settings > Connections.",
        "not_connected"
      );
    }

    const dims = query.dimensions?.length ? query.dimensions : ["campaign.id", "campaign.name"];
    const selectFields = [...dims, ...query.metrics];
    const whereClauses = [
      `segments.date BETWEEN '${query.dateRange.start}' AND '${query.dateRange.end}'`,
      ...(query.filters?.map((f) => {
        const op = f.op === "contains" ? "CONTAINS" : "=";
        return `${f.dimension} ${op} '${escapeGaqlValue(f.value)}'`;
      }) || []),
    ];
    const orderBy = query.sort
      ? ` ORDER BY ${query.sort.metric} ${query.sort.direction.toUpperCase()}`
      : "";
    const limit = query.limit ? ` LIMIT ${query.limit}` : "";
    const gaql = `SELECT ${selectFields.join(", ")} FROM campaign WHERE ${whereClauses.join(" AND ")}${orderBy}${limit}`;

    const res = await fetchWithRefresh(connection, (token) => ({
      url: `https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:search`,
      init: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "developer-token": devToken,
          "Content-Type": "application/json",
          ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
        },
        body: JSON.stringify({ query: gaql }),
      },
    }));

    if (!res.ok) {
      const detail = await res.text();
      throw new ConnectorError(
        `Google Ads API error: ${res.status} ${detail.slice(0, 500)}`,
        res.status === 401 ? "auth_expired" : "upstream_error"
      );
    }
    const body = await res.json();
    const results: any[] = body.results || [];

    const totals: Record<string, number> = {};
    for (const m of query.metrics) totals[m] = 0;

    const breakdown = results.map((row) => {
      const flat = flatten(row);
      const dimensions: Record<string, string> = {};
      for (const d of dims) dimensions[d] = String(flat[d] ?? "");
      const metrics: Record<string, number> = {};
      for (const m of query.metrics) {
        const v = Number(flat[m] ?? 0);
        metrics[m] = v;
        totals[m] += v;
      }
      return { dimensions, metrics };
    });

    return {
      platform: "google_ads",
      client: { id: ctx.client._id, name: ctx.client.name, slug: ctx.client.slug },
      dateRange: query.dateRange,
      totals,
      breakdown,
      meta: { customerId, gaql },
    };
  },
};

function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flatten(v as Record<string, unknown>, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}
