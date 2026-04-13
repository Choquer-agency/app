import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { resolveClientByName } from "./resolve-client";
import { resolveDateRange } from "./date-ranges";
import { allPlatforms, discover, getConnector, runQuery } from "./registry";
import { ConnectorError } from "./types";
import type {
  DateRangeInput,
  MarketingPlatform,
  MetricFilter,
  MetricQuery,
  MetricResult,
  MetricSort,
  ResolvedDateRange,
} from "./types";

const PLATFORMS = new Set<string>([
  "ga4",
  "gsc",
  "google_ads",
  "youtube",
  "gbp",
  "pagespeed",
]);

export function parsePlatform(p: string): MarketingPlatform {
  if (!PLATFORMS.has(p)) {
    throw new Error(`Unknown platform "${p}". Valid: ${[...PLATFORMS].join(", ")}`);
  }
  return p as MarketingPlatform;
}

export async function resolveClientOrThrow(clientName: string) {
  const resolution = await resolveClientByName(clientName);
  if (!resolution.match) {
    throw new Error(
      resolution.reason ||
        `No client matching "${clientName}"${
          resolution.candidates.length
            ? `. Candidates: ${resolution.candidates.map((c) => c.name).join(", ")}`
            : ""
        }`
    );
  }
  return resolution.match;
}

async function auditLog(actorLabel: string, detail: Record<string, unknown>) {
  try {
    const convex = getConvexClient();
    await convex.mutation(api.mcpAuditLog.log, {
      actor: actorLabel,
      detail: JSON.stringify(detail),
    });
  } catch {
    // Audit logging must never break tool execution
  }
}

export interface QueryInput {
  clientName: string;
  platform: string;
  metrics: string[];
  dateRange: DateRangeInput;
  dimensions?: string[];
  filters?: MetricFilter[];
  sort?: MetricSort;
  limit?: number;
}

export async function marketingQuery(input: QueryInput): Promise<MetricResult> {
  const platform = parsePlatform(input.platform);
  const client = await resolveClientOrThrow(input.clientName);
  const dateRange = resolveDateRange(input.dateRange);
  const query: MetricQuery = {
    metrics: input.metrics,
    dateRange,
    dimensions: input.dimensions,
    filters: input.filters,
    sort: input.sort,
    limit: input.limit,
  };

  await auditLog("mcp", {
    tool: "marketing_query",
    clientId: client._id,
    clientName: client.name,
    platform,
    metrics: input.metrics,
    dateRange: { start: dateRange.start, end: dateRange.end },
  });

  return runQuery(platform, { client }, query);
}

export function marketingDiscover(platform: string) {
  return discover(parsePlatform(platform));
}

export async function clientConnections(clientName: string) {
  const client = await resolveClientOrThrow(clientName);
  const platforms: Record<string, { connected: boolean; id?: string; reason?: string }> = {};
  for (const p of allPlatforms()) {
    const connector = getConnector(p);
    const configured = connector.isConfigured({ client });
    platforms[p] = configured
      ? { connected: true, id: getPlatformId(client, p) }
      : { connected: false, reason: connector.missingReason({ client }) };
  }
  return {
    client: { id: client._id, name: client.name, slug: client.slug },
    platforms,
    missing: Object.entries(platforms)
      .filter(([, v]) => !v.connected)
      .map(([k]) => k),
  };
}

function getPlatformId(
  client: Awaited<ReturnType<typeof resolveClientOrThrow>>,
  platform: MarketingPlatform
): string | undefined {
  switch (platform) {
    case "ga4":
      return client.ga4PropertyId;
    case "gsc":
      return client.gscSiteUrl;
    case "google_ads":
      return client.googleAdsCustomerId;
    case "youtube":
      return client.youtubeChannelId;
    case "gbp":
      return client.gbpLocationName;
    case "pagespeed":
      return client.websiteUrl;
  }
}

export async function marketingCompare(input: {
  clientName: string;
  platform: string;
  metrics: string[];
  periodA: DateRangeInput;
  periodB: DateRangeInput;
  dimensions?: string[];
  filters?: MetricFilter[];
}) {
  const [resultA, resultB] = await Promise.all([
    marketingQuery({
      clientName: input.clientName,
      platform: input.platform,
      metrics: input.metrics,
      dateRange: input.periodA,
      dimensions: input.dimensions,
      filters: input.filters,
    }),
    marketingQuery({
      clientName: input.clientName,
      platform: input.platform,
      metrics: input.metrics,
      dateRange: input.periodB,
      dimensions: input.dimensions,
      filters: input.filters,
    }),
  ]);

  const deltas: Record<string, { abs: number; pct: number | null }> = {};
  for (const m of input.metrics) {
    const a = resultA.totals[m] ?? 0;
    const b = resultB.totals[m] ?? 0;
    const abs = a - b;
    deltas[m] = { abs, pct: b === 0 ? null : abs / b };
  }

  return { periodA: resultA, periodB: resultB, deltas };
}

export async function marketingReport(input: {
  clientName: string;
  platforms: string[];
  dateRange: DateRangeInput;
}) {
  const client = await resolveClientOrThrow(input.clientName);
  const dateRange = resolveDateRange(input.dateRange);

  const defaultMetrics: Record<MarketingPlatform, string[]> = {
    ga4: ["sessions", "activeUsers", "engagementRate"],
    gsc: ["clicks", "impressions", "ctr", "position"],
    google_ads: ["metrics.impressions", "metrics.clicks", "metrics.cost_micros", "metrics.conversions"],
    youtube: ["views", "estimatedMinutesWatched", "subscribersGained"],
    gbp: [
      "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
      "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
      "WEBSITE_CLICKS",
      "CALL_CLICKS",
    ],
    pagespeed: ["performance", "lcp", "inp", "cls"],
  };

  const perPlatform: Record<string, unknown> = {};
  await Promise.all(
    input.platforms.map(async (p) => {
      try {
        const platform = parsePlatform(p);
        const connector = getConnector(platform);
        if (!connector.isConfigured({ client })) {
          perPlatform[p] = { connected: false, reason: connector.missingReason({ client }) };
          return;
        }
        const result = await runQuery(platform, { client }, {
          metrics: defaultMetrics[platform],
          dateRange,
        });
        perPlatform[p] = { connected: true, totals: result.totals, meta: result.meta };
      } catch (e) {
        perPlatform[p] = {
          connected: false,
          error: e instanceof ConnectorError ? e.message : String(e),
        };
      }
    })
  );

  await auditLog("mcp", {
    tool: "marketing_report",
    clientId: client._id,
    clientName: client.name,
    platforms: input.platforms,
    dateRange: { start: dateRange.start, end: dateRange.end },
  });

  return {
    client: { id: client._id, name: client.name, slug: client.slug },
    dateRange,
    perPlatform,
  };
}

export function formatResolvedRange(r: ResolvedDateRange) {
  return `${r.start} to ${r.end} (${r.label})`;
}
