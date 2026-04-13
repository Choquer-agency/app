import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { decryptCredentials } from "@/lib/credentials-crypto";
import { getOAuthCreds } from "@/lib/marketing/token-refresh";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Returns a lazy accessor that fetches (and refreshes, if needed) a Google
 * OAuth access token for a given apiConnections row. Use for Sheets / BigQuery
 * destinations.
 */
export function googleAccessTokenAccessor(connectionId: Id<"apiConnections">) {
  return async (): Promise<string> => {
    const convex = getConvexClient();
    const connection = await convex.query(api.apiConnections.getById, { id: connectionId });
    if (!connection) throw new Error("Destination connection not found");
    const creds = await getOAuthCreds(connection);
    return creds.accessToken;
  };
}

/**
 * Returns the raw Notion integration token for a given apiConnections row.
 * Notion connections are stored as authType="api_key" with { apiKey } in
 * encryptedCreds.
 */
export function notionTokenAccessor(connectionId: Id<"apiConnections">) {
  return async (): Promise<string> => {
    const convex = getConvexClient();
    const connection = await convex.query(api.apiConnections.getById, { id: connectionId });
    if (!connection) throw new Error("Destination connection not found");
    const raw = decryptCredentials(connection.encryptedCreds, connection.credsIv);
    const parsed = JSON.parse(raw) as { apiKey?: string };
    if (!parsed.apiKey) throw new Error("Notion connection has no apiKey");
    return parsed.apiKey.trim();
  };
}
