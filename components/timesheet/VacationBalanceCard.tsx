"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export default function VacationBalanceCard({
  teamMemberId,
}: {
  teamMemberId: string;
}) {
  const member = useQuery(api.teamMembers.getById, {
    id: teamMemberId as Id<"teamMembers">,
  });

  const total = member?.vacationDaysTotal ?? 10;
  const used = member?.vacationDaysUsed ?? 0;
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
