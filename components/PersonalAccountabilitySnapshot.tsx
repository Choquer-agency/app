"use client";

import { useEffect, useState } from "react";

interface MemberMeetingData {
  overdue: unknown[];
  dueThisWeek: unknown[];
  reliability: { score: number; onTime: number; missed: number; total: number };
  workMetrics: {
    loggedHours: number;
    clockedHours: number;
    utilizationPct: number;
  };
}

export default function PersonalAccountabilitySnapshot({
  teamMemberId,
}: {
  teamMemberId: string;
}) {
  const [data, setData] = useState<MemberMeetingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/meetings?memberId=${encodeURIComponent(teamMemberId)}&period=this_week`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teamMemberId]);

  if (loading || !data) {
    return (
      <div style={{ display: "flex", gap: 12, width: "100%", marginBottom: 16 }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{ flex: 1, height: 78 }}
            className="border border-[#E5E5E5] rounded-xl bg-white animate-pulse"
          />
        ))}
      </div>
    );
  }

  const overdueCount = data.overdue.length;
  const dueThisWeekCount = data.dueThisWeek.length;
  const reliabilityClass =
    data.reliability.score >= 80
      ? "text-green-600"
      : data.reliability.score >= 50
      ? "text-yellow-600"
      : "text-red-600";

  return (
    <div style={{ display: "flex", gap: 12, width: "100%", marginBottom: 16 }}>
      <div style={{ flex: 1 }} className="border border-[#E5E5E5] rounded-xl p-3 bg-white">
        <div className="text-[10px] text-[#9CA3AF] mb-1">Reliability Score</div>
        <div className="text-2xl font-semibold">
          <span className={reliabilityClass}>
            {data.reliability.total > 0 ? `${data.reliability.score}%` : "—"}
          </span>
        </div>
        <div className="text-[10px] text-[#9CA3AF] mt-1">Due dates hit this week</div>
      </div>
      <div style={{ flex: 1 }} className="border border-[#E5E5E5] rounded-xl p-3 bg-white">
        <div className="text-[10px] text-[#9CA3AF] mb-1">Overdue</div>
        <div className={`text-2xl font-semibold ${overdueCount > 0 ? "text-red-600" : "text-[#1A1A1A]"}`}>
          {overdueCount}
        </div>
        <div className="text-[10px] text-[#9CA3AF] mt-1">Past due, still open</div>
      </div>
      <div style={{ flex: 1 }} className="border border-[#E5E5E5] rounded-xl p-3 bg-white">
        <div className="text-[10px] text-[#9CA3AF] mb-1">Logged / Clocked</div>
        <div className="text-2xl font-semibold text-[#1A1A1A]">
          {data.workMetrics.loggedHours.toFixed(1)}h
          <span className="text-[#9CA3AF] font-normal text-lg">
            {" "}/ {data.workMetrics.clockedHours.toFixed(1)}h
          </span>
        </div>
        <div className="text-[10px] text-[#9CA3AF] mt-1">{data.workMetrics.utilizationPct}% utilization</div>
      </div>
      <div style={{ flex: 1 }} className="border border-[#E5E5E5] rounded-xl p-3 bg-white">
        <div className="text-[10px] text-[#9CA3AF] mb-1">Due This Week</div>
        <div className="text-2xl font-semibold text-[#1A1A1A]">{dueThisWeekCount}</div>
        <div className="text-[10px] text-[#9CA3AF] mt-1">Upcoming deadlines</div>
      </div>
    </div>
  );
}
