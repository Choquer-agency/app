"use client";

import { useState, useEffect } from "react";
import { ClientHoursSummary as ClientHoursData } from "@/types";
import { friendlyMonthFull } from "@/lib/date-format";

interface ClientHoursSummaryProps {
  clientId: number;
  month?: string;
}

function formatHours(hours: number): string {
  if (hours < 0.1) return "0h";
  return `${Math.round(hours * 10) / 10}h`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatEntryDate(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const isToday = d.toDateString() === today.toDateString();
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (isToday) return `Today · ${time}`;
  if (isYesterday) return `Yesterday · ${time}`;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${time}`;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function ClientHoursSummary({ clientId, month }: ClientHoursSummaryProps) {
  const [data, setData] = useState<ClientHoursData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    if (month) return month;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  });

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/clients/${clientId}/hours?month=${selectedMonth}`);
        if (res.ok) setData(await res.json());
      } catch {} finally {
        setLoading(false);
      }
    }
    load();
  }, [clientId, selectedMonth]);

  function changeMonth(delta: number) {
    const [yStr, mStr] = selectedMonth.split("-");
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10) - 1;
    const d = new Date(y, m + delta, 1);
    setSelectedMonth(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
    );
  }

  const monthLabel = friendlyMonthFull(selectedMonth);
  const entries = data?.entries ?? [];

  const percent = data
    ? data.includedHours > 0
      ? Math.min(100, data.percentUsed)
      : 0
    : 0;
  const statusColor = data
    ? data.status === "exceeded"
      ? "text-rose-600"
      : data.status === "warning"
        ? "text-amber-600"
        : "text-emerald-600"
    : "text-[var(--muted)]";
  const barColor = data
    ? data.status === "exceeded"
      ? "bg-rose-500"
      : data.status === "warning"
        ? "bg-amber-500"
        : "bg-emerald-500"
    : "bg-gray-300";

  return (
    <div className="space-y-6">
      {/* Header with month navigator */}
      {(() => {
        const atMin = !!data?.minMonth && selectedMonth <= data.minMonth;
        const atMax = !!data?.maxMonth && selectedMonth >= data.maxMonth;
        const arrowCls =
          "p-2 rounded-md transition text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--hover-tan)]";
        return (
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-[var(--foreground)]">Hours</h2>
            <div className="flex items-center gap-1">
              {atMin ? (
                <span className="w-8 h-8" />
              ) : (
                <button onClick={() => changeMonth(-1)} className={arrowCls}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                  </svg>
                </button>
              )}
              <span className="text-base font-semibold text-[var(--foreground)] min-w-[140px] text-center">
                {monthLabel}
              </span>
              {atMax ? (
                <span className="w-8 h-8" />
              ) : (
                <button onClick={() => changeMonth(1)} className={arrowCls}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {loading ? (
        <div className="animate-pulse rounded-2xl border border-[var(--border)] p-6 space-y-3" style={{ background: "#FAF9F5" }}>
          <div className="h-4 bg-white rounded w-40" />
          <div className="h-10 bg-white rounded w-56" />
          <div className="h-2.5 bg-white rounded w-full" />
        </div>
      ) : !data ? null : (
        <>
          {/* Per-pool cards */}
          {(data.pools ?? []).length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(data.pools ?? []).map((pool) => {
                const poolStatusColor =
                  pool.status === "exceeded"
                    ? "text-rose-600"
                    : pool.status === "warning"
                      ? "text-amber-600"
                      : "text-emerald-600";
                const poolBarColor =
                  pool.status === "exceeded"
                    ? "bg-rose-500"
                    : pool.status === "warning"
                      ? "bg-amber-500"
                      : "bg-emerald-500";
                const poolPercent = Math.min(100, pool.percent);
                const suffix = pool.type === "recurring" ? "monthly" : "top-up";
                return (
                  <div
                    key={pool.id}
                    className="rounded-2xl border border-[var(--border)] p-6"
                    style={{ background: "#FAF9F5" }}
                  >
                    <div className="flex items-baseline justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)] mb-1">
                          {pool.type === "recurring" ? "Retainer" : "Top-up"}
                        </div>
                        <div className="text-sm font-semibold text-[var(--foreground)] truncate">
                          {pool.name}
                        </div>
                        <div className="flex items-baseline gap-2 mt-2">
                          <span className="text-2xl font-bold text-[var(--foreground)]">
                            {formatHours(pool.used)}
                          </span>
                          <span className="text-sm text-[var(--muted)]">
                            / {formatHours(pool.included)} {suffix}
                          </span>
                        </div>
                      </div>
                      <div className={`text-xl font-bold ${poolStatusColor}`}>
                        {pool.percent}%
                      </div>
                    </div>
                    <div className="h-2.5 bg-white rounded-full overflow-hidden border border-[var(--border)]">
                      <div
                        className={`h-full rounded-full transition-all ${poolBarColor}`}
                        style={{ width: `${poolPercent}%` }}
                      />
                    </div>
                    {pool.type === "one_time" && (
                      <p className="text-xs text-[var(--muted)] mt-3">
                        <span className="font-medium text-[var(--foreground)]">
                          {formatHours(pool.remaining)}
                        </span>{" "}
                        remaining in this top-up
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Fallback when no pools but hours logged */
            <div className="rounded-2xl border border-[var(--border)] p-6" style={{ background: "#FAF9F5" }}>
              <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)] mb-1">
                Hours logged
              </div>
              <span className="text-3xl font-bold text-[var(--foreground)]">
                {formatHours(data.loggedHours)}
              </span>
              <p className="text-xs text-[var(--muted)] mt-2">No hour cap set for this client.</p>
            </div>
          )}

          {/* Entry log */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">
              Time log ({entries.length})
            </h3>
            {entries.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">
                No time has been logged on this client for {monthLabel}.
              </p>
            ) : (
              <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap w-[200px]">Team Member</th>
                      <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Ticket</th>
                      <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap w-[150px]">Started</th>
                      <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap w-[100px]">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr
                        key={e.id}
                        className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover-tan)] transition"
                      >
                        <td className="px-2 py-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                              style={{ backgroundColor: e.memberColor || "#6b7280" }}
                            >
                              {initials(e.memberName)}
                            </div>
                            <span className="text-sm font-medium text-[var(--foreground)] truncate">
                              {e.memberName}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-3 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <a
                              href={`/admin/tickets?ticket=${e.ticketId}`}
                              className="text-xs font-mono text-[var(--muted)] hover:text-[var(--accent)] transition shrink-0"
                            >
                              {e.ticketNumber}
                            </a>
                            <span className="text-sm text-[var(--foreground)] truncate">
                              {e.ticketTitle}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-3 text-xs text-[var(--muted)] whitespace-nowrap">
                          {formatEntryDate(e.start)}
                        </td>
                        <td className="px-2 py-3 text-right text-sm font-semibold text-[var(--foreground)] whitespace-nowrap">
                          {e.end === null ? (
                            <span className="inline-flex items-center gap-1.5 text-emerald-600">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Running
                            </span>
                          ) : (
                            formatDuration(e.seconds)
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
