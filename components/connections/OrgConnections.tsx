"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ApiConnection, PlatformConfig } from "@/types";
import { getOrgPlatforms } from "@/lib/platform-configs";
import ConnectionCard from "./ConnectionCard";

export default function OrgConnections({ canManage }: { canManage: boolean }) {
  const rawConnections = useQuery(api.apiConnections.list, { scope: "org" });
  const loading = rawConnections === undefined;

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
          onRefresh={() => {/* Convex auto-updates via useQuery */}}
        />
      ))}
    </div>
  );
}
