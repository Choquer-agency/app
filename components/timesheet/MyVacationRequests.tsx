"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export default function MyVacationRequests({
  teamMemberId,
  refreshKey,
}: {
  teamMemberId: string;
  refreshKey: number;
}) {
  const rawRequests = useQuery(api.vacationRequests.listByMember, {
    teamMemberId: teamMemberId as Id<"teamMembers">,
  });

  if (!rawRequests || rawRequests.length === 0) return null;

  return (
    <div className="mt-8 border-t border-[#F6F5F1] pt-6">
      <h3 className="text-base font-bold text-[#1A1A1A] mb-4">
        My Vacation Requests
      </h3>
      <div className="space-y-3">
        {rawRequests.map((req) => {
          const startLabel = new Date(
            req.startDate + "T12:00:00"
          ).toLocaleDateString("en-US", { month: "short", day: "numeric" });
          const endLabel = new Date(
            req.endDate + "T12:00:00"
          ).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });

          return (
            <div
              key={req._id}
              className={`bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.04)] border p-4 ${
                req.status === "pending"
                  ? "border-amber-200"
                  : req.status === "approved"
                    ? "border-emerald-200"
                    : "border-rose-200"
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-[#1A1A1A]">
                    {startLabel} – {endLabel}
                  </p>
                  <p className="text-xs text-[#6B6B6B] mt-0.5">
                    {req.totalDays} day{req.totalDays !== 1 ? "s" : ""}
                    {req.reason ? ` — ${req.reason}` : ""}
                  </p>
                  {req.reviewNote && (
                    <p className="text-xs text-[#6B6B6B] mt-1 italic">
                      Note: {req.reviewNote}
                    </p>
                  )}
                </div>
                <span
                  className={`text-xs font-bold px-3 py-1 rounded-full ${
                    req.status === "pending"
                      ? "text-amber-600 bg-amber-50"
                      : req.status === "approved"
                        ? "text-emerald-600 bg-emerald-50"
                        : "text-rose-600 bg-rose-50"
                  }`}
                >
                  {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
