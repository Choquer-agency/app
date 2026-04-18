"use client";

import { useState } from "react";
import { friendlyDate } from "@/lib/date-format";

interface Props {
  slug: string;
  monthKey: string;
  monthLabel: string;
  initialApprovedAt: number | null;
}

export default function MonthlyStrategyApprovalCard({
  slug,
  monthKey,
  monthLabel,
  initialApprovedAt,
}: Props) {
  const [approvedAt, setApprovedAt] = useState<number | null>(initialApprovedAt);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/seo-strategy-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, monthKey, approved: true }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      setApprovedAt(data.clientApprovedAt ?? Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to approve");
    } finally {
      setSubmitting(false);
    }
  }

  if (approvedAt) {
    return (
      <div className="bg-[#F6FFF9] border border-[#BDFFE8] rounded-2xl px-6 py-4">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-[#0d7a55]" viewBox="0 0 16 16" fill="none">
            <path d="M13.5 4.5L6.5 11.5L2.5 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-xs text-[#0d7a55] font-medium">
            You approved {monthLabel}&apos;s strategy on{" "}
            {friendlyDate(new Date(approvedAt).toISOString())}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#FAFCFF] border border-[#E8F0FE] rounded-2xl px-6 py-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <h2 className="text-sm font-semibold text-[#1A1A1A] mb-1">
            Approve {monthLabel}&apos;s SEO strategy
          </h2>
          <p className="text-xs text-[#6b7280]">
            Give our team the green light on the plan for this month. You can always reach out with questions or change requests.
          </p>
          {error && (
            <p className="text-[11px] text-red-600 mt-2">{error} — please try again.</p>
          )}
        </div>
        <button
          onClick={approve}
          disabled={submitting}
          className="text-xs font-medium px-4 py-2 rounded-lg bg-[#0d7a55] text-white hover:opacity-90 transition disabled:opacity-50"
        >
          {submitting ? "Approving…" : "Approve this month"}
        </button>
      </div>
    </div>
  );
}
