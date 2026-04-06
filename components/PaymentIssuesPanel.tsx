"use client";

import { useState, useEffect } from "react";

interface PaymentIssue {
  id: string;
  clientId: string;
  clientName: string;
  clientSlug?: string;
  status: string;
  failureCount: number;
  firstFailedAt: string;
  escalatedAt?: string;
  mrr?: number;
  profileLabel?: string;
  profileAmount?: number;
  contactEmail?: string;
}

export default function PaymentIssuesPanel() {
  const [issues, setIssues] = useState<PaymentIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const [showResolveModal, setShowResolveModal] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState("");

  useEffect(() => {
    fetch("/api/admin/payment-issues?status=open")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setIssues(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || issues.length === 0) return null;

  const escalated = issues.filter((i) => i.status === "escalated");
  const open = issues.filter((i) => i.status === "open");

  function daysSince(dateStr: string) {
    return Math.floor(
      (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  function formatCurrency(val?: number) {
    if (!val) return "--";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(val);
  }

  async function handleResolve(issueId: string) {
    setResolving(issueId);
    try {
      const res = await fetch(`/api/admin/payment-issues/${issueId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", note: resolveNote }),
      });
      if (res.ok) {
        setIssues((prev) => prev.filter((i) => i.id !== issueId));
        setShowResolveModal(null);
        setResolveNote("");
      }
    } catch {}
    setResolving(null);
  }

  return (
    <div className="mb-6">
      {/* Alert banner */}
      <div
        className={`rounded-xl border-2 p-4 ${
          escalated.length > 0
            ? "bg-red-50 border-red-200"
            : "bg-amber-50 border-amber-200"
        }`}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">
            {escalated.length > 0 ? "🚨" : "⚠️"}
          </span>
          <h3
            className={`font-semibold text-sm ${
              escalated.length > 0 ? "text-red-800" : "text-amber-800"
            }`}
          >
            {escalated.length > 0
              ? `${escalated.length} client${escalated.length > 1 ? "s" : ""} with suspended payments`
              : `${open.length} payment issue${open.length > 1 ? "s" : ""} being retried`}
          </h3>
        </div>

        <div className="space-y-2">
          {issues.map((issue) => (
            <div
              key={issue.id}
              className="flex items-center justify-between bg-white rounded-lg px-4 py-3 border border-gray-100"
            >
              <div className="flex items-center gap-4">
                <div>
                  <span className="font-medium text-sm text-[var(--foreground)]">
                    {issue.clientName}
                  </span>
                  {issue.profileLabel && (
                    <span className="text-xs text-[var(--muted)] ml-2">
                      ({issue.profileLabel})
                    </span>
                  )}
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    issue.status === "escalated"
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {issue.status === "escalated" ? "Suspended" : "Retrying"}
                </span>
              </div>

              <div className="flex items-center gap-6 text-xs">
                <div className="text-right">
                  <span className="text-[var(--muted)]">Days unresolved</span>
                  <p className="font-semibold text-[var(--foreground)]">
                    {daysSince(issue.firstFailedAt)}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[var(--muted)]">MRR at risk</span>
                  <p className="font-semibold text-red-600">
                    {formatCurrency(issue.mrr || issue.profileAmount)}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowResolveModal(issue.id);
                    setResolveNote("");
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition"
                >
                  Resolve
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Resolve modal */}
      {showResolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="font-semibold text-lg text-[var(--foreground)] mb-4">
              Resolve Payment Issue
            </h3>
            <label className="block text-sm text-[var(--muted)] mb-1">
              Resolution note (optional)
            </label>
            <textarea
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              className="w-full border border-gray-200 rounded-lg p-3 text-sm mb-4 resize-none"
              rows={3}
              placeholder="e.g. Client updated card via phone call"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowResolveModal(null)}
                className="px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                Cancel
              </button>
              <button
                onClick={() => handleResolve(showResolveModal)}
                disabled={resolving === showResolveModal}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {resolving === showResolveModal ? "Resolving..." : "Mark Resolved"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
