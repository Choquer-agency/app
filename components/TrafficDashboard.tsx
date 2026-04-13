"use client";

import { Fragment, useState, useEffect, useCallback } from "react";

interface CompanyRow {
  companyId: string;
  companyName: string;
  domain?: string;
  industry?: string;
  employeeCount?: string;
  country?: string;
  city?: string;
  leadId?: string;
  uniqueVisitors: number;
  totalVisits: number;
  lastVisit: string;
  intentLevel: "new" | "returning" | "high_intent";
}

interface TrafficStats {
  totalVisitors7d: number;
  identifiedCompanies7d: number;
  identificationRate: number;
  highIntentCount: number;
}

interface UnknownPage {
  path: string;
  title?: string;
  referrer?: string;
  durationSeconds?: number;
  timestamp: string;
}

interface UnknownVisitorRow {
  visitorId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  visitCount: number;
  intentLevel: "new" | "returning" | "high_intent";
  device?: string;
  browser?: string;
  os?: string;
  country?: string;
  region?: string;
  city?: string;
  pageCount: number;
  uniquePaths: number;
  totalDuration: number;
  pages: UnknownPage[];
}

interface TrafficData {
  stats: TrafficStats;
  companies: CompanyRow[];
  unknownVisitorCount: number;
  unknownVisitors?: UnknownVisitorRow[];
}

