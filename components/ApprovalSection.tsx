"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Approval } from "@/types";

interface ApprovalSectionProps {
  approvals: Approval[];
  clientSlug: string;
}

export default function ApprovalSection({ approvals: initialApprovals, clientSlug }: ApprovalSectionProps) {
  const router = useRouter();
  const [approvals, setApprovals] = useState(initialApprovals);
  const [feedbackFor, setFeedbackFor] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [loading, setLoading] = useState<number | null>(null);

  const pending = approvals.filter((a) => a.status === "pending");
  const resolved = approvals.filter((a) => a.status !== "pending");
  const [showResolved, setShowResolved] = useState(false);

  function daysRemaining(createdAt: string): number {
    const created = new Date(createdAt);
    const deadline = new Date(created.getTime() + 7 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const diff = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }

  useEffect(() => {
    if (resolved.length > 0 && pending.length === 0) {
      setShowResolved(true);
      const timer = setTimeout(() => setShowResolved(false), 30000);
      return () => clearTimeout(timer);
    }
  }, [resolved.length, pending.length]);

  async function handleAction(id: number, status: "approved" | "rejected", feedback?: string) {
    setLoading(id);
    try {
      const res = await fetch("/api/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId: id, status, feedback }),
      });
      if (res.ok) {
        setApprovals((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, status, feedback: feedback || null, updatedAt: new Date().toISOString() } : a
          )
        );
        setFeedbackFor(null);
        setFeedbackText("");
        router.refresh();
      }
    } catch {
      // silently fail
    } finally {
      setLoading(null);
    }
  }

  if (approvals.length === 0) return null;

  return (
    <section id="approvals-section" className="mb-6 pt-2" data-track="approvals">
      {pending.length > 0 && (
        <div className="bg-[#FFF0F0] border border-[#FFB3B3] rounded-2xl px-6 py-5">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-[#D94040]" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            <h2 className="text-sm font-semibold text-[#D94040]">
              Action Required
            </h2>
            <span className="text-[10px] bg-[#D94040] text-white px-2 py-0.5 rounded-full font-medium">
              {pending.length}
            </span>
          </div>
          <p className="text-[11px] text-[#D94040]/70 mb-3">
            If not approved within 7 days, we will publish these changes.
          </p>

          <div className="space-y-3">
            {pending.map((approval) => (
              <div
                key={approval.id}
                className="bg-white rounded-xl p-4 border border-[#FFD4D4]"
              >
                <p className="text-sm font-medium text-[#1A1A1A] mb-1">
                  {approval.title}
                  <span className="text-[10px] text-[#D94040]/60 font-normal ml-2">
                    {daysRemaining(approval.createdAt) === 0
                      ? "Auto-approving today"
                      : `${daysRemaining(approval.createdAt)} day${daysRemaining(approval.createdAt) !== 1 ? "s" : ""} remaining`}
                  </span>
                </p>
                {approval.description && (
                  <p className="text-xs text-muted mb-2">{approval.description}</p>
                )}
                {approval.links && approval.links.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {approval.links.map((link, i) => (
                      <a
                        key={i}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-[#F0F4FF] text-[#2563eb] border border-[#BFDBFE] hover:bg-[#DBEAFE] transition"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
                        </svg>
                        {link.label || "Review"}
                      </a>
                    ))}
                  </div>
                )}

                {feedbackFor === approval.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      placeholder="Tell us what you'd like changed..."
                      className="w-full text-xs border border-[#E5E5E5] rounded-lg px-3 py-2 focus:outline-none focus:border-[#FF9500] resize-none"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAction(approval.id, "rejected", feedbackText)}
                        disabled={loading === approval.id}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[#1A1A1A] text-white hover:opacity-90 transition disabled:opacity-50"
                      >
                        {loading === approval.id ? "Sending..." : "Submit Feedback"}
                      </button>
                      <button
                        onClick={() => { setFeedbackFor(null); setFeedbackText(""); }}
                        className="text-xs text-muted hover:text-[#1A1A1A] transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAction(approval.id, "approved")}
                      disabled={loading === approval.id}
                      className="text-xs font-medium px-4 py-1.5 rounded-lg bg-[#0d7a55] text-white hover:opacity-90 transition disabled:opacity-50"
                    >
                      {loading === approval.id ? "..." : "Approve"}
                    </button>
                    <button
                      onClick={() => setFeedbackFor(approval.id)}
                      className="text-xs font-medium px-4 py-1.5 rounded-lg border border-[#E5E5E5] text-[#1A1A1A] hover:bg-[#F5F5F5] transition"
                    >
                      Request Changes
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {showResolved && (
        <div className="bg-[#F6FFF9] border border-[#BDFFE8] rounded-2xl px-6 py-4">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-[#0d7a55]" viewBox="0 0 16 16" fill="none">
              <path d="M13.5 4.5L6.5 11.5L2.5 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <p className="text-xs text-[#0d7a55] font-medium">All approvals are up to date</p>
          </div>
        </div>
      )}
    </section>
  );
}
