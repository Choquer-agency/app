"use client";

import { useState } from "react";
import { Approval } from "@/types";

interface ApprovalSectionProps {
  approvals: Approval[];
  clientSlug: string;
}

export default function ApprovalSection({ approvals: initialApprovals, clientSlug }: ApprovalSectionProps) {
  const [approvals, setApprovals] = useState(initialApprovals);
  const [feedbackFor, setFeedbackFor] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [loading, setLoading] = useState<number | null>(null);

  const pending = approvals.filter((a) => a.status === "pending");
  const resolved = approvals.filter((a) => a.status !== "pending");

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

          <div className="space-y-3">
            {pending.map((approval) => (
              <div
                key={approval.id}
                className="bg-white rounded-xl p-4 border border-[#FFD4D4]"
              >
                <p className="text-sm font-medium text-[#1A1A1A] mb-1">{approval.title}</p>
                {approval.description && (
                  <p className="text-xs text-muted mb-3">{approval.description}</p>
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

      {resolved.length > 0 && pending.length === 0 && (
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
