"use client";

import { useState, useEffect } from "react";

export default function VacationBalanceCard({
  teamMemberId,
}: {
  teamMemberId: string;
}) {
  const [data, setData] = useState<{
    vacationDaysTotal: number;
    vacationDaysUsed: number;
  } | null>(null);

  useEffect(() => {
    async function fetchMember() {
      try {
        const res = await fetch("/api/admin/team");
        if (res.ok) {
          const members = await res.json();
          const me = members.find(
            (m: any) => m.id === teamMemberId || m._id === teamMemberId
          );
          if (me) {
            setData({
              vacationDaysTotal: me.vacationDaysTotal ?? 10,
              vacationDaysUsed: me.vacationDaysUsed ?? 0,
            });
          }
        }
      } catch {
        // silent
      }
    }
    fetchMember();
  }, [teamMemberId]);

  const total = data?.vacationDaysTotal ?? 10;
  const used = data?.vacationDaysUsed ?? 0;
  const remaining = Math.max(0, total - used);

  // Matches Ollie's vacation balance card style (sky-50 bg)
  return (
    <div className="bg-sky-50 rounded-2xl border border-sky-100 p-4">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-sky-900">
          Vacation Remaining
        </span>
        <span className="text-2xl font-bold text-sky-900">{remaining}</span>
      </div>
      <div className="text-xs text-sky-700 mt-1">
        {used} of {total} days used
      </div>
    </div>
  );
}
