import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { decryptCredentials } from "@/lib/credentials-crypto";
import {
  ConnectorContext,
  DiscoveryResult,
  MarketingConnector,
  MetricQuery,
  MetricResult,
  ConnectorError,
} from "../types";

const PAGESPEED_METRICS = [
  { name: "performance", description: "Lighthouse performance score (0-100)" },
  { name: "accessibility", description: "Lighthouse accessibility score (0-100)" },
  { name: "bestPractices", description: "Lighthouse best practices score (0-100)" },
  { name: "seo", description: "Lighthouse SEO score (0-100)" },
  { name: "lcp", description: "Largest Contentful Paint (ms)" },
  { name: "inp", description: "Interaction to Next Paint (ms)" },
  { name: "cls", description: "Cumulative Layout Shift" },
  { name: "fcp", description: "First Contentful Paint (ms)" },
  { name: "tbt", description: "Total Blocking Time (ms)" },
];

async function getPageSpeedApiKey(): Promise<string> {
  const convex = getConvexClient();
  const connections = (await convex.query(api.apiConnections.list, {
    platform: "pagespeed",
    scope: "org",
  } as any)) as any[];
  const conn = connections.find((c) => c.status === "active");
  if (!conn) {
    throw new ConnectorError(
      "PageSpeed API key not connected. Add it under Settings > Connections.",
      "not_connected"
    );
  }
  const raw = decryptCredentials(conn.encryptedCreds, conn.credsIv);
  const creds = JSON.parse(raw);
  if (!creds.apiKey) throw new ConnectorError("PageSpeed credentials missing apiKey", "not_connected");
  return creds.apiKey.trim();
}

export const pagespeedConnector: MarketingConnector = {
  platform: "pagespeed",

  isConfigured(ctx) {
    return Boolean(ctx.client.websiteUrl);
  },

  missingReason(ctx) {
    return `${ctx.client.name} has no website URL configured.`;
  },

  discover(): DiscoveryResult {
    return {
      platform: "pagespeed",
      metrics: PAGESPEED_METRICS.map((m) => ({ ...m, type: "metric" })),
      dimensions: [
        { name: "strategy", description: "mobile | desktop", type: "dimension" },
      ],
    };
  },

  async fetch(ctx: ConnectorContext, query: MetricQuery): Promise<MetricResult> {
    const url = ctx.client.websiteUrl!;
    const apiKey = await getPageSpeedApiKey();
    const strategyFilter = query.filters?.find((f) => f.dimension === "strategy")?.value;
    const strategies = strategyFilter ? [strategyFilter] : ["mobile"];

    const breakdown: { dimensions: Record<string, string>; metrics: Record<string, number> }[] = [];
    const totals: Record<string, number> = {};

    for (const strategy of strategies) {
      const u = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
      u.searchParams.set("url", url);
      u.searchParams.set("key", apiKey);
      u.searchParams.set("strategy", strategy);
      ["performance", "accessibility", "best-practices", "seo"].forEach((c) =>
        u.searchParams.append("category", c)
      );

      const res = await fetch(u.toString());
      if (!res.ok) {
        throw new ConnectorError(`PageSpeed API error: ${res.status}`, "upstream_error");
      }
      const body = await res.json();
      const categories = body.lighthouseResult?.categories ?? {};
      const audits = body.lighthouseResult?.audits ?? {};

      const metrics: Record<string, number> = {
        performance: Math.round((categories.performance?.score ?? 0) * 100),
        accessibility: Math.round((categories.accessibility?.score ?? 0) * 100),
        bestPractices: Math.round((categories["best-practices"]?.score ?? 0) * 100),
        seo: Math.round((categories.seo?.score ?? 0) * 100),
        lcp: audits["largest-contentful-paint"]?.numericValue ?? 0,
        inp: audits["interaction-to-next-paint"]?.numericValue ?? 0,
        cls: audits["cumulative-layout-shift"]?.numericValue ?? 0,
        fcp: audits["first-contentful-paint"]?.numericValue ?? 0,
        tbt: audits["total-blocking-time"]?.numericValue ?? 0,
      };
      breakdown.push({ dimensions: { strategy }, metrics });
      if (strategy === "mobile") Object.assign(totals, metrics);
    }

    const filteredTotals: Record<string, number> = {};
    query.metrics.forEach((m) => {
      if (m in totals) filteredTotals[m] = totals[m];
    });

    return {
      platform: "pagespeed",
      client: { id: ctx.client._id, name: ctx.client.name, slug: ctx.client.slug },
      dateRange: query.dateRange,
      totals: Object.keys(filteredTotals).length ? filteredTotals : totals,
      breakdown,
      meta: { url, strategies },
    };
  },
};
