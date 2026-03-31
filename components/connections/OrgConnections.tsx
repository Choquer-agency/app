"use client";

import { useState, useEffect, useCallback } from "react";
import { ApiConnection, PlatformConfig } from "@/types";
import { getOrgPlatforms } from "@/lib/platform-configs";
import ConnectionCard from "./ConnectionCard";

export default function OrgConnections({ canManage }: { canManage: boolean }) {
  const [connections, setConnections] = useState<ApiConnection[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/connections");
      if (res.ok) {
        setConnections(await res.json());
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const platforms = getOrgPlatforms();
  const connectionMap = new Map(connections.map((c) => [c.platform, c]));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {platforms.map((p: PlatformConfig) => (
        <ConnectionCard
          key={p.platform}
          platform={p}
          connection={connectionMap.get(p.platform)}
          scope="org"
          canManage={canManage}
          onRefresh={fetchConnections}
        />
      ))}
    </div>
  );
}
