import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import { encryptCredentials, decryptCredentials } from "./credentials-crypto";
import { verifyConnection } from "./connection-verifiers";
import { ApiConnection, ConnectionPlatform } from "@/types";

function docToConnection(doc: any): ApiConnection {
  return {
    id: doc._id,
    platform: doc.platform,
    scope: doc.scope,
    clientId: doc.clientId || undefined,
    authType: doc.authType,
    oauthAccountId: doc.oauthAccountId || undefined,
    oauthAccountName: doc.oauthAccountName || undefined,
    oauthExpiresAt: doc.oauthExpiresAt || undefined,
    status: doc.status,
    lastVerifiedAt: doc.lastVerifiedAt || undefined,
    lastError: doc.lastError || undefined,
    displayName: doc.displayName || undefined,
    addedById: doc.addedById || undefined,
    createdAt: doc._creationTime
      ? new Date(doc._creationTime).toISOString()
      : new Date().toISOString(),
  };
}

export async function getOrgConnections(): Promise<ApiConnection[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.apiConnections.list, { scope: "org" });
  return docs.map(docToConnection);
}

export async function getClientConnections(clientId: string): Promise<ApiConnection[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.apiConnections.list, { clientId: clientId as any });
  return docs.map(docToConnection);
}

export async function getAllConnections(): Promise<ApiConnection[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.apiConnections.list, {});
  return docs.map(docToConnection);
}

export async function createApiKeyConnection(params: {
  platform: ConnectionPlatform;
  scope: "org" | "client";
  clientId?: string;
  apiKey: string;
  displayName?: string;
  addedById?: string;
}): Promise<ApiConnection> {
  const convex = getConvexClient();

  const { ciphertext, iv } = encryptCredentials(JSON.stringify({ apiKey: params.apiKey }));

  // Verify the key works before saving
  const verification = await verifyConnection(params.platform, { apiKey: params.apiKey });

  const id = await convex.mutation(api.apiConnections.upsert, {
    platform: params.platform,
    scope: params.scope,
    clientId: params.clientId as any,
    authType: "api_key",
    encryptedCreds: ciphertext,
    credsIv: iv,
    status: verification.success ? "active" : "error",
    lastVerifiedAt: verification.success ? new Date().toISOString() : undefined,
    lastError: verification.error || undefined,
    displayName: params.displayName,
    addedById: params.addedById as any,
  });

  // Log the event
  await convex.mutation(api.connectionLogs.create, {
    connectionId: id as any,
    event: "created",
    detail: verification.success ? "Connected and verified" : `Verification failed: ${verification.error}`,
    actorId: params.addedById as any,
  });

  const doc = await convex.query(api.apiConnections.getById, { id: id as any });
  return docToConnection(doc);
}

export async function createOAuthConnection(params: {
  platform: ConnectionPlatform;
  scope: "org" | "client";
  clientId?: string;
  accessToken: string;
  refreshToken: string;
  expiresAt?: string;
  accountId?: string;
  accountName?: string;
  addedById?: string;
}): Promise<ApiConnection> {
  const convex = getConvexClient();

  const creds = JSON.stringify({
    accessToken: params.accessToken,
    refreshToken: params.refreshToken,
  });
  const { ciphertext, iv } = encryptCredentials(creds);

  const id = await convex.mutation(api.apiConnections.upsert, {
    platform: params.platform,
    scope: params.scope,
    clientId: params.clientId as any,
    authType: "oauth2",
    encryptedCreds: ciphertext,
    credsIv: iv,
    oauthAccountId: params.accountId,
    oauthAccountName: params.accountName,
    oauthExpiresAt: params.expiresAt,
    status: "active",
    lastVerifiedAt: new Date().toISOString(),
    displayName: params.accountName,
    addedById: params.addedById as any,
  });

  await convex.mutation(api.connectionLogs.create, {
    connectionId: id as any,
    event: "created",
    detail: `OAuth connected as ${params.accountName || params.accountId || "unknown"}`,
    actorId: params.addedById as any,
  });

  const doc = await convex.query(api.apiConnections.getById, { id: id as any });
  return docToConnection(doc);
}

export async function disconnectConnection(id: string, actorId?: string): Promise<void> {
  const convex = getConvexClient();

  await convex.mutation(api.connectionLogs.create, {
    connectionId: id as any,
    event: "disconnected",
    actorId: actorId as any,
  });

  await convex.mutation(api.apiConnections.remove, { id: id as any });
}

export async function getDecryptedCredentials(id: string): Promise<Record<string, string>> {
  const convex = getConvexClient();
  const doc = await convex.query(api.apiConnections.getById, { id: id as any });
  if (!doc) throw new Error("Connection not found");
  const plaintext = decryptCredentials(doc.encryptedCreds, doc.credsIv);
  return JSON.parse(plaintext);
}

export async function verifyAndUpdateConnection(id: string): Promise<boolean> {
  const convex = getConvexClient();
  const doc = await convex.query(api.apiConnections.getById, { id: id as any });
  if (!doc) return false;

  const creds = JSON.parse(decryptCredentials(doc.encryptedCreds, doc.credsIv));
  const result = await verifyConnection(doc.platform, creds);

  await convex.mutation(api.apiConnections.updateStatus, {
    id: id as any,
    status: result.success ? "active" : "error",
    lastVerifiedAt: result.success ? new Date().toISOString() : undefined,
    lastError: result.error || undefined,
  });

  await convex.mutation(api.connectionLogs.create, {
    connectionId: id as any,
    event: result.success ? "verified" : "error",
    detail: result.success ? "Verification passed" : result.error,
  });

  return result.success;
}
