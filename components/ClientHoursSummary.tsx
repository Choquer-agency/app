"use client";

import { useState, useEffect } from "react";
import { ClientHoursSummary as ClientHoursData } from "@/types";
import { friendlyMonthFull } from "@/lib/date-format";

interface ClientHoursSummaryProps {
  clientId: number;
  month?: string; // ISO date string for first day of month
}

function formatHours(hours: number): string {
  if (hours < 0.1) return "0h";
  return `${Math.round(hours * 10) / 10}h`;
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
    async function fetch_() {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/clients/${clientId}/hours?month=${selectedMonth}`);
        if (res.ok) {
          setData(await res.json());
        }
      } catch {} finally {
        setLoading(false);
      }
    }
    fetch_();
  }, [clientId, selectedMonth]);

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-4 bg-gray-100 rounded w-32 mb-2" />
        <div className="h-2.5 bg-gray-100 rounded w-full" />
      </div>
    );
  }

  if (!data) return null;

  const barColor =
    data.status === "exceeded"
      ? "bg-red-500"
      : data.status === "warning"
        ? "bg-yellow-500"
        : "bg-green-500";

  const barWidth = data.includedHours > 0
    ? Math.min(100, data.percentUsed)
    : 0;

  const monthLabel = friendlyMonthFull(selectedMonth);

  // Month navigation
  function changeMonth(delta: number) {
    const d = new Date(selectedMonth);
    d.setMonth(d.getMonth() + delta);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
  }

  return (
    <div>
      {/* Month selector */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">Hours</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => changeMonth(-1)}
            className="text-[var(--muted)] hover:text-[var(--foreground)] transition p-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <span className="text-xs text-[var(--muted)]">{monthLabel}</span>
          <button
            onClick={() => changeMonth(1)}
            className="text-[var(--muted)] hover:text-[var(--foreground)] transition p-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Hour pools */}
      {data.includedHours > 0 ? (
        <div className="mb-3 space-y-2.5">
          {/* Monthly retainer */}
          {data.monthlyRetainerHours > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-[var(--foreground)]">
                  {formatHours(Math.min(data.loggedHours, data.monthlyRetainerHours))} / {formatHours(data.monthlyRetainerHours)}
                  <span className="text-[var(--muted)] ml-1">monthly</span>
                </span>
                <span className={`text-xs font-medium ${
                  data.loggedHours >= data.monthlyRetainerHours ? "text-red-600" :
                  data.loggedHours / data.monthlyRetainerHours >= 0.8 ? "text-yellow-600" :
                  "text-green-600"
                }`}>
                  {data.monthlyRetainerHours > 0 ? Math.round(Math.min(data.loggedHours, data.monthlyRetainerHours) / data.monthlyRetainerHours * 100) : 0}%
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${barColor}`}
                  style={{ width: `${Math.min(100, data.monthlyRetainerHours > 0 ? (Math.min(data.loggedHours, data.monthlyRetainerHours) / data.monthlyRetainerHours) * 100 : 0)}%` }}
                />
              </div>
            </div>
          )}

          {/* One-time top-up balance */}
          {(data.oneTimeBalanceHours > 0 || data.oneTimeUsedThisMonth > 0) && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--foreground)]">
                {formatHours(data.oneTimeBalanceHours)} remaining
                <span className="text-[var(--muted)] ml-1">top-up</span>
              </span>
              {data.oneTimeUsedThisMonth > 0 && (
                <span className="text-[var(--muted)]">
                  {formatHours(data.oneTimeUsedThisMonth)} used this month
                </span>
              )}
            </div>
          )}

          {/* Combined total */}
          {data.monthlyRetainerHours > 0 && (data.oneTimeBalanceHours > 0 || data.oneTimeUsedThisMonth > 0) && (
            <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-100">
              <span className="text-[var(--foreground)] font-medium">
                {formatHours(data.loggedHours)} / {formatHours(data.includedHours)} total
              </span>
              <span className={`font-medium ${
                data.status === "exceeded" ? "text-red-600" :
                data.status === "warning" ? "text-yellow-600" :
                "text-green-600"
              }`}>
                {data.percentUsed}%
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="mb-3">
          <span className="text-xs text-[var(--foreground)]">
            {formatHours(data.loggedHours)} logged
          </span>
          <span className="text-xs text-[var(--muted)] ml-1">(no hour cap set)</span>
        </div>
      )}

      {/* Breakdown by ticket */}
      {data.byTicket.length > 0 && (
        <div className="space-y-1">
          {data.byTicket.map((t) => (
            <div key={t.ticketId} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[var(--muted)] font-mono shrink-0">{t.ticketNumber}</span>
                <span className="text-[var(--foreground)] truncate">{t.ticketTitle}</span>
              </div>
              <span className="text-[var(--muted)] shrink-0 ml-2">{formatHours(t.hours)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
