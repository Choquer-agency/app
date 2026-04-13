import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { decryptCredentials, encryptCredentials } from "@/lib/credentials-crypto";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { ConnectorError } from "./types";

type OAuthCreds = { accessToken: string; refreshToken: string };

interface RefreshProvider {
  tokenUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
}

const PROVIDERS: Record<string, RefreshProvider> = {
  google: {
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
  },
};

function providerForPlatform(platform: string): RefreshProvider {
  if (
    platform === "google_ads" ||
    platform === "youtube" ||
    platform === "gsc" ||
    platform === "gmb" ||
    platform === "google_oauth" ||
    platform.startsWith("google")
  ) {
    return PROVIDERS.google;
  }
  throw new ConnectorError(`No OAuth refresh provider configured for platform ${platform}`, "upstream_error");
}

export interface ConnectionCreds {
  connectionId: Id<"apiConnections">;
  accessToken: string;
  refreshToken: string;
}

export async function getOAuthCreds(connection: Doc<"apiConnections">): Promise<ConnectionCreds> {
  if (connection.authType !== "oauth2") {
    throw new ConnectorError(`Connection ${connection.platform} is not OAuth2`, "upstream_error");
  }
  const creds = JSON.parse(decryptCredentials(connection.encryptedCreds, connection.credsIv)) as OAuthCreds;
  if (!creds.accessToken || !creds.refreshToken) {
    throw new ConnectorError(`OAuth tokens missing for ${connection.platform}`, "auth_expired");
  }

  // Refresh pre-emptively if near expiry (60s buffer)
  const expiresAt = connection.tokenExpiresAt;
  if (expiresAt && expiresAt - Date.now() < 60_000) {
    return await refreshAndPersist(connection, creds.refreshToken);
  }

  return {
    connectionId: connection._id,
    accessToken: creds.accessToken,
    refreshToken: creds.refreshToken,
  };
}

export async function refreshAndPersist(
  connection: Doc<"apiConnections">,
  refreshToken: string
): Promise<ConnectionCreds> {
  const provider = providerForPlatform(connection.platform);
  const clientId = process.env[provider.clientIdEnv];
  const clientSecret = process.env[provider.clientSecretEnv];
  if (!clientId || !clientSecret) {
    throw new ConnectorError(
      `OAuth provider not configured: ${provider.clientIdEnv} / ${provider.clientSecretEnv} missing`,
      "upstream_error"
    );
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new ConnectorError(`Failed to refresh OAuth token: ${res.status} ${detail}`, "auth_expired");
  }
  const json = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };

  const newCreds: OAuthCreds = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || refreshToken,
  };
  const { ciphertext, iv } = encryptCredentials(JSON.stringify(newCreds));
  const expiresAt = Date.now() + (json.expires_in ?? 3600) * 1000;

  const convex = getConvexClient();
  await convex.mutation(api.apiConnections.updateStatus, {
    id: connection._id,
    status: "active",
    encryptedCreds: ciphertext,
    credsIv: iv,
    tokenExpiresAt: expiresAt,
    lastVerifiedAt: new Date().toISOString(),
  });

  return {
    connectionId: connection._id,
    accessToken: newCreds.accessToken,
    refreshToken: newCreds.refreshToken,
  };
}

/**
 * Wraps a fetch call. On 401, refreshes the OAuth token once and retries.
 * Caller passes the connection + a builder that produces the HTTP request
 * given a fresh access token.
 */
export async function fetchWithRefresh(
  connection: Doc<"apiConnections">,
  build: (accessToken: string) => { url: string; init: RequestInit }
): Promise<Response> {
  let creds = await getOAuthCreds(connection);
  const first = build(creds.accessToken);
  let res = await fetch(first.url, first.init);
  if (res.status !== 401) return res;

  creds = await refreshAndPersist(connection, creds.refreshToken);
  const second = build(creds.accessToken);
  res = await fetch(second.url, second.init);
  return res;
}

export async function findOAuthConnection(
  platform: string
): Promise<Doc<"apiConnections"> | null> {
  const convex = getConvexClient();
  const docs = (await convex.query(api.apiConnections.list, { scope: "org", platform } as any)) as Doc<"apiConnections">[];
  return docs.find((d) => d.authType === "oauth2" && d.status === "active") ?? null;
}
