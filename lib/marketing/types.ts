import type { Doc } from "@/convex/_generated/dataModel";

export type MarketingPlatform =
  | "ga4"
  | "gsc"
  | "google_ads"
  | "youtube"
  | "gbp"
  | "pagespeed";

export type DateRangePreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_14_days"
  | "last_28_days"
  | "last_30_days"
  | "last_90_days"
  | "last_12_months"
  | "mtd"
  | "qtd"
  | "ytd"
  | "last_week"
  | "last_month"
  | "last_quarter"
  | "last_year";

export type DateRangeInput =
  | { preset: DateRangePreset }
  | { start: string; end: string };

export interface ResolvedDateRange {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  label: string;
}

export interface MetricFilter {
  dimension: string;
  op: "eq" | "contains";
  value: string;
}

export interface MetricSort {
  metric: string;
  direction: "asc" | "desc";
}

export interface MetricQuery {
  metrics: string[];
  dateRange: ResolvedDateRange;
  dimensions?: string[];
  filters?: MetricFilter[];
  sort?: MetricSort;
  limit?: number;
}

export interface MetricResultRow {
  dimensions?: Record<string, string>;
  metrics: Record<string, number>;
}

export interface MetricResult {
  platform: MarketingPlatform;
  client: { id: string; name: string; slug: string };
  dateRange: ResolvedDateRange;
  totals: Record<string, number>;
  breakdown: MetricResultRow[];
  meta?: Record<string, unknown>;
}

export interface DiscoveryField {
  name: string;
  description: string;
  type?: "metric" | "dimension";
}

export interface DiscoveryResult {
  platform: MarketingPlatform;
  metrics: DiscoveryField[];
  dimensions: DiscoveryField[];
}

export interface ConnectorContext {
  client: Doc<"clients">;
}

export interface MarketingConnector {
  platform: MarketingPlatform;
  /** True if this client has the IDs/credentials needed to run a query. */
  isConfigured(ctx: ConnectorContext): boolean;
  /** Return a human-friendly reason when `isConfigured` is false. */
  missingReason(ctx: ConnectorContext): string;
  fetch(ctx: ConnectorContext, query: MetricQuery): Promise<MetricResult>;
  discover(): DiscoveryResult;
}

export class ConnectorError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_connected"
      | "missing_id"
      | "invalid_metric"
      | "auth_expired"
      | "rate_limited"
      | "no_data"
      | "upstream_error"
  ) {
    super(message);
  }
}
