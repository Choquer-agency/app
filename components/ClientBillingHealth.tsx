"use client";

import { useState, useEffect, useCallback } from "react";

interface ConvergeProfile {
  _id: string;
  id: string;
  recurringId: string;
  label?: string;
  lastStatus?: string;
  cardLastFour?: string;
  cardExpiryMonth?: number;
  cardExpiryYear?: number;
  amount?: number;
  billingCycle?: string;
  nextPaymentDate?: string;
  lastPolledAt?: string;
  active: boolean;
}

interface PaymentIssue {
  _id: string;
  status: string;
  failureCount: number;
  firstFailedAt: string;
  lastFailedAt: string;
  escalatedAt?: string;
  resolvedAt?: string;
  resolutionNote?: string;
  emailCount?: number;
}

interface Props {
  clientId: string;
}

export default function ClientBillingHealth({ clientId }: Props) {
  const [profiles, setProfiles] = useState<ConvergeProfile[]>([]);
  const [issues, setIssues] = useState<PaymentIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRecurringId, setNewRecurringId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newCurrency, setNewCurrency] = useState<"USD" | "CAD">("USD");
  const [adding, setAdding] = useState(false);
  const [loggingFailure, setLoggingFailure] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [profilesRes, issuesRes] = await Promise.all([
        fetch(`/api/admin/converge-profiles`),
        fetch(`/api/admin/payment-issues?status=all`),
      ]);

      if (profilesRes.ok) {
        const all = await profilesRes.json();
        setProfiles(all.filter((p: any) => p.clientId === clientId));
      }
      if (issuesRes.ok) {
        const all = await issuesRes.json();
        setIssues(
          (Array.isArray(all) ? all : []).filter(
            (i: any) => i.clientId === clientId
          )
        );
      }
    } catch {}
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleAddProfile() {
    if (!newRecurringId.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/admin/converge-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          recurringId: newRecurringId.trim(),
          label: newLabel.trim() || undefined,
          currency: newCurrency,
        }),
      });
      if (res.ok) {
        setShowAddModal(false);
        setNewRecurringId("");
        setNewLabel("");
        setNewCurrency("USD");
        fetchData();
      }
    } catch {}
    setAdding(false);
  }

  async function handleLogFailure() {
    setLoggingFailure(true);
    try {
      const res = await fetch("/api/admin/payment-issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      if (res.ok) fetchData();
    } catch {}
    setLoggingFailure(false);
  }

  function formatDate(dateStr?: string) {
    if (!dateStr) return "--";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatExpiry(month?: number, year?: number) {
    if (!month || !year) return "--";
    return `${String(month).padStart(2, "0")}/${year}`;
  }

  const activeProfiles = profiles.filter((p) => p.active);
  const hasSuspended = activeProfiles.some((p) => p.lastStatus === "Suspended");
  const openIssues = issues.filter(
    (i) => i.status === "open" || i.status === "escalated"
  );

  if (loading) {
    return (
      <div className="text-center py-12 text-[var(--muted)] text-sm">
        Loading billing health...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status indicator */}
      <div
        className={`flex items-center gap-3 p-4 rounded-lg border ${
          hasSuspended || openIssues.length > 0
            ? "bg-red-50 border-red-200"
            : "bg-green-50 border-green-200"
        }`}
      >
        <span className="text-2xl">
          {hasSuspended || openIssues.length > 0 ? "🚨" : "✅"}
        </span>
        <div>
          <p
            className={`font-semibold text-sm ${
              hasSuspended || openIssues.length > 0
                ? "text-red-800"
                : "text-green-800"
            }`}
          >
            {hasSuspended
              ? "Payment suspended — card update needed"
              : openIssues.length > 0
                ? `${openIssues.length} payment issue${openIssues.length > 1 ? "s" : ""} active`
                : "All payments healthy"}
          </p>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            {activeProfiles.length} Converge profile
            {activeProfiles.length !== 1 ? "s" : ""} linked
          </p>
        </div>
        <div className="ml-auto">
          <button
            onClick={handleLogFailure}
            disabled={loggingFailure}
            className="text-xs px-3 py-1.5 rounded-lg bg-amber-100 text-amber-800 font-medium hover:bg-amber-200 transition disabled:opacity-50"
          >
            {loggingFailure ? "Logging..." : "Log Payment Failure"}
          </button>
        </div>
      </div>

      {/* Converge Profiles */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            Converge Profiles
          </h3>
          <button
            onClick={() => setShowAddModal(true)}
            className="text-xs px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white font-medium hover:opacity-90 transition"
          >
            + Add Profile
          </button>
        </div>

        {activeProfiles.length === 0 ? (
          <div className="text-center py-8 text-sm text-[var(--muted)] border border-dashed border-gray-200 rounded-lg">
            No Converge profiles linked yet. Add one to enable automated
            monitoring.
          </div>
        ) : (
          <div className="space-y-2">
            {activeProfiles.map((profile) => (
              <div
                key={profile._id}
                className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div>
                    <p className="font-medium text-sm text-[var(--foreground)]">
                      {profile.label || profile.recurringId}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      ID: {profile.recurringId}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      profile.lastStatus === "Active"
                        ? "bg-green-100 text-green-700"
                        : profile.lastStatus === "Suspended"
                          ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {profile.lastStatus || "Unknown"}
                  </span>
                </div>
                <div className="flex items-center gap-6 text-xs text-[var(--muted)]">
                  {profile.cardLastFour && (
                    <div>
                      <span className="block">Card</span>
                      <span className="font-medium text-[var(--foreground)]">
                        ****{profile.cardLastFour}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="block">Expires</span>
                    <span className="font-medium text-[var(--foreground)]">
                      {formatExpiry(
                        profile.cardExpiryMonth,
                        profile.cardExpiryYear
                      )}
                    </span>
                  </div>
                  {profile.amount && (
                    <div>
                      <span className="block">Amount</span>
                      <span className="font-medium text-[var(--foreground)]">
                        ${profile.amount}/mo
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="block">Last polled</span>
                    <span className="font-medium text-[var(--foreground)]">
                      {formatDate(profile.lastPolledAt)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payment Issue History */}
      {issues.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">
            Payment Issue History
          </h3>
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2 text-xs text-[var(--muted)] font-medium">
                    Status
                  </th>
                  <th className="text-left px-4 py-2 text-xs text-[var(--muted)] font-medium">
                    First Failed
                  </th>
                  <th className="text-left px-4 py-2 text-xs text-[var(--muted)] font-medium">
                    Emails Sent
                  </th>
                  <th className="text-left px-4 py-2 text-xs text-[var(--muted)] font-medium">
                    Resolved
                  </th>
                  <th className="text-left px-4 py-2 text-xs text-[var(--muted)] font-medium">
                    Note
                  </th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr
                    key={issue._id}
                    className="border-b border-gray-50 last:border-0"
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          issue.status === "resolved"
                            ? "bg-green-100 text-green-700"
                            : issue.status === "escalated"
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {issue.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--foreground)]">
                      {formatDate(issue.firstFailedAt)}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {issue.emailCount ?? 0}
                    </td>
                    <td className="px-4 py-3 text-[var(--foreground)]">
                      {formatDate(issue.resolvedAt)}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)] text-xs">
                      {issue.resolutionNote || "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Profile Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="font-semibold text-lg text-[var(--foreground)] mb-4">
              Add Converge Profile
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[var(--muted)] mb-1">
                  Recurring ID *
                </label>
                <input
                  type="text"
                  value={newRecurringId}
                  onChange={(e) => setNewRecurringId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg p-3 text-sm"
                  placeholder="From Converge dashboard (ssl_recurring_id)"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--muted)] mb-1">
                  Label (optional)
                </label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg p-3 text-sm"
                  placeholder='e.g. "SEO Monthly" or "Retainer"'
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--muted)] mb-1">
                  Currency *
                </label>
                <div className="flex gap-3">
                  {(["USD", "CAD"] as const).map((cur) => (
                    <button
                      key={cur}
                      type="button"
                      onClick={() => setNewCurrency(cur)}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition ${
                        newCurrency === cur
                          ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                          : "bg-white text-[var(--muted)] border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      {cur}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                Cancel
              </button>
              <button
                onClick={handleAddProfile}
                disabled={adding || !newRecurringId.trim()}
                className="px-4 py-2 text-sm bg-[var(--accent)] text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
              >
                {adding ? "Adding..." : "Add & Poll"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
