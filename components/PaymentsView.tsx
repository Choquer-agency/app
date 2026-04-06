"use client";

import { useState, useEffect } from "react";
import DatePicker from "@/components/DatePicker";
import CreateClientFromPaymentModal from "@/components/CreateClientFromPaymentModal";
import ClientPaymentHistory from "@/components/ClientPaymentHistory";

interface Transaction {
  txnId: string;
  terminal: "USD" | "CAD";
  status: "approved" | "declined" | "refund";
  resultMessage: string;
  transStatus: string;
  txnType?: string;
  amount: number;
  refundedAmount?: number;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  description: string | null;
  cardType: string | null;
  cardLastFour: string | null;
  cardExpiryMonth: number | null;
  cardExpiryYear: number | null;
  recurringId: string | null;
  txnTime: string | null;
  settleTime: string | null;
  approvalCode: string | null;
  clientName: string | null;
}

interface Summary {
  total: number;
  approvedCount: number;
  declinedCount: number;
  declinedRetries: number;
  totalCollected: number;
  totalDeclined: number;
  refundCount: number;
  totalRefunded: number;
}

function formatConvergeDate(dateStr: string): string {
  // Convert YYYY-MM-DD to MM/DD/YYYY for Converge API
  const [y, m, d] = dateStr.split("-");
  return `${m}/${d}/${y}`;
}

function getDefaultDates() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const sy = start.getFullYear();
  const sm = String(start.getMonth() + 1).padStart(2, "0");
  const sd = String(start.getDate()).padStart(2, "0");
  const ey = now.getFullYear();
  const em = String(now.getMonth() + 1).padStart(2, "0");
  const ed = String(now.getDate()).padStart(2, "0");
  return {
    start: `${sy}-${sm}-${sd}`,
    end: `${ey}-${em}-${ed}`,
  };
}

