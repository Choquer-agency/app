"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ClientPackage, Package } from "@/types";
import AssignPackageModal from "./AssignPackageModal";
import CancelPackageModal from "./CancelPackageModal";
import { friendlyMonth } from "@/lib/date-format";

interface ClientPackagesPanelProps {
  clientId: number;
  clientCountry?: "CA" | "US";
  onPackagesChanged?: () => void;
}

export default function ClientPackagesPanel({ clientId, clientCountry = "US", onPackagesChanged }: ClientPackagesPanelProps) {
  const currency = clientCountry === "CA" ? "CAD" : "USD";
  const [assignments, setAssignments] = useState<ClientPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssign, setShowAssign] = useState(false);
  const [packages, setPackages] = useState<Package[]>([]);
  const [cancelTarget, setCancelTarget] = useState<ClientPackage | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showCanceledHistory, setShowCanceledHistory] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchAssignments = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/packages`);
      if (res.ok) {
        setAssignments(await res.json());
      }
    } catch {
      // Failed
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  const fetchPackages = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/packages?_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" },
      });
      if (res.ok) {
        const data: Package[] = await res.json();
        setPackages(data);
      }
    } catch {
      // Failed
    }
  }, []);

  useEffect(() => {
    fetchAssignments();
    fetchPackages();
  }, [fetchAssignments, fetchPackages]);

  // Close menu on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    if (openMenuId) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [openMenuId]);

  function handleAssigned() {
    setShowAssign(false);
    fetchAssignments();
    onPackagesChanged?.();
  }

  function handleCanceled() {
    setCancelTarget(null);
    fetchAssignments();
    onPackagesChanged?.();
  }

  // Split into groups
  const active = assignments.filter((a) => a.active && !a.isOneTime && !a.canceledAt);
  const canceling = assignments.filter((a) => a.active && !a.isOneTime && a.canceledAt);
  const canceled = assignments.filter((a) => !a.active && !a.isOneTime && a.canceledAt);
  const oneTime = assignments.filter((a) => a.isOneTime);

  const totalMrr = [...active, ...canceling].reduce((sum, a) => sum + (a.customPrice ?? a.packageDefaultPrice ?? 0), 0);
  const totalOneTime = oneTime.reduce((sum, a) => sum + (a.customPrice ?? a.packageDefaultPrice ?? 0), 0);

  function formatCurrency(val: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  }

  function billingLabel(a: ClientPackage) {
    if (a.isOneTime) return "one-time";
    if (a.packageBillingFrequency === "annually") return "yr";
    if (a.packageBillingFrequency === "one_time") return "one-time";
    return "mo";
  }

  function contractLabel(endDate: string | null) {
    if (!endDate) return "Month-to-month";
    const end = new Date(endDate);
    const now = new Date();
    if (end < now) return "Month-to-month";
    return `Ends ${friendlyMonth(endDate)}`;
  }

  function contractStyle(endDate: string | null) {
    if (!endDate) return "text-[var(--muted)]";
    const end = new Date(endDate);
    const now = new Date();
    if (end < now) return "text-[var(--muted)]";
    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 30) return "text-[#FF9500] font-medium";
    return "text-[var(--foreground)]";
  }

  function ThreeDotMenu({ assignment }: { assignment: ClientPackage }) {
    const isOpen = openMenuId === assignment.id;
    return (
      <div className="relative" ref={isOpen ? menuRef : undefined}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpenMenuId(isOpen ? null : assignment.id);
          }}
          className="p-1.5 rounded-md hover:bg-gray-100 transition text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>
        {isOpen && (
          <div className="absolute right-0 bottom-full mb-1 bg-white rounded-lg shadow-lg border border-[var(--border)] py-1 z-50 min-w-[160px]">
            <button
              onClick={() => {
                setOpenMenuId(null);
                setCancelTarget(assignment);
              }}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition"
            >
              Cancel Package
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderActiveRow(a: ClientPackage) {
    const price = a.customPrice ?? a.packageDefaultPrice ?? 0;
    const isCustom = a.customPrice !== null && a.customPrice !== a.packageDefaultPrice;
    return (
      <tr key={a.id} className="border-b border-[var(--border)] hover:bg-[var(--hover-tan)] transition">
        <td className="px-2 py-3 font-medium text-[var(--foreground)]">{a.packageName}</td>
        <td className="px-2 py-3">
          {formatCurrency(price)}/{billingLabel(a)} <span className="text-[10px] text-[var(--muted)]">{currency}</span>
          {isCustom && (
            <span className="ml-1 text-[10px] text-[var(--accent)]">custom</span>
          )}
        </td>
        <td className="px-2 py-3 text-[var(--muted)]">
          {a.applySetupFee ? (
            <>
              {formatCurrency(a.customSetupFee ?? a.packageSetupFee ?? 0)}
              {a.customSetupFee !== null && (
                <span className="ml-1 text-[10px] text-[var(--accent)]">custom</span>
              )}
            </>
          ) : (
            <span className="text-xs">—</span>
          )}
        </td>
        <td className="px-2 py-3 text-[var(--muted)]">{a.signupDate}</td>
        <td className={`px-2 py-3 text-xs ${contractStyle(a.contractEndDate)}`}>
          {contractLabel(a.contractEndDate)}
        </td>
        <td className="px-2 py-3">
          <ThreeDotMenu assignment={a} />
        </td>
      </tr>
    );
  }

  function renderCancelingRow(a: ClientPackage) {
    const price = a.customPrice ?? a.packageDefaultPrice ?? 0;
    return (
      <tr key={a.id} className="border-b border-[var(--border)] bg-amber-50/50">
        <td className="px-2 py-3">
          <span className="font-medium text-[var(--foreground)]">{a.packageName}</span>
          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">
            Canceling
          </span>
        </td>
        <td className="px-2 py-3 text-[var(--muted)]">
          {formatCurrency(price)}/{billingLabel(a)}
        </td>
        <td className="px-2 py-3 text-[var(--muted)]" colSpan={2}>
          Ends {a.effectiveEndDate ? friendlyMonth(a.effectiveEndDate) : "—"}
        </td>
        <td className="px-2 py-3 text-xs text-[var(--muted)]">
          Canceled {a.canceledAt}
          {a.cancellationFee ? ` · Fee: ${formatCurrency(a.cancellationFee)}` : ""}
        </td>
        <td className="px-2 py-3" />
      </tr>
    );
  }

  function renderCanceledRow(a: ClientPackage) {
    const price = a.customPrice ?? a.packageDefaultPrice ?? 0;
    return (
      <tr key={a.id} className="border-b border-[var(--border)] opacity-50">
        <td className="px-2 py-3 font-medium">{a.packageName}</td>
        <td className="px-2 py-3">{formatCurrency(price)}/{billingLabel(a)}</td>
        <td className="px-2 py-3" colSpan={2}>
          {a.signupDate} → {a.effectiveEndDate || "—"}
        </td>
        <td className="px-2 py-3 text-xs">
          {a.canceledBy ? `by ${a.canceledBy}` : ""}
          {a.cancellationFee ? ` · Fee: ${formatCurrency(a.cancellationFee)}` : ""}
        </td>
        <td className="px-2 py-3" />
      </tr>
    );
  }

  function renderOneTimeRow(a: ClientPackage) {
    const price = a.customPrice ?? a.packageDefaultPrice ?? 0;
    const isCustom = a.customPrice !== null && a.customPrice !== a.packageDefaultPrice;
    return (
      <tr key={a.id} className="border-b border-[var(--border)] hover:bg-[var(--hover-tan)] transition">
        <td className="px-2 py-3 font-medium text-[var(--foreground)]">{a.packageName}</td>
        <td className="px-2 py-3">
          {formatCurrency(price)}/{billingLabel(a)} <span className="text-[10px] text-[var(--muted)]">{currency}</span>
          {isCustom && (
            <span className="ml-1 text-[10px] text-[var(--accent)]">custom</span>
          )}
        </td>
        <td className="px-2 py-3 text-[var(--muted)]">{a.paidDate || a.signupDate}</td>
        <td className="px-2 py-3" />
      </tr>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <span className="text-sm text-[var(--muted)]">MRR:</span>{" "}
            <span className="text-lg font-bold text-[var(--foreground)]">{formatCurrency(totalMrr)}</span>
          </div>
          {totalOneTime > 0 && (
            <div>
              <span className="text-sm text-[var(--muted)]">One-time revenue:</span>{" "}
              <span className="text-lg font-bold text-[var(--foreground)]">{formatCurrency(totalOneTime)}</span>
            </div>
          )}
        </div>
        <button
          onClick={() => setShowAssign(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition"
        >
          + Assign Package
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--muted)] text-center py-8">Loading...</p>
      ) : assignments.length === 0 ? (
        <p className="text-sm text-[var(--muted)] text-center py-8">
          No packages assigned yet
        </p>
      ) : (
        <>
          {/* Active + Canceling recurring */}
          {(active.length > 0 || canceling.length > 0) && (
            <div className="overflow-visible">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Package</th>
                    <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Price</th>
                    <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Setup Fee</th>
                    <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Sign-up Date</th>
                    <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Contract</th>
                    <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap" />
                  </tr>
                </thead>
                <tbody>
                  {active.map(renderActiveRow)}
                  {canceling.map(renderCancelingRow)}
                </tbody>
              </table>
            </div>
          )}

          {/* Canceled history */}
          {canceled.length > 0 && (
            <div>
              <button
                onClick={() => setShowCanceledHistory(!showCanceledHistory)}
                className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider hover:text-[var(--foreground)] transition"
              >
                <svg
                  className={`w-3 h-3 transition-transform ${showCanceledHistory ? "rotate-90" : ""}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                Canceled ({canceled.length})
              </button>
              {showCanceledHistory && (
                <div className="overflow-x-auto mt-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Package</th>
                        <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Price</th>
                        <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap" colSpan={2}>Period</th>
                        <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Details</th>
                        <th className="px-2 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {canceled.map(renderCanceledRow)}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* One-time payments */}
          {oneTime.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                One-Time Payments
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Description</th>
                      <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Amount</th>
                      <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Paid Date</th>
                      <th className="px-2 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {oneTime.map(renderOneTimeRow)}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {showAssign && (
        <AssignPackageModal
          clientId={clientId}
          clientCountry={clientCountry}
          packages={packages.filter((p) => p.active)}
          onClose={() => setShowAssign(false)}
          onSaved={handleAssigned}
        />
      )}

      {cancelTarget && (
        <CancelPackageModal
          clientId={String(clientId)}
          assignment={cancelTarget}
          clientCountry={clientCountry}
          onClose={() => setCancelTarget(null)}
          onCanceled={handleCanceled}
        />
      )}
    </div>
  );
}
