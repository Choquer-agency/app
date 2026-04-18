"use client";

import { useState, useEffect } from "react";

interface Company {
  _id: string;
  name: string;
  domain?: string;
  industry?: string;
  employeeCount?: string;
  city?: string;
  region?: string;
  country?: string;
  description?: string;
  linkedinUrl?: string;
  leadId?: string;
}

interface PageView {
  _id: string;
  path: string;
  title?: string;
  referrer?: string;
  durationSeconds?: number;
  timestamp: string;
  sessionId: string;
}

interface Visitor {
  _id: string;
  fingerprint: string;
  firstSeenAt: string;
  lastSeenAt: string;
  visitCount: number;
  device?: string;
  browser?: string;
  os?: string;
  country?: string;
  city?: string;
  intentLevel: string;
  pageViews: PageView[];
}

interface CompanyDetail {
  company: Company;
  visitors: Visitor[];
  stats: {
    uniqueVisitors: number;
    totalVisits: number;
    uniquePages: number;
    topPages: string[];
    totalTimeSeconds: number;
    firstVisit: string;
    lastVisit: string;
  };
  timeline: PageView[];
}

const INTENT_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: "New", color: "text-gray-600", bg: "bg-gray-100" },
  returning: { label: "Returning", color: "text-blue-700", bg: "bg-blue-50" },
  high_intent: { label: "High Intent", color: "text-amber-700", bg: "bg-amber-50" },
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CompanyTrafficDetail({ companyId }: { companyId: string }) {
  const [data, setData] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/admin/traffic/${companyId}`);
        if (res.ok) setData(await res.json());
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [companyId]);

  async function handlePromote() {
    setPromoting(true);
    try {
      const res = await fetch(`/api/admin/traffic/${companyId}`, { method: "POST" });
      if (res.ok) {
        // Refetch
        const res2 = await fetch(`/api/admin/traffic/${companyId}`);
        if (res2.ok) setData(await res2.json());
      }
    } catch {
      // silent
    } finally {
      setPromoting(false);
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
      <div className="text-center py-20 text-[var(--muted)]">Company not found</div>
    );
  }

  const { company, visitors, stats, timeline } = data;
  const overallIntent = visitors.some((v) => v.intentLevel === "high_intent")
    ? "high_intent"
    : visitors.some((v) => v.intentLevel === "returning")
      ? "returning"
      : "new";
  const intentBadge = INTENT_BADGES[overallIntent] || INTENT_BADGES.new;

  return (
    <div>
      {/* Back link */}
      <a
        href="/admin/crm/traffic"
        className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition mb-6"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Back to Traffic
      </a>

      {/* Company header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-bold text-[var(--foreground)]">{company.name}</h1>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${intentBadge.color} ${intentBadge.bg}`}>
              {intentBadge.label}
            </span>
          </div>
          {company.domain && (
            <a
              href={`https://${company.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[var(--accent)] hover:underline"
            >
              {company.domain}
            </a>
          )}
          <div className="flex items-center gap-4 mt-2 text-xs text-[var(--muted)]">
            {company.industry && <span>{company.industry}</span>}
            {company.employeeCount && <span>{company.employeeCount} employees</span>}
            {company.city && company.country && (
              <span>{company.city}, {company.country}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {company.linkedinUrl && (
            <a
              href={company.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs border border-[var(--border)] rounded-lg hover:bg-gray-50 transition"
            >
              LinkedIn
            </a>
          )}
          {company.leadId ? (
            <a
              href="/admin/crm/leads"
              className="px-3 py-1.5 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg"
            >
              View in CRM
            </a>
          ) : (
            <button
              onClick={handlePromote}
              disabled={promoting}
              className="px-3 py-1.5 text-xs bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {promoting ? "Promoting..." : "Promote to Lead"}
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <MiniStat label="Unique Visitors" value={stats.uniqueVisitors} />
        <MiniStat label="Total Visits" value={stats.totalVisits} />
        <MiniStat label="Pages Viewed" value={stats.uniquePages} />
        <MiniStat label="Time on Site" value={formatDuration(stats.totalTimeSeconds)} />
        <MiniStat label="First Visit" value={stats.firstVisit ? formatDate(stats.firstVisit) : "—"} />
      </div>

      {/* Top pages */}
      {stats.topPages.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Top Pages Visited</h2>
          <div className="flex flex-wrap gap-2">
            {stats.topPages.map((page) => (
              <span
                key={page}
                className="px-3 py-1 text-xs bg-gray-100 text-[var(--foreground)] rounded-full font-mono"
              >
                {page}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Visit timeline */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Visit Timeline</h2>
        <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
          {timeline.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-[var(--muted)]">No page views recorded</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Time</th>
                  <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Page</th>
                  <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap hidden sm:table-cell">Title</th>
                  <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Duration</th>
                </tr>
              </thead>
              <tbody>
                {timeline.map((pv) => (
                  <tr key={pv._id} className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--hover-tan)]">
                    <td className="px-2 py-3 text-[var(--muted)] whitespace-nowrap">
                      {formatDate(pv.timestamp)}
                    </td>
                    <td className="px-2 py-3 font-mono text-xs">{pv.path}</td>
                    <td className="px-2 py-3 text-[var(--muted)] hidden sm:table-cell truncate max-w-[200px]">
                      {pv.title || "—"}
                    </td>
                    <td className="px-2 py-3 text-right text-[var(--muted)]">
                      {pv.durationSeconds ? formatDuration(pv.durationSeconds) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Visitors breakdown */}
      <div>
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">
          Visitors ({visitors.length})
        </h2>
        <div className="space-y-3">
          {visitors.map((v, idx) => {
            const vBadge = INTENT_BADGES[v.intentLevel] || INTENT_BADGES.new;
            return (
              <div
                key={v._id}
                className="border border-[var(--border)] rounded-xl px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[var(--muted)]">Visitor {idx + 1}</span>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${vBadge.color} ${vBadge.bg}`}>
                      {vBadge.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[var(--muted)]">
                    <span>{v.visitCount} visit{v.visitCount !== 1 ? "s" : ""}</span>
                    {v.device && <span>{v.device}</span>}
                    {v.browser && <span>{v.browser}</span>}
                    {v.os && <span>{v.os}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-[var(--muted)]">
                  <span>First: {formatDate(v.firstSeenAt)}</span>
                  <span>Last: {formatDate(v.lastSeenAt)}</span>
                  {v.city && v.country && <span>{v.city}, {v.country}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white px-4 py-3">
      <div className="text-xs text-[var(--muted)] mb-0.5">{label}</div>
      <div className="text-lg font-bold text-[var(--foreground)]">{value}</div>
    </div>
  );
}
