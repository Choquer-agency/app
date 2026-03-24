"use client";

import { useState, useEffect, useCallback } from "react";
import { ClientPackage, Package } from "@/types";
import AssignPackageModal from "./AssignPackageModal";
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
      const res = await fetch("/api/admin/packages");
      if (res.ok) {
        setPackages(await res.json());
      }
    } catch {
      // Failed
    }
  }, []);

  useEffect(() => {
    fetchAssignments();
    fetchPackages();
  }, [fetchAssignments, fetchPackages]);

  async function handleRemove(cpId: number) {
    if (!confirm("Remove this package?")) return;
    try {
      await fetch(`/api/admin/clients/${clientId}/packages/${cpId}`, {
        method: "DELETE",
      });
      fetchAssignments();
      onPackagesChanged?.();
    } catch {
      // Failed
    }
  }

  function handleAssigned() {
    setShowAssign(false);
    fetchAssignments();
    onPackagesChanged?.();
  }

  const totalMrr = assignments
    .filter((a) => a.active)
    .reduce((sum, a) => sum + (a.customPrice ?? a.packageDefaultPrice ?? 0), 0);

  function formatCurrency(val: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm text-[var(--muted)]">Total MRR from packages:</span>{" "}
          <span className="text-lg font-bold text-[var(--foreground)]">{formatCurrency(totalMrr)}</span>
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--accent-light)] border-b border-[var(--border)]">
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Package</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Price</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Setup Fee</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Sign-up Date</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Contract</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => {
                const price = a.customPrice ?? a.packageDefaultPrice ?? 0;
                const isCustom = a.customPrice !== null && a.customPrice !== a.packageDefaultPrice;
                return (
                  <tr key={a.id} className="border-b border-[var(--border)] hover:bg-[var(--accent-light)] transition">
                    <td className="px-4 py-3 font-medium text-[var(--foreground)]">{a.packageName}</td>
                    <td className="px-4 py-3">
                      {formatCurrency(price)}/mo <span className="text-[10px] text-[var(--muted)]">{currency}</span>
                      {isCustom && (
                        <span className="ml-1 text-[10px] text-[var(--accent)]">custom</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">
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
                    <td className="px-4 py-3 text-[var(--muted)]">{a.signupDate}</td>
                    <td className={`px-4 py-3 text-xs ${contractStyle(a.contractEndDate)}`}>
                      {contractLabel(a.contractEndDate)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleRemove(a.id)}
                        className="text-xs text-[#b91c1c] hover:text-red-700"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
    </div>
  );
}