export default function PaymentsView() {
  const defaults = getDefaultDates();
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "approved" | "declined" | "refund">("all");
  const [terminalFilter, setTerminalFilter] = useState<"all" | "USD" | "CAD">("all");
  const [createFromTxn, setCreateFromTxn] = useState<Transaction | null>(null);
  const [historyClient, setHistoryClient] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData(forceSync = false) {
    setLoading(true);
    if (forceSync) setSyncing(true);
    try {
      const start = formatConvergeDate(startDate);
      const end = formatConvergeDate(endDate);
      const syncParam = forceSync ? "&sync=true" : "";
      const res = await fetch(
        `/api/admin/payments?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}${syncParam}`
      );
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
        setSummary(data.summary || null);
      }
    } catch {}
    setLoading(false);
    setSyncing(false);
  }

  const filtered = transactions.filter((t) => {
    if (filter !== "all" && t.status !== filter) return false;
    if (terminalFilter !== "all" && t.terminal !== terminalFilter) return false;
    return true;
  });

  function formatAmount(amount: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD", // just for $ symbol formatting
      minimumFractionDigits: 2,
    }).format(amount);
  }

  function formatCurrency(amount: number, currency: string) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  }

  function formatTime(dateStr: string | null) {
    if (!dateStr) return "--";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  }

  function getCompanyOrName(t: Transaction) {
    // Prioritize our linked client name from Convex
    if (t.clientName) return t.clientName;
    // Fall back to Converge company field
    if (t.company) return t.company;
    // Try to extract company from description (e.g. "Breathe Easy Remodeling - SEO")
    const desc = t.description || "";
    const dashIdx = desc.indexOf(" - ");
    if (dashIdx > 0 && dashIdx < 40) return desc.substring(0, dashIdx);
    // Last resort: cardholder name
    const name = [t.firstName, t.lastName].filter(Boolean).join(" ");
    if (name) return name;
    return "--";
  }

  function getExpiryStatus(t: Transaction): { label: string; color: "green" | "yellow" | "red" } {
    if (!t.cardExpiryMonth || !t.cardExpiryYear) return { label: "--", color: "green" };
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const monthsUntil = (t.cardExpiryYear - currentYear) * 12 + (t.cardExpiryMonth - currentMonth);

    if (monthsUntil <= 1) return { label: `${String(t.cardExpiryMonth).padStart(2, "0")}/${String(t.cardExpiryYear).slice(-2)}`, color: "red" };
    if (monthsUntil <= 3) return { label: `${String(t.cardExpiryMonth).padStart(2, "0")}/${String(t.cardExpiryYear).slice(-2)}`, color: "yellow" };
    return { label: "", color: "green" };
  }

  // Separate totals by currency
  const usdApproved = transactions.filter((t) => t.terminal === "USD" && t.status === "approved");
  const cadApproved = transactions.filter((t) => t.terminal === "CAD" && t.status === "approved");
  const usdTotal = usdApproved.reduce((s, t) => s + t.amount, 0);
  const cadTotal = cadApproved.reduce((s, t) => s + t.amount, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-[var(--foreground)]">Payments</h1>
        <div className="flex items-center gap-3">
          <DatePicker
            value={startDate}
            onChange={(v) => setStartDate(v || defaults.start)}
            placeholder="Start date"
          />
          <span className="text-[var(--muted)] text-sm">to</span>
          <DatePicker
            value={endDate}
            onChange={(v) => setEndDate(v || defaults.end)}
            placeholder="End date"
          />
          <button
            onClick={() => fetchData(false)}
            disabled={loading}
            className="px-4 py-2 text-sm bg-gray-100 text-[var(--foreground)] rounded-lg font-medium hover:bg-gray-200 disabled:opacity-50"
          >
            {loading && !syncing ? "Loading..." : "Refresh"}
          </button>
          <button
            onClick={() => fetchData(true)}
            disabled={loading}
            className="px-4 py-2 text-sm bg-[var(--accent)] text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
            title="Pull latest transactions from Converge"
          >
            {syncing ? "Syncing..." : "Sync from Converge"}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {summary && !loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-[var(--muted)] mb-1">
              Collected USD <span className="text-[var(--muted)]">({usdApproved.length})</span>
            </p>
            <p className="text-2xl font-bold text-green-600">
              {formatAmount(usdTotal)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-[var(--muted)] mb-1">
              Collected CAD <span className="text-[var(--muted)]">({cadApproved.length})</span>
            </p>
            <p className="text-2xl font-bold text-green-600">
              {formatAmount(cadTotal)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-[var(--muted)] mb-1">Declined</p>
            <p className="text-2xl font-bold text-red-600">
              {summary.declinedCount}
              {summary.totalDeclined > 0 && (
                <span className="text-sm font-normal text-red-400 ml-2">
                  {formatAmount(summary.totalDeclined)}
                </span>
              )}
            </p>
            {summary.declinedRetries > 0 && (
              <p className="text-xs text-[var(--muted)] mt-1">
                +{summary.declinedRetries} retries
              </p>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-[var(--muted)] mb-1">Refunded</p>
            <p className="text-2xl font-bold text-blue-600">
              {summary.refundCount}
              {summary.totalRefunded > 0 && (
                <span className="text-sm font-normal text-blue-400 ml-2">
                  {formatAmount(summary.totalRefunded)}
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {(["all", "approved", "declined", "refund"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                filter === f
                  ? "bg-white text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {f === "all" ? "All" : f === "approved" ? "Approved" : f === "declined" ? "Declined" : "Refunds"}
            </button>
          ))}
        </div>
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {(["all", "USD", "CAD"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setTerminalFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                terminalFilter === f
                  ? "bg-white text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {f === "all" ? "All" : f}
            </button>
          ))}
        </div>
        <span className="text-xs text-[var(--muted)] ml-auto">
          {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-[var(--muted)] text-sm">
          Fetching transactions from Converge...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-[var(--muted)] text-sm">
          No transactions found for this period.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs text-[var(--muted)] font-medium">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs text-[var(--muted)] font-medium">
                  Date
                </th>
                <th className="text-left px-4 py-3 text-xs text-[var(--muted)] font-medium">
                  Company
                </th>
                <th className="text-left px-4 py-3 text-xs text-[var(--muted)] font-medium">
                  Description
                </th>
                <th className="text-right px-4 py-3 text-xs text-[var(--muted)] font-medium">
                  Amount
                </th>
                <th className="text-center px-4 py-3 text-xs text-[var(--muted)] font-medium">
                  Card Expiry
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr
                  key={t.txnId}
                  className={`border-b border-gray-50 last:border-0 ${
                    t.status === "declined" ? "bg-red-50/50" : t.status === "refund" ? "bg-blue-50/30" : ""
                  }`}
                >
                  <td className="px-4 py-3">
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
                  <td className="px-4 py-3 text-[var(--foreground)] whitespace-nowrap">
                    {formatTime(t.txnTime)}
                  </td>
                  <td className="px-4 py-3">
                    {t.clientName ? (
                      <button
                        onClick={() => setHistoryClient(t.clientName!)}
                        className="text-[var(--foreground)] font-medium hover:text-[var(--accent)] transition text-left"
                      >
                        {t.clientName}
                      </button>
                    ) : (
                      <button
                        onClick={() => setCreateFromTxn(t)}
                        className="group flex items-center gap-1.5"
                      >
                        <span className="text-[var(--foreground)] font-medium">
                          {getCompanyOrName(t)}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium opacity-70 group-hover:opacity-100 transition">
                          + Link
                        </span>
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)] max-w-[300px] truncate">
                    {t.description
                      ? t.description.replace(/^DECLINED:\s*\w+\s*\|\s*/i, "")
                      : "--"}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <span
                      className={`font-semibold ${
                        t.status === "declined"
                          ? "text-red-600"
                          : t.status === "refund"
                            ? "text-blue-600"
                            : "text-[var(--foreground)]"
                      }`}
                    >
                      {t.status === "refund" ? "-" : ""}{formatAmount(t.amount)}
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
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    {(() => {
                      const exp = getExpiryStatus(t);
                      if (exp.color === "green") {
                        return <span className="text-green-500" title="Card expiry OK">&#10003;</span>;
                      }
                      if (exp.color === "yellow") {
                        return (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium" title="Expiring within 3 months">
                            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                            {exp.label}
                          </span>
                        );
                      }
                      return (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium" title="Expiring within 1 month">
                          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                          {exp.label}
                        </span>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Client payment history panel */}
      {historyClient && (
        <ClientPaymentHistory
          clientName={historyClient}
          onClose={() => setHistoryClient(null)}
        />
      )}

      {/* Create client from payment modal */}
      {createFromTxn && (
        <CreateClientFromPaymentModal
          transaction={createFromTxn}
          onClose={() => setCreateFromTxn(null)}
          onCreated={() => {
            setCreateFromTxn(null);
            fetchData();
          }}
        />
      )}
    </div>
  );
}
