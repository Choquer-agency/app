"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ApiConnection, PlatformConfig, ConnectionStatus } from "@/types";
import { getClientPlatforms } from "@/lib/platform-configs";
import { useClients } from "@/hooks/useClients";
import ConnectionStatusBadge from "./ConnectionStatusBadge";
import ApiKeyModal from "./ApiKeyModal";

export default function AllClientPlatforms({ canManage }: { canManage: boolean }) {
  const rawConnections = useQuery(api.apiConnections.list, { scope: "client" });
  const { clients: allClients, isLoading: clientsLoading } = useClients();
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);

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
        .map((c) => ({ id: String(c.id), name: c.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
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

  const connectionsByPlatformAndClient = new Map<string, Map<string, ApiConnection>>();
  for (const conn of connections) {
    if (!conn.clientId) continue;
    const inner =
      connectionsByPlatformAndClient.get(conn.platform) ?? new Map<string, ApiConnection>();
    inner.set(conn.clientId, conn);
    connectionsByPlatformAndClient.set(conn.platform, inner);
  }

  return (
    <div className="space-y-3">
      {platforms.map((p: PlatformConfig) => {
        const clientConns = connectionsByPlatformAndClient.get(p.platform) ?? new Map();
        const connectedCount = [...clientConns.values()].filter(
          (c) => c.status === "active"
        ).length;
        const isExpanded = expandedPlatform === p.platform;

        return (
          <div
            key={p.platform}
            className="rounded-xl bg-white border border-[var(--border)] hover:shadow-sm transition"
          >
            <button
              onClick={() =>
                setExpandedPlatform(isExpanded ? null : p.platform)
              }
              className="w-full p-4 flex items-center gap-4 text-left"
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
                style={{ backgroundColor: p.color }}
              >
                {p.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--foreground)]">
                    {p.name}
                  </span>
                  {connectedCount > 0 ? (
                    <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-[#BDFFE8] text-[#0d5a3f]">
                      {connectedCount} client{connectedCount !== 1 ? "s" : ""} connected
                    </span>
                  ) : (
                    <ConnectionStatusBadge status="disconnected" />
                  )}
                </div>
                <p className="text-[10px] text-[var(--muted)] mt-0.5">{p.description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-[var(--muted)] px-2 py-1 rounded-lg bg-gray-50">
                  {p.authType === "oauth2" ? "OAuth" : "API Key"}
                </span>
                <span className="text-[var(--muted)] text-sm">
                  {isExpanded ? "▾" : "▸"}
                </span>
              </div>
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 border-t border-[var(--border)] pt-3 space-y-1.5">
                {clients.length === 0 ? (
                  <p className="text-xs text-[var(--muted)]">No active clients.</p>
                ) : (
                  clients.map((client) => {
                    const conn = clientConns.get(client.id);
                    return (
                      <ClientRow
                        key={client.id}
                        clientId={client.id}
                        clientName={client.name}
                        platform={p}
                        connection={conn}
                        canManage={canManage}
                      />
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ClientRow({
  clientId,
  clientName,
  platform,
  connection,
  canManage,
}: {
  clientId: string;
  clientName: string;
  platform: PlatformConfig;
  connection?: ApiConnection;
  canManage: boolean;
}) {
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const status: ConnectionStatus =
    (connection?.status as ConnectionStatus) ?? "disconnected";
  const isConnected = status === "active";

  function handleConnect() {
    if (platform.authType === "api_key") {
      setShowApiKeyModal(true);
    } else {
      const params = new URLSearchParams({
        platform: platform.platform,
        scope: "client",
        clientId,
      });
      window.location.href = `/api/admin/connections/oauth/start?${params}`;
    }
  }

  async function handleDisconnect() {
    if (!connection) return;
    if (!confirm(`Disconnect ${platform.name} for ${clientName}?`)) return;
    setDisconnecting(true);
    try {
      await fetch(`/api/admin/connections?id=${connection.id}`, { method: "DELETE" });
      // The parent subscribes via useQuery; refresh happens automatically.
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 py-2 text-xs">
        <span className="text-[var(--foreground)] font-medium flex-1 truncate">
          {clientName}
        </span>
        <ConnectionStatusBadge status={status} />
        {connection?.oauthAccountName && (
          <span className="text-[var(--muted)] text-[10px] truncate max-w-[140px]">
            {connection.oauthAccountName}
          </span>
        )}
        {canManage && (
          <div className="flex items-center gap-1 shrink-0">
            {isConnected ? (
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="text-[10px] px-2.5 py-1 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition disabled:opacity-50"
              >
                {disconnecting ? "..." : "Disconnect"}
              </button>
            ) : (
              <button
                onClick={handleConnect}
                className="text-xs font-medium px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:opacity-90 transition"
              >
                Connect
              </button>
            )}
          </div>
        )}
      </div>
      {showApiKeyModal && (
        <ApiKeyModal
          platform={platform}
          scope="client"
          clientId={clientId}
          onClose={() => setShowApiKeyModal(false)}
          onSaved={() => setShowApiKeyModal(false)}
        />
      )}
    </>
  );
}