const INTENT_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: "New", color: "text-gray-600", bg: "bg-gray-100" },
  returning: { label: "Returning", color: "text-blue-700", bg: "bg-blue-50" },
  high_intent: { label: "High Intent", color: "text-amber-700", bg: "bg-amber-50" },
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function TrafficDashboard() {
  const [data, setData] = useState<TrafficData | null>(null);
  const [loading, setLoading] = useState(true);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "new" | "returning" | "high_intent">("all");
  const [expandedVisitorId, setExpandedVisitorId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/traffic");
      if (res.ok) setData(await res.json());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handlePromote(companyId: string) {
    setPromotingId(companyId);
    try {
      const res = await fetch(`/api/admin/traffic/${companyId}`, { method: "POST" });
      if (res.ok) {
        await fetchData();
      }
    } catch {
      // silent
    } finally {
      setPromotingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-[var(--muted)]">
        <p className="text-lg font-medium mb-2">No traffic data yet</p>
        <p className="text-sm">
          Add a tracking snippet to your website via{" "}
          <a href="/admin/settings/visitor-tracking" className="text-[var(--accent)] underline">
            Settings &gt; Visitor ID
          </a>
        </p>
      </div>
    );
  }

  const { stats, companies, unknownVisitorCount, unknownVisitors = [] } = data;
  const highIntentCompanies = companies.filter((c) => c.intentLevel === "high_intent");

  const filteredCompanies =
    filter === "all" ? companies : companies.filter((c) => c.intentLevel === filter);

  const filteredUnknownVisitors =
    filter === "all"
      ? unknownVisitors
      : unknownVisitors.filter((v) => v.intentLevel === filter);

  return (
    <div>
      {/* High-intent alert banner */}
      {highIntentCompanies.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">
                {highIntentCompanies.length} high-intent visitor{highIntentCompanies.length !== 1 ? "s" : ""} detected
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                {highIntentCompanies.slice(0, 3).map((c) => c.companyName).join(", ")}
                {highIntentCompanies.length > 3 ? ` and ${highIntentCompanies.length - 3} more` : ""}
                {" — consider reaching out."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Visitors (7d)" value={stats.totalVisitors7d} />
        <StatCard label="Companies (7d)" value={stats.identifiedCompanies7d} />
        <StatCard label="ID Rate" value={`${stats.identificationRate}%`} />
        <StatCard
          label="High Intent"
          value={stats.highIntentCount}
          highlight={stats.highIntentCount > 0}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-[var(--muted)]">Filter:</span>
        {(["all", "high_intent", "returning", "new"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 text-xs rounded-full border transition ${
              filter === f
                ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                : "border-[var(--border)] text-[var(--muted)] hover:border-gray-300"
            }`}
          >
            {f === "all" ? "All" : f === "high_intent" ? "High Intent" : f === "returning" ? "Returning" : "New"}
          </button>
        ))}
        {unknownVisitorCount > 0 && (
          <span className="ml-auto text-xs text-[var(--muted)]">
            {unknownVisitorCount} unidentified visitor{unknownVisitorCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Company table */}
      {filteredCompanies.length === 0 ? (
        <div className="text-center py-8 text-[var(--muted)] text-sm">
          No identified companies yet{unknownVisitorCount > 0 ? " — see anonymous visitors below" : ""}
        </div>
      ) : (
        <div className="border border-[var(--border)] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-[var(--border)]">
                <th className="text-left px-4 py-3 font-medium text-[var(--muted)]">Intent</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--muted)]">Company</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--muted)] hidden md:table-cell">Industry</th>
                <th className="text-right px-4 py-3 font-medium text-[var(--muted)]">Visits</th>
                <th className="text-right px-4 py-3 font-medium text-[var(--muted)] hidden sm:table-cell">Visitors</th>
                <th className="text-right px-4 py-3 font-medium text-[var(--muted)]">Last Visit</th>
                <th className="text-right px-4 py-3 font-medium text-[var(--muted)]">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredCompanies.map((company) => {
                const badge = INTENT_BADGES[company.intentLevel] || INTENT_BADGES.new;
                return (
                  <tr
                    key={company.companyId}
                    className="border-b border-[var(--border)] last:border-b-0 hover:bg-gray-50 transition"
                  >
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.color} ${badge.bg}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`/admin/crm/traffic/${company.companyId}`}
                        className="font-medium text-[var(--foreground)] hover:text-[var(--accent)] transition"
                      >
                        {company.companyName}
                      </a>
                      {company.domain && (
                        <span className="block text-xs text-[var(--muted)]">{company.domain}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)] hidden md:table-cell">
                      {company.industry || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{company.totalVisits}</td>
                    <td className="px-4 py-3 text-right font-mono hidden sm:table-cell">
                      {company.uniqueVisitors}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--muted)]">
                      {timeAgo(company.lastVisit)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {company.leadId ? (
                        <a
                          href="/admin/crm/leads"
                          className="text-xs text-emerald-600 hover:underline"
                        >
                          In CRM
                        </a>
                      ) : (
                        <button
                          onClick={() => handlePromote(company.companyId)}
                          disabled={promotingId === company.companyId}
                          className="text-xs text-[var(--accent)] hover:underline disabled:opacity-50"
                        >
                          {promotingId === company.companyId ? "..." : "Promote"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Anonymous visitors — visitors IPinfo couldn't match to a company
          (residential ISPs, mobile carriers, VPNs). Still useful: pages,
          duration, device, location. */}
      {filteredUnknownVisitors.length > 0 && (
        <div className="mt-10">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">
              Anonymous Visitors
            </h2>
            <span className="text-xs text-[var(--muted)]">
              {filteredUnknownVisitors.length} visitor{filteredUnknownVisitors.length !== 1 ? "s" : ""} — no company match
            </span>
          </div>
          <div className="border border-[var(--border)] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-[var(--border)]">
                  <th className="text-left px-4 py-3 font-medium text-[var(--muted)]">Intent</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--muted)]">Device</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--muted)] hidden md:table-cell">Location</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--muted)]">Pages</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--muted)] hidden sm:table-cell">Time</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--muted)]">Visits</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--muted)]">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {filteredUnknownVisitors.map((v) => {
                  const badge = INTENT_BADGES[v.intentLevel] || INTENT_BADGES.new;
                  const deviceLabel = [v.device, v.browser].filter(Boolean).join(" · ") || "Unknown";
                  const locationLabel = [v.city, v.region, v.country].filter(Boolean).join(", ") || "Unknown";
                  const isExpanded = expandedVisitorId === v.visitorId;
                  return (
                    <Fragment key={v.visitorId}>
                      <tr
                        className="border-b border-[var(--border)] last:border-b-0 hover:bg-gray-50 transition cursor-pointer"
                        onClick={() =>
                          setExpandedVisitorId(isExpanded ? null : v.visitorId)
                        }
                      >
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.color} ${badge.bg}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-[var(--foreground)]">{deviceLabel}</div>
                          {v.os && (
                            <div className="text-xs text-[var(--muted)]">{v.os}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[var(--muted)] hidden md:table-cell">
                          {locationLabel}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {v.pageCount}
                        </td>
                        <td className="px-4 py-3 text-right font-mono hidden sm:table-cell">
                          {formatDuration(v.totalDuration)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">{v.visitCount}</td>
                        <td className="px-4 py-3 text-right text-[var(--muted)]">
                          <span className="inline-flex items-center gap-1">
                            {timeAgo(v.lastSeenAt)}
                            <svg
                              className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                            </svg>
                          </span>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-gray-50 border-b border-[var(--border)]">
                          <td colSpan={7} className="px-4 py-4">
                            {v.pages.length === 0 ? (
                              <div className="text-xs text-[var(--muted)]">
                                No page view details recorded.
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <div className="text-xs font-medium text-[var(--muted)] mb-2">
                                  Page views ({v.pages.length})
                                </div>
                                {v.pages.map((p, idx) => (
                                  <div
                                    key={`${v.visitorId}-${idx}`}
                                    className="flex items-center justify-between gap-4 text-xs py-1"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="text-[var(--foreground)] font-mono truncate">
                                        {p.path}
                                      </div>
                                      {p.title && (
                                        <div className="text-[var(--muted)] truncate">
                                          {p.title}
                                        </div>
                                      )}
                                    </div>
                                    <div className="text-[var(--muted)] shrink-0 font-mono">
                                      {p.durationSeconds
                                        ? formatDuration(p.durationSeconds)
                                        : "—"}
                                    </div>
                                    <div className="text-[var(--muted)] shrink-0 w-24 text-right">
                                      {timeAgo(p.timestamp)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 1) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        highlight
          ? "border-amber-200 bg-amber-50"
          : "border-[var(--border)] bg-white"
      }`}
    >
      <div className="text-xs text-[var(--muted)] mb-1">{label}</div>
      <div
        className={`text-2xl font-bold ${
          highlight ? "text-amber-700" : "text-[var(--foreground)]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
