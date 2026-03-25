"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface DailyBreakdown {
  date: string;
  clockedMinutes: number;
  loggedMinutes: number;
  breakMinutes: number;
  gapMinutes: number;
}

interface MemberAccountability {
  teamMemberId: string;
  memberName: string;
  profilePicUrl: string | null;
  color: string | null;
  clockedMinutes: number;
  loggedMinutes: number;
  breakMinutes: number;
  gapMinutes: number;
  accountabilityPercent: number;
  workDays: number;
  dailyBreakdown: DailyBreakdown[];
}

interface AccountabilityTabProps {
  start: string;
  end: string;
}

function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}m`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}m`;
}

function fmtHours(m: number): string {
  const h = m / 60;
  if (h >= 100) return `${Math.round(h)}h`;
  return `${h.toFixed(1)}h`;
}

function getAccountabilityColor(percent: number): string {
  if (percent >= 80) return "#10B981"; // green
  if (percent >= 60) return "#F59E0B"; // amber
  return "#EF4444"; // red
}

function getAccountabilityBg(percent: number): string {
  if (percent >= 80) return "bg-emerald-50 text-emerald-700";
  if (percent >= 60) return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
}

export default function AccountabilityTab({ start, end }: AccountabilityTabProps) {
  const [data, setData] = useState<MemberAccountability[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/reports/accountability?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
      );
      if (res.ok) {
        setData(await res.json());
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [start, end]);

  useEffect(() => {
    if (start && end) fetchData();
  }, [start, end, fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#8B5CF6] border-t-transparent" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-16 text-[var(--muted)]">
        <p className="text-sm">No timesheet data for this period.</p>
        <p className="text-xs mt-1">Team members need to clock in and log time on tickets.</p>
      </div>
    );
  }

  // Summary stats
  const totalClocked = data.reduce((s, m) => s + m.clockedMinutes, 0);
  const totalLogged = data.reduce((s, m) => s + m.loggedMinutes, 0);
  const totalGap = data.reduce((s, m) => s + m.gapMinutes, 0);
  const avgAccountability =
    totalClocked > 0 ? Math.round((totalLogged / totalClocked) * 100) : 0;

  // Chart data
  const chartData = data.map((m) => ({
    name: m.memberName.split(" ")[0],
    logged: Math.round((m.loggedMinutes / 60) * 10) / 10,
    gap: Math.round((m.gapMinutes / 60) * 10) / 10,
    percent: m.accountabilityPercent,
  }));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-[var(--border)] p-4">
          <p className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider">
            Total Clocked
          </p>
          <p className="text-2xl font-bold text-[var(--foreground)] mt-1">
            {fmtHours(totalClocked)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-[var(--border)] p-4">
          <p className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider">
            Logged to Tickets
          </p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">
            {fmtHours(totalLogged)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-[var(--border)] p-4">
          <p className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider">
            Unaccounted
          </p>
          <p className="text-2xl font-bold text-amber-600 mt-1">
            {fmtHours(totalGap)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-[var(--border)] p-4">
          <p className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider">
            Team Accountability
          </p>
          <p
            className="text-2xl font-bold mt-1"
            style={{ color: getAccountabilityColor(avgAccountability) }}
          >
            {avgAccountability}%
          </p>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="bg-white rounded-xl border border-[var(--border)] p-5">
        <h3 className="text-sm font-bold text-[var(--foreground)] mb-4">
          Clocked vs. Logged Hours by Team Member
        </h3>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "#6B7280" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#6B7280" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}h`}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                }}
                formatter={(value: any, name: any) => [
                  `${value}h`,
                  name === "logged" ? "Logged to Tickets" : "Unaccounted",
                ]}
              />
              <Bar
                dataKey="logged"
                stackId="a"
                fill="#10B981"
                radius={[0, 0, 0, 0]}
                name="logged"
              />
              <Bar
                dataKey="gap"
                stackId="a"
                fill="#FCD34D"
                radius={[4, 4, 0, 0]}
                name="gap"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-[var(--muted)]">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" />
            Logged to Tickets
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-yellow-300 inline-block" />
            Unaccounted
          </span>
        </div>
      </div>

      {/* Per-Member Table */}
      <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)]">
          <h3 className="text-sm font-bold text-[var(--foreground)]">
            Individual Accountability
          </h3>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {data.map((member) => (
            <div key={member.teamMemberId}>
              <button
                onClick={() =>
                  setExpandedMember(
                    expandedMember === member.teamMemberId
                      ? null
                      : member.teamMemberId
                  )
                }
                className="w-full px-5 py-3 flex items-center gap-4 hover:bg-gray-50 transition text-left"
              >
                {/* Avatar */}
                {member.profilePicUrl ? (
                  <img
                    src={member.profilePicUrl}
                    alt={member.memberName}
                    className="w-8 h-8 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{
                      backgroundColor: member.color || "#8B5CF6",
                    }}
                  >
                    {member.memberName.charAt(0).toUpperCase()}
                  </div>
                )}

                {/* Name */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--foreground)] truncate">
                    {member.memberName}
                  </p>
                  <p className="text-[10px] text-[var(--muted)]">
                    {member.workDays} work day{member.workDays !== 1 ? "s" : ""}
                  </p>
                </div>

                {/* Stats */}
                <div className="hidden sm:flex items-center gap-6 text-xs">
                  <div className="text-center">
                    <p className="text-[var(--muted)]">Clocked</p>
                    <p className="font-mono font-medium">{fmtMinutes(member.clockedMinutes)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[var(--muted)]">Logged</p>
                    <p className="font-mono font-medium text-emerald-600">
                      {fmtMinutes(member.loggedMinutes)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[var(--muted)]">Gap</p>
                    <p className="font-mono font-medium text-amber-600">
                      {fmtMinutes(member.gapMinutes)}
                    </p>
                  </div>
                </div>

                {/* Accountability badge */}
                <span
                  className={`px-2.5 py-1 text-xs font-bold rounded-full shrink-0 ${getAccountabilityBg(member.accountabilityPercent)}`}
                >
                  {member.accountabilityPercent}%
                </span>

                {/* Expand chevron */}
                <svg
                  className={`w-4 h-4 text-[var(--muted)] transition-transform shrink-0 ${
                    expandedMember === member.teamMemberId ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {/* Daily Breakdown (expanded) */}
              {expandedMember === member.teamMemberId && (
                <div className="px-5 pb-4 bg-gray-50">
                  <div className="space-y-2 pt-2">
                    {member.dailyBreakdown.map((day) => {
                      const dayPercent =
                        day.clockedMinutes > 0
                          ? Math.round(
                              (day.loggedMinutes / day.clockedMinutes) * 100
                            )
                          : 0;
                      const loggedWidth =
                        day.clockedMinutes > 0
                          ? Math.min(
                              100,
                              (day.loggedMinutes / day.clockedMinutes) * 100
                            )
                          : 0;

                      return (
                        <div
                          key={day.date}
                          className="flex items-center gap-3 text-xs"
                        >
                          <span className="w-20 shrink-0 font-mono text-[var(--muted)]">
                            {new Date(day.date + "T12:00:00").toLocaleDateString(
                              "en-US",
                              { weekday: "short", month: "short", day: "numeric" }
                            )}
                          </span>

                          {/* Timeline bar */}
                          <div className="flex-1 h-5 bg-yellow-100 rounded-md overflow-hidden relative">
                            <div
                              className="h-full bg-emerald-400 rounded-l-md"
                              style={{ width: `${loggedWidth}%` }}
                            />
                            {day.breakMinutes > 0 && (
                              <div
                                className="absolute top-0 h-full bg-orange-300 opacity-50"
                                style={{
                                  left: `${loggedWidth}%`,
                                  width: `${Math.min(
                                    100 - loggedWidth,
                                    (day.breakMinutes / day.clockedMinutes) * 100
                                  )}%`,
                                }}
                              />
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-emerald-600">
                              {fmtMinutes(day.loggedMinutes)}
                            </span>
                            <span className="text-[var(--muted)]">/</span>
                            <span className="font-mono">
                              {fmtMinutes(day.clockedMinutes)}
                            </span>
                            <span
                              className={`font-bold ${
                                dayPercent >= 80
                                  ? "text-emerald-600"
                                  : dayPercent >= 60
                                    ? "text-amber-600"
                                    : "text-red-500"
                              }`}
                            >
                              {dayPercent}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {member.dailyBreakdown.length === 0 && (
                    <p className="text-xs text-[var(--muted)] py-4 text-center">
                      No daily data available
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
