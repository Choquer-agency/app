import type {
  ConnectorContext,
  DiscoveryResult,
  MarketingConnector,
  MarketingPlatform,
  MetricQuery,
  MetricResult,
} from "./types";
import { ConnectorError } from "./types";
import { ga4Connector } from "./connectors/ga4";
import { gscConnector } from "./connectors/gsc";
import { pagespeedConnector } from "./connectors/pagespeed";
import { gbpConnector } from "./connectors/gbp";
import { googleAdsConnector } from "./connectors/google-ads";
import { youtubeConnector } from "./connectors/youtube";

const REGISTRY: Record<MarketingPlatform, MarketingConnector> = {
  ga4: ga4Connector,
  gsc: gscConnector,
  pagespeed: pagespeedConnector,
  gbp: gbpConnector,
  google_ads: googleAdsConnector,
  youtube: youtubeConnector,
};

export function getConnector(platform: MarketingPlatform): MarketingConnector {
  const c = REGISTRY[platform];
  if (!c) throw new ConnectorError(`Unknown platform: ${platform}`, "upstream_error");
  return c;
}

export function allPlatforms(): MarketingPlatform[] {
  return Object.keys(REGISTRY) as MarketingPlatform[];
}

export async function runQuery(
  platform: MarketingPlatform,
  ctx: ConnectorContext,
  query: MetricQuery
): Promise<MetricResult> {
  const connector = getConnector(platform);
  if (!connector.isConfigured(ctx)) {
    throw new ConnectorError(connector.missingReason(ctx), "not_connected");
  }
  return connector.fetch(ctx, query);
}

export function discover(platform: MarketingPlatform): DiscoveryResult {
  return getConnector(platform).discover();
}
