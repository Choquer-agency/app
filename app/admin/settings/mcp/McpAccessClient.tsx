"use client";

import { useEffect, useState } from "react";

interface AuditEntry {
  _id: string;
  _creationTime: number;
  actor: string;
  detail: string;
  tool?: string;
  success?: boolean;
  durationMs?: number;
  teamMemberId?: string;
}

const MCP_BASE =
  typeof window !== "undefined"
    ? `${window.location.origin}/api/mcp`
    : "https://choquer.app/api/mcp";

export default function McpAccessClient() {
  const [token, setToken] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [lastUsedAt, setLastUsedAt] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [canSeeAll, setCanSeeAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied] = useState<"url" | "token" | null>(null);

  const load = async () => {
    const [tRes, aRes] = await Promise.all([
      fetch("/api/admin/mcp/tokens"),
      fetch("/api/admin/mcp/audit"),
    ]);
    if (tRes.ok) {
      const { token, createdAt, lastUsedAt } = await tRes.json();
      setToken(token);
      setCreatedAt(createdAt ?? null);
      setLastUsedAt(lastUsedAt ?? null);
    }
    if (aRes.ok) {
      const { entries, canSeeAll } = await aRes.json();
      setAudit(entries);
      setCanSeeAll(canSeeAll);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const rotate = async () => {
    if (
      !confirm(
        "Rotate your token? Any device currently using the old one will stop working until you re-paste the new URL."
      )
    )
      return;
    setRotating(true);
    try {
      const res = await fetch("/api/admin/mcp/tokens", { method: "POST" });
      if (res.ok) {
        const { token } = await res.json();
        setToken(token);
        setCreatedAt(new Date().toISOString());
        setLastUsedAt(null);
      }
    } finally {
      setRotating(false);
    }
  };

  const copy = (text: string, which: "url" | "token") => {
    navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
  };

  const fullUrl = token ? `${MCP_BASE}?token=${token}` : "";

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">MCP Access</h1>
        <p className="text-sm text-gray-600 mt-1">
          Your personal connection URL for Claude Desktop. One token, works on any number
          of computers — just paste the same URL in each.
        </p>
      </header>

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : !token ? (
        <div className="text-sm text-red-600">Couldn't load your token.</div>
      ) : (
        <>
          <section className="border border-gray-200 rounded-lg p-6 bg-white space-y-5">
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="font-semibold text-gray-900">
                  Your Claude Desktop URL
                </h2>
                <span className="text-xs text-gray-500">
                  Created {createdAt ? formatDate(createdAt) : "—"}
                  {lastUsedAt && ` · last used ${formatRelative(lastUsedAt)}`}
                </span>
              </div>
              <div className="flex items-stretch gap-2">
                <code className="flex-1 px-3 py-3 bg-gray-50 border border-gray-200 rounded font-mono text-xs break-all">
                  {fullUrl}
                </code>
                <button
                  onClick={() => copy(fullUrl, "url")}
                  className="px-4 py-3 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 whitespace-nowrap font-medium"
                >
                  {copied === "url" ? "Copied!" : "Copy URL"}
                </button>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-5">
              <h3 className="font-medium text-gray-900 mb-2 text-sm">
                How to connect Claude Desktop
              </h3>
              <ol className="text-sm text-gray-700 space-y-2 list-decimal pl-5">
                <li>Copy the URL above.</li>
                <li>
                  In Claude Desktop → <b>Settings → Connectors → Add custom connector</b>.
                </li>
                <li>
                  Set <b>Name</b> to <code className="bg-gray-100 px-1 rounded">Choquer</code> and
                  paste the URL into the URL field. Leave the OAuth fields blank.
                </li>
                <li>Hit <b>Add</b>. You'll see all the Choquer tools become available.</li>
              </ol>
              <div className="mt-3 text-xs text-gray-500">
                Works on as many computers as you want — same URL, same token.
              </div>
            </div>

            <div className="border-t border-gray-100 pt-5 flex items-center justify-between">
              <div className="text-xs text-gray-500">
                Lost a laptop? Rotate the token to invalidate the old URL.
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => copy(token, "token")}
                  className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50"
                >
                  {copied === "token" ? "Copied!" : "Copy token only"}
                </button>
                <button
                  onClick={rotate}
                  disabled={rotating}
                  className="text-xs px-3 py-1.5 border border-red-300 text-red-700 rounded hover:bg-red-50 disabled:opacity-50"
                >
                  {rotating ? "Rotating…" : "Rotate token"}
                </button>
              </div>
            </div>
          </section>

          <section className="border border-gray-200 rounded-lg p-6 bg-white">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">
                Recent activity{" "}
                {canSeeAll && (
                  <span className="text-xs text-gray-500 font-normal">
                    (team-wide)
                  </span>
                )}
              </h2>
              <span className="text-xs text-gray-500">{audit.length} entries</span>
            </div>

            {audit.length === 0 ? (
              <div className="text-sm text-gray-500 py-4 text-center">
                No activity yet. Connect Claude Desktop and run your first tool.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 uppercase tracking-wide">
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 font-medium">When</th>
                    <th className="text-left py-2 font-medium">Tool</th>
                    <th className="text-left py-2 font-medium">Actor</th>
                    <th className="text-left py-2 font-medium">Duration</th>
                    <th className="text-left py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((e) => {
                    let detail: any = {};
                    try {
                      detail = JSON.parse(e.detail);
                    } catch {}
                    return (
                      <tr key={e._id} className="border-b border-gray-100">
                        <td className="py-2 text-gray-600">
                          {formatRelative(new Date(e._creationTime).toISOString())}
                        </td>
                        <td className="py-2 font-mono text-xs">{e.tool || "—"}</td>
                        <td className="py-2 text-gray-600">
                          {detail.callerName || e.actor}
                        </td>
                        <td className="py-2 text-gray-600">
                          {typeof e.durationMs === "number" ? `${e.durationMs}ms` : "—"}
                        </td>
                        <td className="py-2">
                          {e.success === false ? (
                            <span className="text-red-600">error</span>
                          ) : (
                            <span className="text-green-700">ok</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}
