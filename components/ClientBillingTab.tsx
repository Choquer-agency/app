"use client";

import { useEffect, useState } from "react";

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

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
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

function formatShortDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatAmount(amount: number, terminal?: string) {
  const currency = terminal === "CAD" ? "CAD" : "USD";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

export default function ClientBillingTab({ clientName }: { clientName: string }) {
  const [monthlyGroups, setMonthlyGroups] = useState<MonthGroup[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

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

  const allTransactions = monthlyGroups.flatMap((g) => g.transactions);

  if (loading) {
    return (
      <div className="text-center py-16 text-[var(--muted)] text-sm">
        Loading billing history…
      </div>
    );
  }

  if (allTransactions.length === 0) {
    return (
      <div className="text-center py-16 text-[var(--muted)] text-sm">
        No charges on record for this client.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-[var(--border)] p-4" style={{ background: "#FAF9F5" }}>
            <p className="text-xs text-[var(--muted)]">Total Paid</p>
            <p className="text-lg font-bold text-emerald-600 mt-1">
              {formatAmount(summary.totalPaid)}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] p-4" style={{ background: "#FAF9F5" }}>
            <p className="text-xs text-[var(--muted)]">Payments</p>
            <p className="text-lg font-bold text-[var(--foreground)] mt-1">
              {summary.paymentCount}
              {summary.declinedCount > 0 && (
                <span className="text-sm font-normal text-rose-500 ml-1.5">
                  ({summary.declinedCount} declined)
                </span>
              )}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] p-4" style={{ background: "#FAF9F5" }}>
            <p className="text-xs text-[var(--muted)]">Refunded</p>
            <p className="text-lg font-bold text-blue-600 mt-1">
              {formatAmount(summary.totalRefunded)}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] p-4" style={{ background: "#FAF9F5" }}>
            <p className="text-xs text-[var(--muted)]">Client Since</p>
            <p className="text-sm font-medium text-[var(--foreground)] mt-1">
              {formatDate(summary.firstPayment ?? undefined)}
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap w-[90px]">Status</th>
              <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap w-[80px]">Date</th>
              <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Description</th>
              <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap w-[130px]">Amount</th>
              <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap w-[100px]">Card Expiry</th>
            </tr>
          </thead>
          <tbody>
            {allTransactions.map((t) => (
              <tr
                key={t.txnId}
                className={`border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover-tan)] ${
                  t.status === "declined"
                    ? "bg-red-50/50"
                    : t.status === "refund"
                      ? "bg-blue-50/30"
                      : ""
                }`}
              >
                <td className="px-2 py-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      t.status === "approved"
                        ? "bg-green-100 text-green-700"
                        : t.status === "refund"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    {t.status === "approved" ? "Approved" : t.status === "refund" ? "Refund" : "Declined"}
                  </span>
                </td>
                <td className="px-2 py-3 text-[var(--foreground)] whitespace-nowrap">
                  {formatShortDate(t.txnTime)}
                </td>
                <td className="px-2 py-3 text-[var(--muted)] max-w-[320px] truncate">
                  {t.description
                    ? t.description.replace(/^DECLINED:\s*\w+\s*\|\s*/i, "")
                    : "—"}
                </td>
                <td className="px-2 py-3 text-right whitespace-nowrap">
                  <span
                    className={`font-semibold ${
                      t.status === "declined"
                        ? "text-rose-600"
                        : t.status === "refund"
                          ? "text-blue-600"
                          : "text-[var(--foreground)]"
                    }`}
                  >
                    {t.status === "refund" ? "-" : ""}
                    {formatAmount(t.amount, t.terminal)}
                  </span>
                  <span
                    className={`text-xs ml-1.5 px-1.5 py-0.5 rounded font-medium ${
                      t.terminal === "USD"
                        ? "bg-blue-50 text-blue-600"
                        : "bg-purple-50 text-purple-600"
                    }`}
                  >
                    {t.terminal}
                  </span>
                </td>
                <td className="px-2 py-3 text-right whitespace-nowrap">
                  {t.cardExpiryMonth && t.cardExpiryYear
                    ? `${String(t.cardExpiryMonth).padStart(2, "0")}/${String(t.cardExpiryYear).slice(-2)}`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
