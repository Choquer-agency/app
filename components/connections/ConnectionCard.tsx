"use client";

import { useState } from "react";
import { ApiConnection, PlatformConfig, ConnectionStatus } from "@/types";
import ConnectionStatusBadge from "./ConnectionStatusBadge";
import ApiKeyModal from "./ApiKeyModal";

interface ConnectionCardProps {
  platform: PlatformConfig;
  connection?: ApiConnection;
  scope: "org" | "client";
  clientId?: string;
  canManage: boolean;
  onRefresh: () => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function ConnectionCard({
  platform,
  connection,
  scope,
  clientId,
  canManage,
  onRefresh,
}: ConnectionCardProps) {
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const status: ConnectionStatus = connection?.status as ConnectionStatus || "disconnected";
  const isConnected = status === "active";

  async function handleDisconnect() {
    if (!connection || !confirm(`Disconnect ${platform.name}?`)) return;
    setDisconnecting(true);
    try {
      await fetch(`/api/admin/connections?id=${connection.id}`, { method: "DELETE" });
      onRefresh();
    } catch {
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleVerify() {
    if (!connection) return;
    setVerifying(true);
    try {
      await fetch(`/api/admin/connections/${connection.id}/verify`, { method: "POST" });
      onRefresh();
    } catch {
    } finally {
      setVerifying(false);
    }
  }

  function handleConnect() {
    if (platform.authType === "api_key") {
      setShowApiKeyModal(true);
    } else {
      // OAuth — redirect to start flow
      const params = new URLSearchParams({
        platform: platform.platform,
        scope,
        ...(clientId && { clientId }),
      });
      window.location.href = `/api/admin/connections/oauth/start?${params}`;
    }
  }

  return (
    <>
      <div className="rounded-xl bg-white border border-[var(--border)] p-4 flex items-center gap-4 hover:shadow-sm transition">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
          style={{ backgroundColor: platform.color }}
        >
          {platform.name.charAt(0)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--foreground)]">{platform.name}</span>
            <ConnectionStatusBadge status={status} />
          </div>
          {isConnected && connection?.lastVerifiedAt ? (
            <p className="text-[10px] text-[var(--muted)] mt-0.5">
              {connection.oauthAccountName ? `${connection.oauthAccountName} · ` : ""}
              Verified {timeAgo(connection.lastVerifiedAt)}
            </p>
          ) : connection?.lastError ? (
            <p className="text-[10px] text-red-500 mt-0.5">{connection.lastError}</p>
          ) : (
            <p className="text-[10px] text-[var(--muted)] mt-0.5">{platform.description}</p>
          )}
        </div>

        {canManage && (
          <div className="flex items-center gap-1.5 shrink-0">
            {isConnected ? (
              <>
                <button
                  onClick={handleVerify}
                  disabled={verifying}
                  className="text-[10px] px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-[var(--muted)] hover:bg-gray-50 transition disabled:opacity-50"
                >
                  {verifying ? "..." : "Verify"}
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="text-[10px] px-2.5 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition disabled:opacity-50"
                >
                  {disconnecting ? "..." : "Disconnect"}
                </button>
              </>
            ) : (
              <button
                onClick={handleConnect}
                className="text-sm font-medium px-5 py-2.5 rounded-lg bg-[var(--accent)] text-white hover:opacity-90 transition"
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
          scope={scope}
          clientId={clientId}
          onClose={() => setShowApiKeyModal(false)}
          onSaved={() => {
            setShowApiKeyModal(false);
            onRefresh();
          }}
        />
      )}
    </>
  );
}
