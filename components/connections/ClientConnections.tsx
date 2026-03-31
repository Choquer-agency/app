"use client";

import { useState, useEffect, useCallback } from "react";
import { ApiConnection, PlatformConfig } from "@/types";
import { getClientPlatforms } from "@/lib/platform-configs";
import ConnectionCard from "./ConnectionCard";

export default function ClientConnections({
  clientId,
  canManage,
}: {
  clientId: string;
  canManage: boolean;
}) {
  const [connections, setConnections] = useState<ApiConnection[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/connections?clientId=${clientId}`);
      if (res.ok) {
        setConnections(await res.json());
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const platforms = getClientPlatforms();
  const connectionMap = new Map(connections.map((c) => [c.platform, c]));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">Connected Accounts</h3>
      <div className="space-y-2">
        {platforms.map((p: PlatformConfig) => (
          <ConnectionCard
            key={p.platform}
            platform={p}
            connection={connectionMap.get(p.platform)}
            scope="client"
            clientId={clientId}
            canManage={canManage}
            onRefresh={fetchConnections}
          />
        ))}
      </div>
    </div>
  );
}
