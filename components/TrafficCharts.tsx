"use client";

import { friendlyDate } from "@/lib/date-format";
import MetricTooltip from "./MetricTooltip";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";
import { TimeSeriesPoint, TopPage } from "@/types";

interface TrafficChannel {
  channel: string;
  users: number;
  sessions: number;
  newUsers: number;
}

interface TrafficChartsProps {
  usersTimeSeries: TimeSeriesPoint[];
  trafficChannels: TrafficChannel[];
  topPages: TopPage[];
}

function fmtDate(d: string) {
  return friendlyDate(d);
}

function fmtNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function truncPath(url: string) {
  try {
    const p = new URL(url).pathname;
    return p === "/" ? "Homepage" : p.length > 28 ? p.slice(0, 28) + "..." : p;
  } catch {
    return url.slice(0, 28);
  }
}

const CHANNEL_COLORS: Record<string, string> = {
  "Organic Search": "#FF9500",
  "Direct": "#A69FFF",
  "Referral": "#B1D0FF",
  "Organic Social": "#BDFFE8",
  "Paid Search": "#FFA69E",
  "Email": "#FFF09E",
  "Paid Social": "#FBBDFF",
  "Display": "#ACFF9E",
};

function getChannelColor(channel: string): string {
  return CHANNEL_COLORS[channel] || "#D5D5D5";
}

export default function TrafficCharts({
  usersTimeSeries,
  trafficChannels,
  topPages,
}: TrafficChartsProps) {
  const totalUsers = usersTimeSeries.reduce((sum, d) => sum + (d.users || 0), 0);
  const totalChannelUsers = trafficChannels.reduce((sum, c) => sum + c.users, 0);

  return (
    <section id="charts-section" className="mb-8" data-track="charts">
      <h2 className="text-base font-semibold mb-3">Traffic & Visibility</h2>

      {/* Users over time — clean single line, orange */}
      {usersTimeSeries.length > 0 && (
        <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white mb-3">
          <div className="flex items-baseline gap-3 mb-3">
            <p className="text-xs text-muted font-medium">Users</p>
            <p className="text-xl font-bold text-[#1A1A1A]">{fmtNumber(totalUsers)}</p>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={usersTimeSeries}>
              <defs>
                <linearGradient id="userGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF9500" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="#FF9500" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                fontSize={10}
                tick={{ fill: "#9CA3AF" }}
                axisLine={{ stroke: "#F0F0F0" }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                fontSize={10}
                tick={{ fill: "#9CA3AF" }}
                axisLine={false}
                tickLine={false}
                width={35}
                tickFormatter={fmtNumber}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E5E5", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
                labelFormatter={(label) => friendlyDate(label)}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any) => fmtNumber(Number(value))}
              />
              <Area
                type="monotone"
                dataKey="users"
                stroke="#FF9500"
                strokeWidth={1.5}
                fill="url(#userGradient)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Traffic Acquisition table */}
        {trafficChannels.length > 0 && (
          <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border)]">
              <p className="text-xs text-muted font-medium">
                <MetricTooltip label="Traffic Acquisition" tooltip="Breakdown of where your website visitors come from — organic search, direct visits, referrals, and social media" />
              </p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Channel</th>
                  <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Users</th>
                  <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Sessions</th>
                  <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">%</th>
                </tr>
              </thead>
              <tbody>
                {trafficChannels.map((ch) => {
                  const pct = totalChannelUsers > 0 ? (ch.users / totalChannelUsers) * 100 : 0;
                  return (
                    <tr key={ch.channel} className="border-b border-[var(--border)] hover:bg-[var(--hover-tan)] transition-colors">
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getChannelColor(ch.channel) }} />
                          <span className="text-xs text-[#1A1A1A] whitespace-nowrap">{ch.channel}</span>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-xs text-right font-medium">{fmtNumber(ch.users)}</td>
                      <td className="px-2 py-3 text-xs text-right text-muted">{fmtNumber(ch.sessions)}</td>
                      <td className="px-2 py-3 text-xs text-right text-muted">{pct.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Top Landing Pages — clickable */}
        {topPages.length > 0 && (
          <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white">
            <p className="text-xs text-muted mb-2 font-medium">
              <MetricTooltip label="Top Landing Pages" tooltip="The pages on your site that receive the most clicks from Google Search" />
            </p>
            <div className="space-y-2">
              {topPages.slice(0, 8).map((page, i) => {
                const maxClicks = topPages[0]?.clicks || 1;
                const pct = (page.clicks / maxClicks) * 100;
                return (
                  <a
                    key={i}
                    href={page.page}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block group"
                    data-track="link"
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs text-[#1A1A1A] group-hover:text-[#FF9500] transition-colors">
                        {truncPath(page.page)}
                      </span>
                      <span className="text-xs font-medium text-[#1A1A1A]">{fmtNumber(page.clicks)}</span>
                    </div>
                    <div className="h-1.5 bg-[#F0F0F0] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all group-hover:opacity-80"
                        style={{ width: `${pct}%`, backgroundColor: "#FF9500" }}
                      />
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
