"use client";

import { useState, useEffect, useRef } from "react";

interface Transaction {
  txnId: string;
  terminal: string;
  status: string;
  resultMessage: string;
  txnType?: string;
  amount: number;
  refundedAmount?: number;
  description?: string;
  txnTime?: string;
  cardExpiryMonth?: number;
  cardExpiryYear?: number;
}

interface MonthGroup {
  month: string;
  label: string;
  transactions: Transaction[];
  approvedCount: number;
  totalCollected: number;
  refundCount: number;
  totalRefunded: number;
}

interface Summary {
  totalPaid: number;
  totalRefunded: number;
  paymentCount: number;
  declinedCount: number;
  firstPayment: string | null;
  lastPayment: string | null;
}

interface Props {
  clientName: string;
  onClose: () => void;
}

export default function ClientPaymentHistory({ clientName, onClose }: Props) {
  const [monthlyGroups, setMonthlyGroups] = useState<MonthGroup[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(
      `/api/admin/payments/client-history?clientName=${encodeURIComponent(clientName)}`
    )
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        setMonthlyGroups(data.monthlyGroups || []);
        setSummary(data.summary || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clientName]);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Delay to avoid closing immediately from the click that opened it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function formatAmount(amount: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(amount);
  }

  function formatDate(dateStr?: string) {
    if (!dateStr) return "--";
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  }

  function formatTime(dateStr?: string) {
    if (!dateStr) return "--";
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  }

  function getExpiryStatus(t: Transaction) {
    if (!t.cardExpiryMonth || !t.cardExpiryYear) return null;
    const now = new Date();
    const monthsUntil =
      (t.cardExpiryYear - now.getFullYear()) * 12 +
      (t.cardExpiryMonth - (now.getMonth() + 1));
    const label = `${String(t.cardExpiryMonth).padStart(2, "0")}/${String(t.cardExpiryYear).slice(-2)}`;
    if (monthsUntil <= 1) return { label, color: "red" as const };
    if (monthsUntil <= 3) return { label, color: "yellow" as const };
    return { label: "", color: "green" as const };
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20" />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed top-0 right-0 z-50 h-full w-full max-w-xl bg-white shadow-2xl border-l border-gray-200 overflow-y-auto animate-in slide-in-from-right"
        style={{ animation: "slideIn 0.2s ease-out" }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[var(--foreground)]">
              {clientName}
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition text-[var(--muted)]"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18 18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Summary stats */}
          {summary && (
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div>
                <p className="text-xs text-[var(--muted)]">Total Paid</p>
                <p className="text-lg font-bold text-green-600">
                  {formatAmount(summary.totalPaid)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--muted)]">Payments</p>
                <p className="text-lg font-bold text-[var(--foreground)]">
                  {summary.paymentCount}
                  {summary.declinedCount > 0 && (
                    <span className="text-sm font-normal text-red-400 ml-1">
                      ({summary.declinedCount} declined)
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--muted)]">Client Since</p>
                <p className="text-sm font-medium text-[var(--foreground)] mt-0.5">
                  {formatDate(summary.firstPayment ?? undefined)}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {loading ? (
            <div className="text-center py-16 text-[var(--muted)] text-sm">
              Loading payment history...
            </div>
          ) : monthlyGroups.length === 0 ? (
            <div className="text-center py-16 text-[var(--muted)] text-sm">
              No payment history found.
            </div>
          ) : (
            <div className="space-y-6">
              {monthlyGroups.map((group) => (
                <div key={group.month}>
                  {/* Month header */}
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-[var(--foreground)]">
                      {group.label}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
                      {group.approvedCount > 0 && (
                        <span className="text-green-600 font-medium">
                          {group.approvedCount} payment
                          {group.approvedCount !== 1 ? "s" : ""} —{" "}
                          {formatAmount(group.totalCollected)}
                        </span>
                      )}
                      {group.refundCount > 0 && (
                        <span className="text-blue-600 font-medium">
                          {group.refundCount} refund
                          {group.refundCount !== 1 ? "s" : ""} —{" "}
                          {formatAmount(group.totalRefunded)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Transactions */}
                  <div className="border border-gray-100 rounded-lg overflow-hidden">
                    {group.transactions.map((t) => {
                      const exp = getExpiryStatus(t);
                      return (
                        <div
                          key={t.txnId}
                          className={`flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0 ${
                            t.status === "declined"
                              ? "bg-red-50/50"
                              : t.status === "refund"
                                ? "bg-blue-50/30"
                                : ""
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                                t.status === "approved"
                                  ? "bg-green-100 text-green-700"
                                  : t.status === "refund"
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-red-100 text-red-700"
                              }`}
                            >
                              {t.status === "approved"
                                ? "Paid"
                                : t.status === "refund"
                                  ? "Refund"
                                  : "Declined"}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm text-[var(--foreground)]">
                                {formatTime(t.txnTime)}
                              </p>
                              {t.description && (
                                <p className="text-xs text-[var(--muted)] truncate">
                                  {t.description}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 ml-4">
                            <span
                              className={`text-sm font-semibold ${
                                t.status === "declined"
                                  ? "text-red-600"
                                  : t.status === "refund"
                                    ? "text-blue-600"
                                    : "text-[var(--foreground)]"
                              }`}
                            >
                              {t.status === "refund" ? "-" : ""}
                              {formatAmount(t.amount)}
                            </span>
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                t.terminal === "USD"
                                  ? "bg-blue-50 text-blue-600"
                                  : "bg-purple-50 text-purple-600"
                              }`}
                            >
                              {t.terminal}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Inline animation style */}
        <style jsx>{`
          @keyframes slideIn {
            from {
              transform: translateX(100%);
            }
            to {
              transform: translateX(0);
            }
          }
        `}</style>
      </div>
    </>
  );
}
