"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ApiConnection, PlatformConfig, ConnectionStatus } from "@/types";
import { getClientPlatforms } from "@/lib/platform-configs";
import { useClients } from "@/hooks/useClients";
import ConnectionStatusBadge from "./ConnectionStatusBadge";

export default function AllClientPlatforms({ canManage }: { canManage: boolean }) {
  const rawConnections = useQuery(api.apiConnections.list, { scope: "client" });
  const { clients: allClients, isLoading: clientsLoading } = useClients();

  const connections: ApiConnection[] = useMemo(
    () =>
      (rawConnections ?? []).map((c: any) => ({
        id: c._id,
        platform: c.platform,
        scope: c.scope,
        clientId: c.clientId ?? null,
        authType: c.authType,
        status: c.status,
        lastVerifiedAt: c.lastVerifiedAt ?? null,
        lastError: c.lastError ?? null,
        displayName: c.displayName ?? null,
        oauthAccountName: c.oauthAccountName ?? null,
        oauthAccountId: c.oauthAccountId ?? null,
        createdAt: new Date(c._creationTime).toISOString(),
      })),
    [rawConnections]
  );

  const clients = useMemo(
    () =>
      allClients
        .filter((c) => c.clientStatus === "active")
        .map((c) => ({ id: String(c.id), name: c.name })),
    [allClients]
  );

  const loading = rawConnections === undefined || clientsLoading;

  const platforms = getClientPlatforms();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[var(--accent)]" />
      </div>
    );
  }

  // Group connections by platform
  const connectionsByPlatform = new Map<string, ApiConnection[]>();
  for (const conn of connections) {
    const list = connectionsByPlatform.get(conn.platform) || [];
    list.push(conn);
    connectionsByPlatform.set(conn.platform, list);
  }

  return (
    <div className="space-y-3">
      {platforms.map((p: PlatformConfig) => {
        const platformConns = connectionsByPlatform.get(p.platform) || [];
        const connectedCount = platformConns.filter((c) => c.status === "active").length;

        return (
          <div
            key={p.platform}
            className="rounded-xl bg-white border border-[var(--border)] p-4 hover:shadow-sm transition"
          >
            <div className="flex items-center gap-4">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
                style={{ backgroundColor: p.color }}
              >
                {p.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--foreground)]">{p.name}</span>
                  {connectedCount > 0 ? (
                    <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-[#BDFFE8] text-[#0d5a3f]">
                      {connectedCount} client{connectedCount !== 1 ? "s" : ""} connected
                    </span>
                  ) : (
                    <ConnectionStatusBadge status="disconnected" />
                  )}
                </div>
                <p className="text-[10px] text-[var(--muted)] mt-0.5">
                  {p.description}
                </p>
              </div>
              <div className="shrink-0">
                <span className="text-[10px] text-[var(--muted)] px-2 py-1 rounded-lg bg-gray-50">
                  {p.authType === "oauth2" ? "OAuth" : "API Key"}
                </span>
              </div>
            </div>

            {platformConns.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[var(--border)]">
                <div className="space-y-1.5">
                  {platformConns.map((conn) => {
                    const client = clients.find((c) => c.id === conn.clientId);
                    return (
                      <div key={conn.id} className="flex items-center gap-2 text-xs">
                        <span className="text-[var(--foreground)] font-medium">{client?.name || "Unknown"}</span>
                        <ConnectionStatusBadge status={conn.status as ConnectionStatus} />
                        {conn.oauthAccountName && (
                          <span className="text-[var(--muted)]">{conn.oauthAccountName}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
