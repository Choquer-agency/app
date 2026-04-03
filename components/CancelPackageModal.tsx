"use client";

import { useState, useEffect } from "react";
import { ClientPackage } from "@/types";

interface CancelPackageModalProps {
  clientId: string;
  assignment: ClientPackage;
  clientCountry?: "CA" | "US";
  onClose: () => void;
  onCanceled: () => void;
}

function getEffectiveEndDate(cancelType: "30_day" | "immediate"): string {
  if (cancelType === "immediate") {
    return new Date().toISOString().split("T")[0];
  }
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  return lastDay.toISOString().split("T")[0];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function CancelPackageModal({
  clientId,
  assignment,
  clientCountry = "US",
  onClose,
  onCanceled,
}: CancelPackageModalProps) {
  const [cancelType, setCancelType] = useState<"30_day" | "immediate">("30_day");
  const [cancellationFee, setCancellationFee] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const effectiveEnd30 = getEffectiveEndDate("30_day");
  const pkgName = assignment.packageName || "this package";
  const hasContract = assignment.contractEndDate && new Date(assignment.contractEndDate) > new Date();

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    try {
      const body: Record<string, unknown> = { cancelType };
      if (cancellationFee && Number(cancellationFee) > 0) {
        body.cancellationFee = Number(cancellationFee);
      }
      const res = await fetch(`/api/admin/clients/${clientId}/packages/${assignment.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to cancel package");
      }
      onCanceled();
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full mx-4 flex flex-col">
        <h2 className="text-lg font-semibold px-8 pt-8 pb-2">
          Cancel {pkgName}
        </h2>
        <p className="text-sm text-[var(--muted)] px-8 pb-4">
          This will not delete the package — it will be marked as canceled and remain in the client's history.
        </p>

        <div className="px-8 space-y-4">
          {/* Cancel type */}
          <div className="space-y-2">
            <label
              onClick={() => setCancelType("30_day")}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                cancelType === "30_day"
                  ? "border-[var(--accent)] bg-[var(--accent-light)]"
                  : "border-[var(--border)] hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="cancelType"
                checked={cancelType === "30_day"}
                onChange={() => setCancelType("30_day")}
                className="mt-0.5 accent-[var(--accent)]"
              />
              <div>
                <div className="text-sm font-medium text-[var(--foreground)]">Cancel with 30-day notice</div>
                <div className="text-xs text-[var(--muted)] mt-0.5">
                  One more payment cycle. Package stays active until {formatDate(effectiveEnd30)}.
                </div>
              </div>
            </label>

            <label
              onClick={() => setCancelType("immediate")}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                cancelType === "immediate"
                  ? "border-red-400 bg-red-50"
                  : "border-[var(--border)] hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="cancelType"
                checked={cancelType === "immediate"}
                onChange={() => setCancelType("immediate")}
                className="mt-0.5 accent-red-500"
              />
              <div>
                <div className="text-sm font-medium text-[var(--foreground)]">Cancel immediately</div>
                <div className="text-xs text-[var(--muted)] mt-0.5">
                  No further payments. Effective today.
                </div>
              </div>
            </label>
          </div>

          {/* Early cancellation fee */}
          {hasContract && (
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                Early cancellation fee
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cancellationFee}
                  onChange={(e) => setCancellationFee(e.target.value)}
                  placeholder="0"
                  className="w-full pl-7 pr-3 py-2 text-sm border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)]"
                />
              </div>
              <p className="text-xs text-[var(--muted)] mt-1">
                Contract ends {formatDate(assignment.contractEndDate!)}. Apply a fee if canceling early.
              </p>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-8 py-6">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-gray-50 rounded-lg transition"
          >
            Back
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-50"
          >
            {submitting ? "Canceling..." : "Confirm Cancellation"}
          </button>
        </div>
      </div>
    </div>
  );
}
